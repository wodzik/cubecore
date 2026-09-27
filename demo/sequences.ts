import "./nav";
import { type PracticeProgress, invert, parseAlg, toFaceTurns } from "../packages/core/src/index";
import { createSolverWorker } from "../packages/solve/src/index";
import { SimulatedCube, SmartCubeSession } from "../packages/bluetooth/src/index";
import "../packages/element/src/index"; // registers the elements
import type { CubeAlgPractice, CubePlayer, CubeScramble } from "../packages/element/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $<CubePlayer>("player");
const scrambleEl = $<CubeScramble>("scramble");
const setupEl = $<CubeScramble>("setup");
const practiceEl = $<CubeAlgPractice>("practice");
const solver = createSolverWorker("/solver-worker.js"); // see demo/serve.ts
let session: SmartCubeSession | null = null;
let simulated: SimulatedCube | null = null;
let mode: "scramble" | "alg" = "scramble";

// ─── cube ───

function use(s: SmartCubeSession) {
  session = s;
  player.attach(s, { autoSkin: true });
  $("info").textContent = `${s.info.name} · ${s.info.protocol.name}`;
  for (const id of ["solved", "newScramble", "setupCase"]) $<HTMLButtonElement>(id).disabled = false;
  $<HTMLButtonElement>("connect").disabled = $<HTMLButtonElement>("simulate").disabled = true;
  s.on("state", (e) => {
    if (e.reason === "move") return;
    // Resync / marked solved: start the current thing again from here.
    if (mode === "alg") practiceEl.reset(e.state);
    else scrambleEl.reset(e.state);
  });
  setMode(mode);
  if (!scrambleEl.scramble) void newScramble();
}

$("connect").onclick = async () => {
  try {
    use(await SmartCubeSession.connect({ enableAddressSearch: true }));
  } catch (e) {
    $("info").textContent = e instanceof Error ? e.message : "Could not connect.";
  }
};
$("simulate").onclick = () => {
  simulated = new SimulatedCube();
  use(new SmartCubeSession(simulated));
  $("keys").hidden = false;
};
$("solved").onclick = () => session?.markSolved();

addEventListener("keydown", (e) => {
  if (!simulated || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.composedPath()[0] instanceof HTMLInputElement) return; // typing a scramble / an algorithm
  const face = e.key.toUpperCase();
  if (face.length !== 1 || !"URFDLB".includes(face)) return;
  e.preventDefault();
  simulated.turn(parseAlg(face + (e.shiftKey ? "'" : ""))[0]);
});

// ─── mode: only the visible thing follows the cube (and owns the arrows) ───

function setMode(m: typeof mode) {
  mode = m;
  $("tabScramble").setAttribute("aria-selected", String(m === "scramble"));
  $("tabAlg").setAttribute("aria-selected", String(m === "alg"));
  $("scramblePanel").hidden = m !== "scramble";
  $("algPanel").hidden = m !== "alg";
  scrambleEl.detach();
  setupEl.detach();
  practiceEl.detach();
  $("setupBox").hidden = true;
  if (!session) return;
  if (m === "scramble") scrambleEl.attach(session);
  else practiceEl.attach(session);
}
$("tabScramble").onclick = () => setMode("scramble");
$("tabAlg").onclick = () => setMode("alg");

// Arrows: on / off, shape, and a colour for each kind (CSS variables on the elements).
const arrowOptions = () => {
  const on = $<HTMLInputElement>("arrows").checked;
  const shape = $<HTMLSelectElement>("arrowShape").value;
  for (const el of [scrambleEl, setupEl, practiceEl]) {
    el.style.setProperty("--cc-arrow", $<HTMLInputElement>("colNext").value);
    el.style.setProperty("--cc-arrow-undo", $<HTMLInputElement>("colUndo").value);
    el.style.setProperty("--cc-arrow-wrong-way", $<HTMLInputElement>("colWrong").value);
    el.setAttribute("arrow-shape", shape);
    el.toggleAttribute("arrows", on);
    el.refreshArrows(); // new colours (CSS changes don't notify the element)
  }
};
for (const id of ["arrows", "arrowShape", "colNext", "colUndo", "colWrong"]) $(id).addEventListener("input", arrowOptions);
arrowOptions();

// ─── scramble ───

async function newScramble() {
  if (!session) return;
  $("scrambleInfo").textContent = "Generating…";
  const r = await solver.randomScramble({ preset: "full", from: session.state });
  scrambleEl.scramble = r.moves;
  $("scrambleInfo").textContent = "From the cube's current state — or paste your own above.";
}
$("newScramble").onclick = () => void newScramble();
scrambleEl.addEventListener("change", () => ($("scrambleInfo").textContent = "Your scramble."));
scrambleEl.addEventListener("complete", () => ($("scrambleInfo").textContent = "Scrambled ✓"));

// ─── algorithm ───

function setAlg(text: string) {
  try {
    practiceEl.alg = parseAlg(text);
    $("alg").style.borderColor = "";
  } catch {
    $("alg").style.borderColor = "#ff8a4c";
  }
}
$<HTMLInputElement>("alg").value = $<HTMLSelectElement>("preset").value;
setAlg($<HTMLSelectElement>("preset").value);
$("preset").onchange = () => {
  $<HTMLInputElement>("alg").value = $<HTMLSelectElement>("preset").value;
  setAlg($<HTMLSelectElement>("preset").value);
};
$("alg").oninput = () => setAlg($<HTMLInputElement>("alg").value);
$("reveal").onchange = () => practiceEl.setAttribute("reveal", $<HTMLSelectElement>("reveal").value);

$("setupCase").onclick = () => {
  if (!session) return;
  practiceEl.detach(); // the setup moves aren't an attempt
  setupEl.scramble = invert(toFaceTurns(practiceEl.alg).moves);
  setupEl.attach(session);
  $("setupBox").hidden = false;
  $("practiceInfo").textContent = "Do the setup first (from solved).";
};
setupEl.addEventListener("complete", () => {
  // After this move has reached every listener, the attempt starts here.
  queueMicrotask(() => {
    if (!session) return;
    setupEl.detach();
    $("setupBox").hidden = true;
    practiceEl.attach(session);
    $("practiceInfo").textContent = "Go!";
  });
});
practiceEl.addEventListener("mistake", () => ($("practiceInfo").textContent = "Slip — undo it and carry on."));
practiceEl.addEventListener("complete", (e) => {
  const { practice } = (e as CustomEvent<PracticeProgress>).detail;
  $("practiceInfo").textContent = practice.differentAlg ? "Solved — with a different algorithm." : "Done ✓ — set up the case again.";
});
