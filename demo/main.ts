import "./nav";
import {
  FRAMES,
  MethodTracker,
  type Move,
  applyMoves,
  colorAt,
  formatAlg,
  formatMove,
  invert,
  isSolved,
  moveCount,
  parseAlg,
  solvedState,
  transformMoves,
} from "../packages/core/src/index";
import { CFOP, MASK_NAMES, METHODS, maskByName } from "../packages/methods/src/index";
import { SvgCache } from "../packages/image/src/index";
import { SKINS, withColors } from "../packages/skin/src/index";
import { ReplayClock, encodeRecording, recording, stageTimings } from "../packages/timeline/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Colour class index = home face in U R F D L B order.
const SCHEMES: Record<string, string[]> = {
  "Western (white top, green front)": ["#ffffff", "#e8322f", "#23b04a", "#ffd500", "#ff8a00", "#1e5eff"],
  "Japanese (blue opposite white)": ["#ffffff", "#e8322f", "#23b04a", "#1e5eff", "#ff8a00", "#ffd500"],
  "Odd custom scheme": ["#ff5cc8", "#00d1c1", "#b2f000", "#8a5cff", "#ffb000", "#4a4a4a"],
};

const EXAMPLES: Record<string, [string, string]> = {
  cfop: ["", "F2 R' D L2 R U R' L' U' L R' U' R L U L' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' U"],
  roux: ["", "F' U2 L' D R2 R U R' r' U' R2 R U R' U R U2 R' M' U M U M2 U' M2 U2 M2 U2"],
  zz: ["", "F B' D L2 R U2 L U L' U' L2 R U R' U2 R' U' R R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' U2"],
};

function loadExample(key: string) {
  const [, solution] = EXAMPLES[key];
  $<HTMLTextAreaElement>("solution").value = solution;
  $<HTMLTextAreaElement>("scramble").value = formatAlg(invert(parseAlg(solution)));
  render();
}

for (const name of Object.keys(SCHEMES)) $<HTMLSelectElement>("scheme").add(new Option(name, name));
FRAMES.forEach((f) => $<HTMLSelectElement>("hold").add(new Option(f.id === 0 ? "As written" : `Bottom on ${f.face.D}, front on ${f.face.F}`, String(f.id))));

// ─── net (U on top; L F R B in a row; D below) ───
const NET_POS: Record<number, [number, number]> = { 0: [3, 0], 4: [0, 3], 2: [3, 3], 1: [6, 3], 5: [9, 3], 3: [3, 6] };
function drawNet(state: Uint8Array, colors: string[]): string {
  const s = 26;
  let out = `<svg viewBox="0 0 ${12 * s + 4} ${9 * s + 4}" xmlns="http://www.w3.org/2000/svg">`;
  for (let f = 0; f < 6; f++) {
    const [ox, oy] = NET_POS[f];
    for (let i = 0; i < 9; i++) {
      const x = (ox + (i % 3)) * s + 2, y = (oy + Math.floor(i / 3)) * s + 2;
      out += `<rect x="${x}" y="${y}" width="${s - 2}" height="${s - 2}" rx="4" fill="${colors[colorAt(state, f * 9 + i)]}" stroke="#000" stroke-width="1"/>`;
    }
  }
  return out + "</svg>";
}

let scramble: Move[] = [];
let solution: Move[] = [];

function render() {
  const err = $("error");
  err.textContent = "";
  try {
    const frame = FRAMES[Number($<HTMLSelectElement>("hold").value) || 0];
    scramble = transformMoves(parseAlg($<HTMLTextAreaElement>("scramble").value), frame);
    solution = transformMoves(parseAlg($<HTMLTextAreaElement>("solution").value), frame);
  } catch (e) {
    err.textContent = (e as Error).message;
    return;
  }
  const scrub = $<HTMLInputElement>("scrub");
  scrub.max = String(solution.length);
  if (Number(scrub.value) > solution.length) scrub.value = String(solution.length);
  setupReplay();
  drawPosition();

  const start = applyMoves(solvedState(), scramble);
  $("methods").innerHTML = METHODS.map((m) => {
    const t = new MethodTracker(m, start);
    solution.forEach((mv) => t.push(mv));
    const byStage = new Map(t.boundaries.map((b) => [b.stage, b]));
    const rows = m.stages
      .map((st) => {
        const b = byStage.get(st.id);
        return `<tr><td class="${b ? "stage-done" : "stage-todo"}">${st.label}</td><td>${b ? `move ${b.moveIndex}` : "—"}</td><td>${b?.detail ?? ""}</td></tr>`;
      })
      .join("");
    const done = t.current.done;
    return `<div><h3>${m.name}${done ? " ✓" : ""}</h3><div class="meta">${t.bottomFace ? `bottom / anchor face: ${t.bottomFace}` : "not started"} · ${t.boundaries.length}/${m.stages.length} stages</div><table><tr><th>Stage</th><th>At</th><th>Detail</th></tr>${rows}</table></div>`;
  }).join("");
}

const cache = new SvgCache(300);
for (const p of MASK_NAMES) $<HTMLSelectElement>("mask").add(new Option(`mask: ${p}`, p));

