/**
 * Demo server: the two pages (bundled by Bun on the fly) plus static files
 * from demo/assets (e.g. a brand logo you supply locally — that folder is
 * git-ignored). Run: bun run demo
 */
import index from "./index.html";
import render from "./render.html";

const port = Number(process.env.PORT ?? 3000);
Bun.serve({
  port,
  development: true,
  routes: {
    "/": index,
    "/render": render,
    "/assets/*": (req) => {
      const name = new URL(req.url).pathname.replace(/^\/assets\//, "");
      if (name.includes("..")) return new Response("Not found", { status: 404 });
      const file = Bun.file(`${import.meta.dir}/assets/${name}`);
      return file.exists().then((ok) => (ok ? new Response(file) : new Response("Not found", { status: 404 })));
    },
  },
});
console.log(`cubecore demo: http://localhost:${port}/  ·  3D: http://localhost:${port}/render`);
