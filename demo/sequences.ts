import "./nav";
import { type PracticeProgress, formatMove, invert, parseAlg, toFaceTurns } from "../packages/core/src/index";
import { createSolverWorker } from "../packages/solve/src/index";
import { SimulatedCube, SmartCubeSession } from "../packages/bluetooth/src/index";
import "../packages/element/src/index"; // registers the elements
import type { CubeAlgPractice, CubePlayer, CubeScramble, ShownToken } from "../packages/element/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $<CubePlayer>("player");
const scrambleEl = $<CubeScramble>("scramble");
const practiceEl = $<CubeAlgPractice>("practice");
const mirrors = [...document.querySelectorAll<CubeAlgPractice>("cube-alg-practice.mirror")];
const practices = [practiceEl, ...mirrors];
const solver = createSolverWorker("/solver-worker.js"); // see demo/serve.ts
let session: SmartCubeSession | null = null;
let simulated: SimulatedCube | null = null;
let settingUp = false;

// ─── cube ───

function use(s: SmartCubeSession) {
  session = s;
  player.attach(s, { autoSkin: true });
  scrambleEl.attach(s);
  for (const p of practices) p.attach(s);
  $("info").textContent = `${s.info.name} · ${s.info.protocol.name}`;
  for (const id of ["solved", "newScramble", "setup"]) $<HTMLButtonElement>(id).disabled = false;
  $<HTMLButtonElement>("connect").disabled = $<HTMLButtonElement>("simulate").disabled = true;
  s.on("state", (e) => {
    if (e.reason !== "move") for (const p of practices) p.reset(e.state);
  });
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

// ─── scramble ───

$("newScramble").onclick = async () => {
  if (!session) return;
  $("scrambleInfo").textContent = "Generating…";
  const r = await solver.randomScramble({ preset: $<HTMLSelectElement>("scrambleKind").value as "full" | "ll", from: session.state });
  settingUp = false;
  scrambleEl.scramble = r.moves;
  $("scrambleInfo").textContent = `${r.moves.length} moves, from the cube's current state.`;
};
scrambleEl.addEventListener("change", () => {
  settingUp = false;
  $("scrambleInfo").textContent = "Your scramble — follow it on the cube.";
});
scrambleEl.addEventListener("complete", () => {
  if (!settingUp) return void ($("scrambleInfo").textContent = "Scrambled ✓");
  settingUp = false;
  $("scrambleInfo").textContent = "Case set up ✓";
  $("practiceInfo").textContent = "Go!";
  // Start the attempt after this move has reached every listener.
  queueMicrotask(() => session && practices.forEach((p) => p.attach(session!)));
});

// ─── practice ───

function setAlg(text: string) {
  try {
    const moves = parseAlg(text);
    for (const p of practices) p.alg = moves;
    $("alg").style.borderColor = "";
  } catch {
    $("alg").style.borderColor = "#ff8a4c";
  }
}
$<HTMLInputElement>("alg").value = $<HTMLSelectElement>("preset").value;
$("preset").onchange = () => {
  $<HTMLInputElement>("alg").value = $<HTMLSelectElement>("preset").value;
  setAlg($<HTMLSelectElement>("preset").value);
};
$("alg").oninput = () => setAlg($<HTMLInputElement>("alg").value);
$("reveal").onchange = () => practiceEl.setAttribute("reveal", $<HTMLSelectElement>("reveal").value);
$("hintOnMistake").onchange = () => {
  if ($<HTMLInputElement>("hintOnMistake").checked) practiceEl.removeAttribute("hint-on-mistake");
  else practiceEl.setAttribute("hint-on-mistake", "off");
  practiceEl.reset(session?.state);
};
$("setup").onclick = () => {
  settingUp = true;
  for (const p of practices) p.detach(); // the setup moves aren't an attempt
  scrambleEl.scramble = invert(toFaceTurns(practiceEl.alg).moves);
  $("scrambleInfo").textContent = "Case setup — start from solved.";
  $("practiceInfo").textContent = "Do the setup moves in the scramble box first.";
};

const attempts: string[] = [];
practiceEl.addEventListener("mistake", () => ($("practiceInfo").textContent = "Slip — undo it (orange) and carry on."));
practiceEl.addEventListener("complete", (e) => {
  const { practice } = (e as CustomEvent<PracticeProgress>).detail;
  $("practiceInfo").textContent = practice.differentAlg ? "Solved — with a different algorithm." : "Done ✓ — Set up case to go again.";
  attempts.unshift(
    `<tr><td>${(practice.elapsedMs / 1000).toFixed(2)} s</td><td>${practice.tps.toFixed(1)} TPS</td><td>${practice.mistakes} mistake${practice.mistakes === 1 ? "" : "s"}</td><td>${practice.differentAlg ? "other alg" : ""}</td></tr>`,
  );
  $("attempts").innerHTML = attempts.slice(0, 5).join("");
});

// 2. own controls in the slot: plain buttons calling the element's methods
const slotted = $<CubeAlgPractice>("slotted");
slotted.addEventListener("click", (e) => {
  const action = (e.target as HTMLElement).closest<HTMLElement>("[data-do]")?.dataset.do;
  if (action === "hint") slotted.hint();
  else if (action === "toggleShown") slotted.toggleShown();
  else if (action === "reset") slotted.reset(session?.state);
});

// 3. headless: the whole UI from the progress event
$("headless").addEventListener("progress", (e) => {
  const p = (e as CustomEvent<PracticeProgress & { shown: ShownToken[] }>).detail;
  const ui = $("customUi");
  ui.querySelector<HTMLElement>(".bar i")!.style.width = `${(100 * p.done) / Math.max(1, p.total)}%`;
  ui.querySelector(".chips")!.innerHTML = p.shown.map((t) => `<span class="chip ${t.status}">${t.visible ? t.text : "?"}</span>`).join("");
  ui.querySelector(".undo")!.textContent = p.undo.length ? `undo: ${p.undo.map(formatMove).join(" ")}` : p.complete ? "✓" : "";
});

// Now that every listener is in place, show the first algorithm.
setAlg($<HTMLInputElement>("alg").value);