function drawImages(state: Uint8Array) {
  const colors = SCHEMES[$<HTMLSelectElement>("scheme").value];
  const skin = withColors(SKINS.default, colors as unknown as Parameters<typeof withColors>[1]);
  const preset = $<HTMLSelectElement>("mask").value;
  // "Last layer on top": look at the cube from the frame whose top is the method's last layer.
  const t = new MethodTracker(CFOP, applyMoves(solvedState(), scramble));
  solution.forEach((m) => t.push(m));
  const anchor = t.current.frame ?? FRAMES[0];
  const frame = $<HTMLInputElement>("lltop").checked ? anchor : FRAMES[0];
  const mask = maskByName(preset, frame);
  const t0 = performance.now();
  const imgs = (["iso", "top", "net"] as const).map((v) => cache.get(state, { view: v, size: v === "net" ? 240 : 170, skin, mask, frame }));
  $("images").innerHTML = imgs.join("");
  $("imginfo").textContent = `3 SVGs in ${(performance.now() - t0).toFixed(2)} ms (cached: ${cache.size}) · ${imgs.reduce((n, x) => n + x.length, 0)} bytes`;
}

// ─── real-time replay ───
let clock: ReplayClock | null = null;
function buildRecording() {
  const t = new MethodTracker(CFOP, applyMoves(solvedState(), scramble));
  const stageStart = new Set<number>([0]);
  solution.forEach((m, i) => {
    const before = t.boundaries.length;
    t.push(m);
    if (t.boundaries.length > before) stageStart.add(i + 1);
  });
  let ms = 0;
  const timed = solution.map((m, i) => {
    ms += stageStart.has(i) ? 700 : 130;
    return [formatMove(m), ms] as [string, number];
  });
  return recording(formatAlg(scramble), timed, ms + 100);
}

function setupReplay() {
  clock?.pause();
  const rec = buildRecording();
  clock = new ReplayClock(rec, { maxAnimMs: 120 });
  clock.rate = Number($<HTMLSelectElement>("rate").value);
  clock.onChange((time, pos) => {
    $("clock").textContent = (time / 1000).toFixed(2) + " s";
    const scrub = $<HTMLInputElement>("scrub");
    if (Number(scrub.value) !== pos.applied) {
      scrub.value = String(pos.applied);
      drawPosition();
    }
    $("play").textContent = clock!.isPlaying ? "Pause" : "Play";
  });
  const enc = encodeRecording(rec);
  $("enc").textContent = ` · recording encodes to ${enc.length} URL-safe chars`;
  const tm = stageTimings(CFOP, rec);
  $("timings").innerHTML =
    `<tr><th>Stage</th><th>Moves</th><th>Recognition</th><th>Execution</th><th>Total</th></tr>` +
    tm.stages.map((s) => `<tr><td>${s.label}${s.detail ? ` (${s.detail})` : ""}</td><td>${s.moveCount}</td><td>${(s.recognitionMs / 1000).toFixed(2)}</td><td>${(s.executionMs / 1000).toFixed(2)}</td><td>${(s.totalMs / 1000).toFixed(2)}</td></tr>`).join("") +
    `<tr><td colspan="5" class="kv">fluency ${tm.fluency === null ? "—" : Math.round(tm.fluency * 100) + "%"} · total ${(rec.totalMs / 1000).toFixed(2)} s</td></tr>`;
  $("clock").textContent = "0.00 s";
}
$("play").addEventListener("click", () => {
  if (!clock) return;
  if (clock.isPlaying) clock.pause();
  else {
    if (clock.currentTime >= clock.recording.totalMs || Number($<HTMLInputElement>("scrub").value) === 0) clock.seek(0);
    clock.play();
  }
  $("play").textContent = clock.isPlaying ? "Pause" : "Play";
});
$("rate").addEventListener("change", () => clock && (clock.rate = Number($<HTMLSelectElement>("rate").value)));
$("mask").addEventListener("change", drawPosition);
$("lltop").addEventListener("change", drawPosition);

function drawPosition() {
  const n = Number($<HTMLInputElement>("scrub").value);
  const state = applyMoves(applyMoves(solvedState(), scramble), solution.slice(0, n));
  $("net").innerHTML = drawNet(state, SCHEMES[$<HTMLSelectElement>("scheme").value]);
  $("pos").textContent = `after ${n} / ${solution.length} moves · ${moveCount(solution, "htm")} HTM · ${moveCount(solution, "stm")} STM`;
  $("solved").textContent = isSolved(state) ? " · solved" : "";
  drawImages(state);
  $("moves").innerHTML = solution.map((m, i) => `<span class="${i < n - 1 ? "done" : i === n - 1 ? "cur" : ""}">${formatMove(m)}</span>`).join(" ");
}

$("scramble").addEventListener("input", render);
$("solution").addEventListener("input", render);
$("scheme").addEventListener("change", drawPosition);
$("hold").addEventListener("change", render);
$("scrub").addEventListener("input", drawPosition);
for (const k of Object.keys(EXAMPLES)) $(`ex-${k}`).addEventListener("click", () => loadExample(k));
loadExample("cfop");
