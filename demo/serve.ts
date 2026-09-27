/**
 * Demo server: the pages (bundled by Bun on the fly) plus static files under
 * /assets from a folder OUTSIDE the repo — brand logos you supply yourself
 * (qiyi-logo.png, moyu-logo.png, gan-logo.png; trademarks, never committed).
 * Folder: $CUBECORE_ASSETS, default ../cubecore-assets next to the repo.
 * Without it the demo works, just without logos. Run: bun run demo
 */
import index from "./index.html";
import render from "./render.html";
import player from "./player.html";
import bluetooth from "./bluetooth.html";
import playground from "./playground.html";
import react from "./react.html";
import sequences from "./sequences.html";
import bld from "./bld.html";
import analyze from "./analyze.html";
import skins from "./skins.html";

// Bun's HTML dev bundler leaves `new URL("./worker.ts", import.meta.url)` alone, so the demo builds the
// solver worker itself and serves it; pages pass this URL to createSolverWorker.
let solverWorker: Promise<string> | null = null;
const buildSolverWorker = () =>
  (solverWorker ??= Bun.build({ entrypoints: [`${import.meta.dir}/../packages/solve/src/worker.ts`], target: "browser", format: "esm" }).then((r) => r.outputs[0].text()));

let analyzerWorker: Promise<string> | null = null;
const buildAnalyzerWorker = () =>
  (analyzerWorker ??= Bun.build({ entrypoints: [`${import.meta.dir}/../packages/analyze/src/worker.ts`], target: "browser", format: "esm" }).then((r) => r.outputs[0].text()));

const assets = process.env.CUBECORE_ASSETS ?? `${import.meta.dir}/../../cubecore-assets`;

const port = Number(process.env.PORT ?? 3000);
Bun.serve({
  port,
  development: true,
  routes: {
    "/": index,
    "/render": render,
    "/player": player,
    "/bluetooth": bluetooth,
    "/playground": playground,
    "/react": react,
    "/sequences": sequences,
    "/bld": bld,
    "/analyze": analyze,
    "/skins": skins,
    "/analyzer-worker.js": async () => new Response(await buildAnalyzerWorker(), { headers: { "content-type": "text/javascript" } }),
    "/solver-worker.js": async () => new Response(await buildSolverWorker(), { headers: { "content-type": "text/javascript" } }),
    "/assets/*": (req) => {
      const name = new URL(req.url).pathname.replace(/^\/assets\//, "");
      if (name.includes("..")) return new Response("Not found", { status: 404 });
      const file = Bun.file(`${assets}/${name}`);
      return file.exists().then((ok) => (ok ? new Response(file) : new Response("Not found", { status: 404 })));
    },
  },
});
console.log(`cubecore demo: http://localhost:${port}/  ·  3D: http://localhost:${port}/render  ·  player: http://localhost:${port}/player`);
