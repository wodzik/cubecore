import "./nav";
import { formatAlg } from "../packages/core/src/index";
import { SKINS } from "../packages/skin/src/index";
import { createSolverWorker } from "../packages/solve/src/index";
import { type Analysis, type AnalysisStep, type CrossAnalysis, type RouxAnalysis, type RouxAnalysisResult, type RouxStep, createAnalyzerWorker } from "../packages/analyze/src/index";
import "../packages/element/src/index";
import type { CubePlayer } from "../packages/element/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const analyzer = createAnalyzerWorker("/analyzer-worker.js"); // see demo/serve.ts
const solver = createSolverWorker("/solver-worker.js");
const player = $<CubePlayer>("player");
const FACE_COLOUR: Record<string, string> = Object.fromEntries(["U", "R", "F", "D", "L", "B"].map((f, i) => [f, SKINS.standard.stickers.colors[i]]));
const COLOUR_NAME: Record<string, string> = { U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue" };
let current: Analysis | null = null;
let roux: RouxAnalysisResult | null = null;
const method = () => $<HTMLSelectElement>("method").value as "cfop" | "roux" | "zz";
let firstRun = true;

const label = (s: AnalysisStep) =>
  s.step === "pair" ? `Pair ${s.slot}` : s.step === "cross" ? (method() === "zz" ? "EOCross" : s.slots?.length ? `Cross+${s.slots.length} (${s.slots.join(" ")})` : "Cross") : s.step.toUpperCase();
const caseOf = (s: AnalysisStep) => ("case" in s && s.case ? s.case : "");

async function analyze() {
  $("status").textContent = firstRun ? "Analysing… (first run builds the tables, ~10–15 s)" : "Analysing…";
  const t = performance.now();
  const scramble = $<HTMLInputElement>("scramble").value;
  if (method() === "roux") {
    roux = await analyzer.analyzeRoux(scramble);
    firstRun = false;
    $("status").textContent = `${Math.round(performance.now() - t)} ms`;
    renderSides();
    selectRoux(roux.best);
    return;
  }
  if (method() === "zz") {
    // ZZ results have the CFOP shape (EOCross as the "cross" step, R U L pairs, OCLL + PLL).
    current = (await analyzer.analyzeZZ(scramble)) as unknown as Analysis;
    firstRun = false;
    $("status").textContent = `${Math.round(performance.now() - t)} ms`;
    renderColours();
    select(current.best);
    return;
  }
  current = await analyzer.analyze(scramble, {
    start: $<HTMLSelectElement>("start").value as never,
    f2l: $<HTMLSelectElement>("f2l").value as never,
  });
  firstRun = false;
  $("status").textContent = `${Math.round(performance.now() - t)} ms`;
  renderColours();
  select(current.best);
}

// ─── Roux ───

const swatch = (f: string) => `<span class="swatch" style="background:${FACE_COLOUR[f]}"></span>${COLOUR_NAME[f]}`;
const len = (r: RouxAnalysis, step: RouxStep["step"]) => r.steps.filter((s) => s.step === step).reduce((n, s) => n + s.moves.length, 0);

function renderSides() {
  $("byTitle").textContent = "By first-block side";
  $("byHead").innerHTML = `<tr><th>Block (side / bottom)</th><th class="num">FB</th><th class="num">SB</th><th>CMLL</th><th class="num">LSE</th><th class="num">Total STM</th></tr>`;
  $("colours").innerHTML = roux!.bySide
    .map((r, i) => {
      const cm = r.steps.find((s) => s.step === "cmll");
      return `<tr data-i="${i}"><td>${swatch(r.side)} / ${swatch(r.bottom)}${i === 0 ? " <span class=muted>best</span>" : ""}</td>
        <td class="num">${len(r, "fb")}</td><td class="num">${len(r, "ss") + len(r, "sb")}</td><td class="case">${cm && "case" in cm ? cm.case : ""}</td><td class="num">${len(r, "lse")}</td><td class="num">${r.length}</td></tr>`;
    })
    .join("");
  for (const tr of $("colours").querySelectorAll("tr")) tr.addEventListener("click", () => selectRoux(roux!.bySide[Number(tr.dataset.i)]));
}

function selectRoux(r: RouxAnalysis) {
  for (const tr of $("colours").querySelectorAll("tr")) tr.classList.toggle("on", roux!.bySide[Number(tr.dataset.i)] === r);
  $("stepsTitle").textContent = `Solution — block on ${COLOUR_NAME[r.side]} (bottom ${COLOUR_NAME[r.bottom]}), ${r.length} STM${r.rotation ? `, hold: ${r.rotation}` : ""}`;
  const name = { fb: "First block", ss: "Second square", sb: "Second block", cmll: "CMLL", lse: "LSE" } as const;
  $("steps").innerHTML = r.steps
    .map((s) => {
      const note = s.step === "ss" ? s.side : s.step === "cmll" ? s.case : s.step === "lse" ? `EO ${s.eo} · UL/UR ${s.ulur} · L4E ${s.l4e}` : "";
      return `<tr><td>${name[s.step]}</td><td class="moves">${s.moves.length ? formatAlg(s.moves) : "—"}</td><td class="case">${note}</td><td class="num">${s.moves.length}</td></tr>`;
    })
    .join("");
  player.setAttribute("setup", $<HTMLInputElement>("scramble").value);
  player.setAttribute("alg", [r.rotation, ...r.steps.map((s) => formatAlg(s.moves))].filter(Boolean).join(" "));
  $("replayInfo").textContent = `${r.rotation ? `Rotate ${r.rotation}, then ` : ""}first block, second block, CMLL, LSE.`;
}

function renderColours() {
  $("byTitle").textContent = "By cross colour";
  const crossName = method() === "zz" ? "EOCross" : "Cross";
  $("byHead").innerHTML = `<tr><th>${crossName}</th><th class="num">${crossName}</th><th>Pair order</th><th>OLL</th><th>PLL</th><th class="num">Total</th></tr>`;
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
      const how = method() === "cfop" && s.step === "pair" && s.how === "optimal" && s.case !== "solved" ? ` <span class="muted">(fewest moves)</span>` : "";
      return `<tr><td>${label(s)}</td><td class="moves">${moves}</td><td class="case">${caseOf(s)}${how}</td><td class="num">${s.moves.length}</td></tr>`;
    })
    .join("");
  // Replay: the scramble, then the rotation to the cross grip and every step.
  player.setAttribute("setup", $<HTMLInputElement>("scramble").value);
  player.setAttribute("alg", [c.rotation, ...c.steps.map((s) => formatAlg(s.moves))].filter(Boolean).join(" "));
  $("replayInfo").textContent = `${c.rotation ? `Rotate ${c.rotation}, then ` : ""}cross, ${c.pairOrder.length} pairs (${c.pairOrder.join(" → ")}), OLL, PLL.`;
}

$("go").onclick = () => void analyze();
$("method").onchange = () => {
  document.body.classList.toggle("roux", method() === "roux");
  document.body.classList.toggle("zz", method() === "zz");
  void analyze();
};
$("random").onclick = async () => {
  $("status").textContent = "Scrambling…";
  const r = await solver.randomScramble();
  $<HTMLInputElement>("scramble").value = formatAlg(r.moves);
  void analyze();
};
void analyze();
