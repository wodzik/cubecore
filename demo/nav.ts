/**
 * Shared menu for the demo pages: imported by every page script, it puts a
 * bar with all demos at the top and highlights the current one. Add a demo
 * here (and a route in serve.ts) and every page lists it.
 */

export const DEMOS = [
  { path: "/", title: "Core", hint: "State, notation, colour-neutral method tracking, masks, pictures, timeline" },
  { path: "/render", title: "3D renderer", hint: "Skins, tiles and pieces, decals and features, masks, back view, gyro" },
  { path: "/playground", title: "Playground", hint: "Every <cube-player> option: setup, 'algorithm solves the cube', timing, skins, theme, 2D views, masks — with the code" },
  { path: "/player", title: "Player", hint: "<cube-player>: controls, progress bar, theming, your own controls" },
  { path: "/react", title: "React", hint: "@cubecore/react: <CubePlayer>, <CubeAlg>, <CubeScramble>, useSmartCube, useSolverWorker" },
  { path: "/sequences", title: "Scramble & practice", hint: "Test <cube-scramble> (generated or your own) and <cube-alg-practice> (hide / hint / restart) on a smart cube, with turn arrows" },
  { path: "/analyze", title: "Analyzer", hint: "Scramble analysis (CFOP): per cross colour — optimal cross, best pair order, F2L / OLL / PLL cases" },
  { path: "/bld", title: "Blindfolded", hint: "Old Pochmann: letters on the stickers, memo from a scramble, execution followed letter by letter on a smart cube" },
  { path: "/bluetooth", title: "Smart cube", hint: "Bluetooth cubes live: moves with the cube's clock, written log, stages, gyro — or a simulated cube" },
] as const;

const CSS = `
.cc-nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 4px; padding: 8px 16px;
  background: color-mix(in srgb, #0b0b0c 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid #2a2a2e;
  font: 13px/1 system-ui, sans-serif; overflow-x: auto; scrollbar-width: none; }
.cc-nav .brand { font-weight: 700; color: #e6e6e6; margin-right: 10px; letter-spacing: 0.02em; white-space: nowrap; }
.cc-nav a { color: #8b8b93; text-decoration: none; padding: 7px 11px; border-radius: 8px; white-space: nowrap; }
.cc-nav a:hover { color: #e6e6e6; background: #1c1c20; }
.cc-nav a[aria-current="page"] { color: #e6e6e6; background: #232327; box-shadow: inset 0 0 0 1px #34343a; }
`;

function mount(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const nav = document.createElement("nav");
  nav.className = "cc-nav";
  nav.setAttribute("aria-label", "Demos");
  const here = location.pathname.replace(/\/$/, "") || "/";
  nav.innerHTML =
    `<span class="brand">cubecore</span>` +
    DEMOS.map((d) => `<a href="${d.path}" title="${d.hint.replace(/</g, "&lt;")}"${d.path === here ? ' aria-current="page"' : ""}>${d.title}</a>`).join("");
  document.body.prepend(nav);
}

mount();
