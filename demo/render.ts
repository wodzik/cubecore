import { type Mask, MethodTracker, applyMoves, formatMove, invert, parseAlg, solvedState, spinsAfter } from "../packages/core/src/index";
import { CFOP } from "../packages/cfop/src/index";
import { MASK_NAMES, maskByName } from "../packages/methods/src/index";
import { SvgCache, svgKey } from "../packages/image/src/index";
import { type BackView, CubeRenderer, SKINS, type Skin, showPosition } from "../packages/render/src/index";
import { ReplayClock, recording } from "../packages/timeline/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const renderer = new CubeRenderer($("stage"));

for (const f of ["U", "R", "F", "D", "L", "B", "M"]) for (const suffix of ["", "'"]) {
  const b = document.createElement("button");
  b.textContent = f + suffix;
  b.onclick = () => renderer.animate(parseAlg(f + suffix)[0]);
  $("moveButtons").appendChild(b);
}
$("run").onclick = async () => {
  for (const m of parseAlg($<HTMLInputElement>("alg").value)) await renderer.animate(m);
};
const SCR = "D2 F' L2 U R2 B' D L' F2 U' R B2 L D' F R' U2 B L2 D";
// A permutation can't say how the centres are turned: pass the spins so the logo keeps its orientation.
$("scramble").onclick = () => renderer.setState(applyMoves(solvedState(), SCR), spinsAfter(solvedState(), SCR));
$("reset").onclick = () => renderer.setState(solvedState());
// Smart cubes can send moves faster than any fixed tempo: queued moves must not lag behind.
$("burst").onclick = () => {
  const t0 = performance.now();
  const ms = parseAlg("(R U R' U')5");
  Promise.all(ms.map((m) => renderer.animate(m))).then(() => ($("info").textContent = `20 queued moves caught up in ${Math.round(performance.now() - t0)} ms`));
};

// ─── replay ───
const SOLUTION = parseAlg("F2 R' D L2 R U R' L' U' L R' U' R L U L' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' U");
const START = applyMoves(solvedState(), invert(SOLUTION));
const tracker = new MethodTracker(CFOP, START);
const stageStart = new Set([0]);
SOLUTION.forEach((m, i) => {
  const n = tracker.boundaries.length;
  tracker.push(m);
  if (tracker.boundaries.length > n) stageStart.add(i + 1);
});
let t = 0;
const rec = recording(
  "",
  SOLUTION.map((m, i) => [formatMove(m), (t += stageStart.has(i) ? 700 : 130)] as [string, number]),
  t + 100,
);
const clock = new ReplayClock(rec, { maxAnimMs: 110 });
clock.onChange((time, pos) => {
  showPosition(renderer, START, SOLUTION, pos);
  $("clock").textContent = `${(time / 1000).toFixed(2)} s · move ${pos.applied}/${SOLUTION.length}`;
  $<HTMLInputElement>("scrub").value = String(Math.round((time / rec.totalMs) * 1000));
  $("play").textContent = clock.isPlaying ? "Pause" : "Play";
});
$("play").onclick = () => (clock.isPlaying ? clock.pause() : clock.play());
$("rate").onchange = () => (clock.rate = Number($<HTMLSelectElement>("rate").value));
$("scrub").oninput = () => {
  clock.pause();
  clock.seek((Number($<HTMLInputElement>("scrub").value) / 1000) * rec.totalMs);
};

// ─── look ───
// Demo-only skins: a brand logo supplied by the app (the library ships none), and custom SVG tile outlines.
const DEMO_SKINS: Record<string, Skin> = {
  ...SKINS,
  "gan + logo": { ...SKINS.gan, logo: { sticker: 4, image: "/assets/gan-logo.png", size: 0.72, blend: "multiply" } },
  "gan i4 + logo": { ...SKINS.ganI4, logo: { sticker: 4, image: "/assets/gan-logo.png", size: 0.62, blend: "multiply" } },
  "custom SVG tiles": {
    ...SKINS.stickerless,
    stickers: {
      ...SKINS.stickerless.stickers,
      // Paths in a 0..1 box, face centre towards the bottom-right (corner) / bottom (edge).
      paths: {
        corner: "M0 0 H1 V0.62 L0.62 1 H0 Z",
        edge: "M0 0 H1 V0.72 Q0.5 1.12 0 0.72 Z",
        center: "M0.5 0 A0.5 0.5 0 1 1 0.5 1 A0.5 0.5 0 1 1 0.5 0 Z",
      },
    },
  },
};
for (const name of Object.keys(DEMO_SKINS)) $<HTMLSelectElement>("skin").add(new Option(name, name));
for (const p of MASK_NAMES) $<HTMLSelectElement>("mask").add(new Option(p, p));
let skin: Skin = SKINS.standard;
let mask: Mask | null = null;
function applySkin() {
  const base = DEMO_SKINS[$<HTMLSelectElement>("skin").value];
  skin = base;
  renderer.setSkin({ ...base, hints: { ...base.hints, enabled: $<HTMLInputElement>("hints").checked } });
}
$("backview").onchange = () => renderer.setBackView($<HTMLSelectElement>("backview").value as BackView);
$("skin").onchange = applySkin;
$("hints").onchange = applySkin;
$("mask").onchange = () => {
  const v = $<HTMLSelectElement>("mask").value;
  mask = v ? maskByName(v) : null;
  renderer.setMask(mask);
};
// showPartial: the current state with one layer frozen part-way through a turn.
const holdPartial = () => {
  const move = parseAlg($<HTMLSelectElement>("partialMove").value)[0];
  renderer.showPartial(renderer.currentState, move, Number($<HTMLInputElement>("partial").value) / 100, renderer.currentSpins);
};
$("partial").oninput = holdPartial;
$("partialMove").onchange = holdPartial;
const camera = () => renderer.setCamera({ latitude: Number($<HTMLInputElement>("lat").value), longitude: Number($<HTMLInputElement>("lon").value) });
$("lat").oninput = camera;
$("lon").oninput = camera;

// Simulated gyroscope: a gentle wobble fed through setOrientation, the same call a smart cube's gyro would use.
let gyroTimer = 0;
$("gyro").onchange = () => {
  clearInterval(gyroTimer);
  if (!$<HTMLInputElement>("gyro").checked) return renderer.setOrientation(null);
  const t0 = performance.now();
  gyroTimer = window.setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    const ax = 0.25 * Math.sin(s * 1.3), ay = 0.4 * Math.sin(s * 0.7);
    // quaternion from small Euler angles (x then y)
    const cx = Math.cos(ax / 2), sx = Math.sin(ax / 2), cy = Math.cos(ay / 2), sy = Math.sin(ay / 2);
    renderer.setOrientation({ x: sx * cy, y: cx * sy, z: -sx * sy, w: cx * cy }, 0.8);
  }, 50);
};

// ─── the same skin in 2D (@cubecore/image) ───
// Pictures follow whatever the 3D view shows — same colours, tile shapes, logo and its orientation.
const pictures = new SvgCache(200);
let shown = "";
setInterval(() => {
  const state = renderer.currentState, spins = renderer.currentSpins;
  const opts = (view: "iso" | "top" | "net") => ({ view, size: view === "net" ? 260 : 150, skin, spins, ...(mask ? { mask } : {}) });
  const key = svgKey(state, opts("net"));
  if (key === shown) return;
  shown = key;
  $("flat").innerHTML = (["iso", "top", "net"] as const).map((v) => pictures.get(state, opts(v))).join("");
}, 100);
