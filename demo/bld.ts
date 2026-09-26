import "./nav";
import { Matrix4, Quaternion, Vector3 } from "three";
import { applyMoves, buildMask, parseAlg, solvedState } from "../packages/core/src/index";
import { SCHEMES, letterSkin } from "../packages/bld/src/index";
import { SKINS, type Skin } from "../packages/skin/src/index";
import { createSolverWorker } from "../packages/solve/src/index";
import { SimulatedCube, SmartCubeSession } from "../packages/bluetooth/src/index";
import "../packages/element/src/index"; // registers the elements
import type { CubeBld, CubePlayer, CubeScramble } from "../packages/element/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $<CubePlayer>("player");
const scrambleEl = $<CubeScramble>("scramble");
const bld = $<CubeBld>("bld");
const solver = createSolverWorker("/solver-worker.js"); // see demo/serve.ts
let session: SmartCubeSession | null = null;
let simulated: SimulatedCube | null = null;
let baseSkin: Skin = SKINS.default;

const hold = () => $<HTMLSelectElement>("hold").value;
const scheme = () => $<HTMLSelectElement>("scheme").value as keyof typeof SCHEMES;

// ─── the cube's look: colours / letters / letters only / hidden ───

function applyView() {
  const view = $<HTMLSelectElement>("view").value;
  const letters = view === "letters" || view === "lettersOnly";
  player.skin = letters ? letterSkin(baseSkin, { scheme: SCHEMES[scheme()], rotation: hold() || undefined, alwaysShow: view === "lettersOnly" }) : baseSkin;
  // Grey everything but the centres (they say how the cube is held); letters stay when "letters only".
  player.mask = view === "lettersOnly" || view === "hidden" ? buildMask((f) => (f.index % 9 === 4 ? "regular" : "ignored")) : null;
  // Show the cube the way it's held (no gyro here): turn the whole view.
  player.renderer?.setOrientation(hold() ? holdQuaternion(hold()) : null);
}

/** Orientation that shows a cube held by `rotation` the way you hold it. */
function holdQuaternion(rotation: string) {
  const rot = applyMoves(solvedState(), rotation);
  const normals = [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, -1)];
  // Own face f is now at the position whose centre holds f's centre sticker.
  const where = (f: number) => normals[[0, 1, 2, 3, 4, 5].find((pos) => rot[pos * 9 + 4] === f * 9 + 4)!];
  const m = new Matrix4().makeBasis(where(1), where(0), where(2)); // own x (R), y (U), z (F) as held
  return new Quaternion().setFromRotationMatrix(m);
}

$("view").addEventListener("change", applyView);
// Another hold / scheme: other letters for the same cube — memo again from the state it was taken on.
for (const id of ["hold", "scheme"]) $(id).addEventListener("change", () => {
  applyView();
  bld.setAttribute("scheme", scheme());
  hold() ? bld.setAttribute("rotation", hold()) : bld.removeAttribute("rotation");
  showMemo();
});
$("reveal").onchange = () => bld.setAttribute("reveal", $<HTMLSelectElement>("reveal").value);

// ─── cube ───

function use(s: SmartCubeSession) {
  session = s;
  player.attach(s, { gyro: false });
  baseSkin = s.suggestedSkin ?? SKINS.default;
  applyView();
  $("info").textContent = `${s.info.name} · ${s.info.protocol.name}`;
  for (const id of ["solved", "newScramble", "memoNow"]) $<HTMLButtonElement>(id).disabled = false;
  $<HTMLButtonElement>("connect").disabled = $<HTMLButtonElement>("simulate").disabled = true;
  scrambleEl.attach(s);
  s.on("state", (e) => {
    if (e.reason !== "move") scrambleEl.reset(e.state);
  });
  void newScramble();
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
  if (e.composedPath()[0] instanceof HTMLInputElement) return;
  const face = e.key.toUpperCase();
  if (face.length !== 1 || !"URFDLB".includes(face)) return;
  e.preventDefault();
  simulated.turn(parseAlg(face + (e.shiftKey ? "'" : ""))[0]);
});

// ─── 1 · scramble → 2 · memo ───

async function newScramble() {
  if (!session) return;
  bld.detach();
  $("scrambleInfo").textContent = "Generating…";
  const r = await solver.randomScramble({ preset: "full", from: session.state });
  scrambleEl.scramble = r.moves;
  $("scrambleInfo").textContent = "Follow it on the cube (from its current state) — or paste your own.";
}
$("newScramble").onclick = () => void newScramble();
scrambleEl.addEventListener("change", () => {
  bld.detach();
  $("scrambleInfo").textContent = "Your scramble — follow it on the cube.";
});
scrambleEl.addEventListener("complete", () => {
  $("scrambleInfo").textContent = "Scrambled ✓ — memo below.";
  queueMicrotask(() => startMemo()); // after this move has reached every listener
});
$("memoNow").onclick = () => startMemo();

function startMemo() {
  if (!session) return;
  scrambleEl.detach(); // no arrows / tracking from the scramble while executing
  bld.attach(session);
  showMemo();
}

function showMemo() {
  const t = bld.memoText;
  const p = bld.progress;
  if (!t || !p) return;
  $("memoText").innerHTML =
    `Letters memorized for edges: <b>${t.edges || "—"}</b><br>` +
    `Letters memorized for corners: <b>${t.corners || "—"}</b>` +
    (p.memo.parity ? "<br>Parity: odd number of edge letters → parity algorithm after the edges." : "");
}

bld.addEventListener("letter", (e) => {
  const { step } = (e as CustomEvent).detail;
  $("bldInfo").textContent = step.kind === "parity" ? "Parity ✓" : `${step.letter} ✓`;
});
bld.addEventListener("complete", () => {
  $("bldInfo").textContent = session && bld.progress?.solved ? "Solved ✓" : "All letters done — not solved: check the last algorithm.";
});

applyView();
