import "./nav";
import { formatAlg } from "../packages/core/src/index";
import { SKINS } from "../packages/skin/src/index";
import { createSolverWorker } from "../packages/solve/src/index";
import { type Analysis, type AnalysisStep, type CrossAnalysis, createAnalyzerWorker } from "../packages/analyze/src/index";
import "../packages/element/src/index";
import type { CubePlayer } from "../packages/element/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const analyzer = createAnalyzerWorker("/analyzer-worker.js"); // see demo/serve.ts
const solver = createSolverWorker("/solver-worker.js");
const player = $<CubePlayer>("player");
const FACE_COLOUR: Record<string, string> = Object.fromEntries(["U", "R", "F", "D", "L", "B"].map((f, i) => [f, SKINS.standard.stickers.colors[i]]));
const COLOUR_NAME: Record<string, string> = { U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue" };
let current: Analysis | null = null;
let firstRun = true;

const label = (s: AnalysisStep) => (s.step === "pair" ? `Pair ${s.slot}` : s.step === "cross" ? (s.slots?.length ? `Cross+${s.slots.length} (${s.slots.join(" ")})` : "Cross") : s.step.toUpperCase());
const caseOf = (s: AnalysisStep) => ("case" in s && s.case ? s.case : "");

async function analyze() {
  $("status").textContent = firstRun ? "Analysing… (first run builds the tables, ~10–15 s)" : "Analysing…";
  const t = performance.now();
  current = await analyzer.analyze($<HTMLInputElement>("scramble").value, {
    start: $<HTMLSelectElement>("start").value as never,
    f2l: $<HTMLSelectElement>("f2l").value as never,
  });
  firstRun = false;
  $("status").textContent = `${Math.round(performance.now() - t)} ms`;
  renderColours();
  select(current.best);
}

function renderColours() {
  $("colours").innerHTML = current!.byCross
    .map((c, i) => {
      const oll = c.steps.find((s) => s.step === "oll");
      const pll = c.steps.find((s) => s.step === "pll");
      return `<tr data-i="${i}"><td><span class="swatch" style="background:${FACE_COLOUR[c.face]}"></span>${COLOUR_NAME[c.face]}${i === 0 ? " <span class=muted>best</span>" : ""}</td>
        <td class="num">${c.steps[0].moves.length}</td><td>${c.pairOrder.join(" → ")}</td>
        <td class="case">${oll ? caseOf(oll) : ""}</td><td class="case">${pll ? caseOf(pll) : ""}</td><td class="num">${c.length}</td></tr>`;
    })
    .join("");
  for (const tr of $("colours").querySelectorAll("tr")) tr.addEventListener("click", () => select(current!.byCross[Number(tr.dataset.i)]));
}

function select(c: CrossAnalysis) {
  for (const tr of $("colours").querySelectorAll("tr")) tr.classList.toggle("on", current!.byCross[Number(tr.dataset.i)] === c);
  $("stepsTitle").textContent = `Solution — ${COLOUR_NAME[c.face]} cross, ${c.length} moves${c.rotation ? `, hold: ${c.rotation}` : ""}`;
  $("steps").innerHTML = c.steps
    .map((s) => {
      const moves = s.moves.length ? formatAlg(s.moves) : "—";
      const how = s.step === "pair" && s.how === "optimal" && s.case !== "solved" ? ` <span class="muted">(fewest moves)</span>` : "";
      return `<tr><td>${label(s)}</td><td class="moves">${moves}</td><td class="case">${caseOf(s)}${how}</td><td class="num">${s.moves.length}</td></tr>`;
    })
    .join("");
  // Replay: the scramble, then the rotation to the cross grip and every step.
  player.setAttribute("setup", $<HTMLInputElement>("scramble").value);
  player.setAttribute("alg", [c.rotation, ...c.steps.map((s) => formatAlg(s.moves))].filter(Boolean).join(" "));
  $("replayInfo").textContent = `${c.rotation ? `Rotate ${c.rotation}, then ` : ""}cross, ${c.pairOrder.length} pairs (${c.pairOrder.join(" → ")}), OLL, PLL.`;
}

$("go").onclick = () => void analyze();
$("random").onclick = async () => {
  $("status").textContent = "Scrambling…";
  const r = await solver.randomScramble();
  $<HTMLInputElement>("scramble").value = formatAlg(r.moves);
  void analyze();
};
void analyze();
