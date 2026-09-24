/**
 * Demo server: the two pages (bundled by Bun on the fly) plus static files
 * from demo/assets (e.g. a brand logo you supply locally — that folder is
 * git-ignored). Run: bun run demo
 */
import index from "./index.html";
import render from "./render.html";
import player from "./player.html";
import bluetooth from "./bluetooth.html";
import playground from "./playground.html";

// Bun's HTML dev bundler leaves `new URL("./worker.ts", import.meta.url)` alone, so the demo builds the
// solver worker itself and serves it; pages pass this URL to createSolverWorker.
let solverWorker: Promise<string> | null = null;
const buildSolverWorker = () =>
  (solverWorker ??= Bun.build({ entrypoints: [`${import.meta.dir}/../packages/solve/src/worker.ts`], target: "browser", format: "esm" }).then((r) => r.outputs[0].text()));

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
    "/solver-worker.js": async () => new Response(await buildSolverWorker(), { headers: { "content-type": "text/javascript" } }),
    "/assets/*": (req) => {
      const name = new URL(req.url).pathname.replace(/^\/assets\//, "");
      if (name.includes("..")) return new Response("Not found", { status: 404 });
      const file = Bun.file(`${import.meta.dir}/assets/${name}`);
      return file.exists().then((ok) => (ok ? new Response(file) : new Response("Not found", { status: 404 })));
    },
  },
});
console.log(`cubecore demo: http://localhost:${port}/  ·  3D: http://localhost:${port}/render  ·  player: http://localhost:${port}/player`);
