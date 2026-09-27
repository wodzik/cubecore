/**
 * Builds the npm package `@wodzik/cubecore` in dist/package — one package, a
 * subpath per workspace package (@wodzik/cubecore/core, …/render…):
 *
 *   bun scripts/build-npm.ts [version]
 *   cd dist/package && npm publish          (you, after checking it)
 *
 * tsc emits JavaScript + declarations file by file (module structure kept, so
 * `new URL("./worker.js", import.meta.url)` stays next to the worker and
 * bundlers pick it up); then every import is rewritten to a relative path
 * with an extension, so the output runs as plain ESM in browsers, Node and Bun.
 */
import { $ } from "bun";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const build = join(root, "dist/build");
const out = join(root, "dist/package");
const rootPkg = await Bun.file(join(root, "package.json")).json();
const version = process.argv[2] ?? rootPkg.version ?? "0.0.0";

await $`rm -rf ${join(root, "dist")}`;
await $`bunx tsc -p ${join(root, "tsconfig.build.json")}`.cwd(root);

// dist/build/<pkg>/src/… → dist/package/<pkg>/…
const packages = readdirSync(build).filter((p) => existsSync(join(build, p, "src")));
for (const p of packages) await $`mkdir -p ${join(out, p)} && cp -R ${join(build, p, "src")}/. ${join(out, p)}`;
await $`rm -rf ${build}`;

// ─── rewrite import specifiers ───

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const files = walk(out).filter((f) => /\.(js|d\.ts)$/.test(f));

/** Where a specifier points in dist/package (a file without extension), or null to leave it. */
function target(spec: string, from: string): string | null {
  const scoped = /^@cubecore\/([^/]+)(\/.+)?$/.exec(spec);
  if (scoped) return join(out, scoped[1], scoped[2] ? scoped[2].slice(1) : "index");
  if (!spec.startsWith(".")) return null; // three, react, rxjs… — the consumer's
  const base = join(dirname(from), spec.replace(/\.ts$/, ""));
  if (existsSync(`${base}.js`)) return base;
  if (existsSync(join(base, "index.js"))) return join(base, "index");
  throw new Error(`${relative(out, from)}: can't resolve "${spec}"`);
}

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bnew URL\(\s*)(["'])([^"']+)\2/g;
for (const file of files) {
  const text = await Bun.file(file).text();
  const next = text.replace(SPECIFIER, (all, lead: string, q: string, spec: string) => {
    const to = target(spec, file);
    if (!to) return all;
    let rel = relative(dirname(file), to);
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `${lead}${q}${rel}.js${q}`;
  });
  // Web Bluetooth types (BluetoothDevice…) come from @types/web-bluetooth, a dependency.
  const typed = file.endsWith(".d.ts") && /\bBluetooth[A-Z]/.test(next) ? `/// <reference types="web-bluetooth" />\n${next}` : next;
  if (typed !== text) await Bun.write(file, typed);
}

// ─── package.json, README, LICENSE ───

const entries: Record<string, string> = Object.fromEntries(packages.map((p) => [p, `${p}/index`]));
entries["image/png-node"] = "image/png-node";
const exports: Record<string, unknown> = {};
for (const [sub, file] of Object.entries(entries)) exports[`./${sub}`] = { types: `./${file}.d.ts`, import: `./${file}.js` };
exports["./package.json"] = "./package.json";

// Runtime dependencies of the workspace packages that aren't workspace packages themselves.
const dependencies: Record<string, string> = {};
for (const p of packages) {
  const pkg = await Bun.file(join(root, "packages", p, "package.json")).json();
  for (const [name, range] of Object.entries(pkg.dependencies ?? {})) if (!name.startsWith("@cubecore/")) dependencies[name] = range as string;
}
dependencies["@types/web-bluetooth"] = rootPkg.devDependencies["@types/web-bluetooth"];

const pkg = {
  name: "@wodzik/cubecore",
  publishConfig: { access: "public" },
  version,
  description: "A 3×3×3 cube library for the web, built around smart (Bluetooth) cubes: state, notation, methods, solvers and scrambles, a three.js renderer with skins, pictures, web components, React bindings.",
  license: "MPL-2.0",
  author: "Tomasz Wodzikowski <wodziszczakow@gmail.com>",
  repository: { type: "git", url: "git+https://github.com/wodzik/cubecore.git" },
  homepage: "https://github.com/wodzik/cubecore#readme",
  bugs: "https://github.com/wodzik/cubecore/issues",
  keywords: ["rubiks-cube", "speedcubing", "cube", "smart-cube", "bluetooth", "solver", "scramble", "three", "web-components", "react", "cfop", "roux", "zz"],
  type: "module",
  exports,
  // Modules that register something when imported — a bundler must keep them:
  // the elements, the built-in skin features, the smart-cube protocols.
  sideEffects: ["./element/index.js", "./react/index.js", "./skin/attachments.js", "./bluetooth/vendor/**"],
  dependencies,
  peerDependencies: { three: ">=0.160", react: ">=18", "@resvg/resvg-js": ">=2" },
  peerDependenciesMeta: { three: { optional: true }, react: { optional: true }, "@resvg/resvg-js": { optional: true } },
};
// Guard: a module that registers something at the top level (a protocol, a feature, an element)
// must be listed in sideEffects — else bundlers drop it and the registry is empty in apps.
const glob = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "§").replace(/\*/g, "[^/]*").replace(/§/g, ".*")}$`);
const kept = pkg.sideEffects.map(glob);
for (const file of files.filter((f) => f.endsWith(".js"))) {
  const text = await Bun.file(file).text();
  if (!/^(registerProtocol|defineFeature|define[A-Z]\w*|customElements\.define)\(/m.test(text)) continue;
  const rel = `./${relative(out, file)}`;
  if (!kept.some((r) => r.test(rel))) throw new Error(`${rel} registers something when imported but isn't in sideEffects`);
}
await Bun.write(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

const blob = "https://github.com/wodzik/cubecore/blob/main/";
const readme = (await Bun.file(join(root, "README.md")).text()).replace(/\]\((docs\/[^)]+)\)/g, `](${blob}$1)`);
await Bun.write(join(out, "README.md"), readme);
await $`cp ${join(root, "LICENSE")} ${join(out, "LICENSE")}`;

console.log(`@wodzik/cubecore ${version} → ${relative(root, out)} (${files.length} files, ${packages.length} subpaths)`);
