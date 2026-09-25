import "./nav";
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
  "gan + logo": { ...SKINS.gan, decals: [{ select: { stickers: [4] }, image: "/assets/gan-logo.png", size: 0.72, blend: "multiply" }] },
  // Finishes and coloured plastic (new skin options): the same cube matte, UV-coated, and moulded in colour.
  "gan 356 m matte": { ...SKINS.gan356m, stickers: { ...SKINS.gan356m.stickers, finish: "matte" } },
  "gan 356 m UV": { ...SKINS.gan356m, stickers: { ...SKINS.gan356m.stickers, finish: "uv" } },
  "coloured pieces": { ...SKINS.gan356m, body: "#e8e8e8", pieces: { ...SKINS.gan356m.pieces, colored: true } },
  // The logo is yours to supply (demo/assets is git-ignored: brand logos stay out of the repo).
  "gan 356 m + logo": { ...SKINS.gan356m, decals: [{ select: { stickers: [4] }, image: "/assets/gan-logo.png", size: 0.75, blend: "multiply" }] },
  "qiyi sc + logo": { ...SKINS.qiyiSC, decals: [{ select: { stickers: [4] }, image: "/assets/qiyi-logo.png", size: 0.96, rotate: 3 }] },
  "gan i4 + logo": { ...SKINS.ganI4, decals: [{ select: { stickers: [4] }, image: "/assets/gan-logo.png", size: 0.62, blend: "multiply" }] },
  // Pieces from glTF files: the standard skin's settings, but every piece is a model (here: i4-style templates
  // exported by scripts/export-models.ts) — if you see i4 pieces, the models are what's drawn.
  "glTF models (sample)": {
    ...SKINS.standard,
    stickers: { ...SKINS.standard.stickers, material: "plastic", roughness: 0.55, colors: SKINS.ganI4.stickers.colors },
    models: { corner: "/models/ganI4-corner.gltf", edge: "/models/ganI4-edge.gltf", center: "/models/ganI4-center.gltf", surface: SKINS.ganI4.stickers.thickness },
    features: SKINS.ganI4.features,
  },
  // Per-face geometry: a charging port on the yellow (D) centre only — it stays on that sticker whatever you turn.
  "charging port on yellow": {
    ...SKINS.stickerless,
    features: [
      { select: { faces: ["D"], kinds: ["center"] }, type: "slot", params: { width: 0.42, height: 0.11, radius: 0.055 } },
      { select: { faces: ["D"], kinds: ["center"] }, type: "holes", params: { radius: 0.035, at: [[-0.55, -0.45], [0.55, -0.45]] } },
    ],
  },
  // Your own images on stickers: an SVG arrow on every red sticker — turn R / U to see them ride along and turn.
  "custom SVG decals": {
    ...SKINS.stickerless,
    decals: [
      {
        select: { faces: ["R"] },
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M5 1 L9 6 H6.5 V9 H3.5 V6 H1 Z" fill="#fff" fill-opacity="0.85"/></svg>`,
        size: 0.5,
      },
    ],
  },
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
