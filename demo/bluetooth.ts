import "./nav";
import { MethodTracker, MoveCollapser, type State, formatMove, frameFor, parseAlg } from "../packages/core/src/index";
import { STAGES, createSolverWorker } from "../packages/solve/src/index";
import { CFOP } from "../packages/cfop/src/index";
import { SimulatedCube, SmartCubeSession } from "../packages/bluetooth/src/index";
import { type CubePlayer, type CubeScramble, formatTime } from "../packages/element/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $<CubePlayer>("player");
const scrambleEl = $<CubeScramble>("scramble");
const solver = createSolverWorker("/solver-worker.js"); // see demo/serve.ts
solver.warmUp([STAGES.cross(), STAGES.xcross("FR")]); // tables build in the worker while you connect
let session: SmartCubeSession | null = null;
let simulated: SimulatedCube | null = null;
let detachPlayer: (() => void) | null = null;
const offs: (() => void)[] = [];

// ─── move log + stages, restarted by "start from here" ───
let log = new MoveCollapser();
let lateIndexes = new Set<number>();
let tracker: MethodTracker | null = null;
let t0 = 0;

function restart(state: State) {
  log = new MoveCollapser();
  lateIndexes = new Set();
  tracker = new MethodTracker(CFOP, state);
  t0 = performance.now();
  renderLog();
  renderStages();
}

function renderLog() {
  const moves = log.moves;
  $("log").innerHTML = moves.map((m, i) => `<span${lateIndexes.has(i) ? ' class="late"' : ""}>${formatMove(m.move)}</span>`).join(" ") || '<span class="kv">Turn the cube…</span>';
  $("count").textContent = `${moves.length} move${moves.length === 1 ? "" : "s"}`;
}

function renderStages() {
  const got = new Map((tracker?.boundaries ?? []).map((b) => [b.stage, b]));
  $("stages").innerHTML = CFOP.stages
    .map((s) => {
      const b = got.get(s.id);
      return `<tr><td>${b ? "✓" : "·"} ${s.label}${b?.detail ? ` <span class="kv">${b.detail}</span>` : ""}</td><td>${b?.time !== undefined ? formatTime(b.time - t0) : ""}</td></tr>`;
    })
    .join("");
}

// ─── connecting ───

function use(s: SmartCubeSession) {
  session = s;
  detachPlayer = player.attach(s, { gyro: $<HTMLInputElement>("gyro").checked });
  scrambleEl.attach(s);
  restart(s.state);
  const info = () => {
    const i = s.info;
    $("info").innerHTML = `<b>${i.name}</b> · ${i.protocol.name}${s.battery !== null ? ` · battery ${s.battery}%` : ""}${i.capabilities.gyroscope ? " · gyro" : ""}`;
  };
  info();
  offs.push(
    s.on("move", (e) => {
      const change = log.push(e.move, e.time); // { removed, added } — enough to patch a long list; here we just re-render
      if (e.late) lateIndexes.add(log.moves.length - 1);
      void change;
      renderLog();
      tracker?.push(e.move, e.time);
      renderStages();
    }),
    s.on("state", (e) => {
      if (e.reason !== "move") restart(e.state);
    }),
    s.on("battery", info),
    s.on("hardware", info),
    s.on("disconnect", () => disconnected()),
  );
  for (const id of ["disconnect", "solved", "calibrate", "newScramble"]) $<HTMLButtonElement>(id).disabled = false;
  $<HTMLButtonElement>("connect").disabled = true;
  $<HTMLButtonElement>("simulate").disabled = true;
}

function disconnected() {
  offs.splice(0).forEach((off) => off());
  detachPlayer?.();
  session = null;
  simulated = null;
  $("info").textContent = "Disconnected.";
  $("keys").hidden = true;
  for (const id of ["disconnect", "solved", "calibrate", "newScramble"]) $<HTMLButtonElement>(id).disabled = true;
  scrambleEl.detach();
  $<HTMLButtonElement>("connect").disabled = false;
  $<HTMLButtonElement>("simulate").disabled = false;
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
$("disconnect").onclick = () => void session?.disconnect();
$("solved").onclick = () => session?.markSolved();
$("calibrate").onclick = () => session?.calibrate();
$("gyro").onchange = () => {
  if (!session) return;
  detachPlayer?.();
  detachPlayer = player.attach(session, { gyro: $<HTMLInputElement>("gyro").checked });
};
$("clear").onclick = (e) => {
  e.preventDefault();
  if (session) restart(session.state);
};

// ─── scrambles from the cube's current state, in a worker ───
$("newScramble").onclick = async () => {
  if (!session) return;
  const kind = $<HTMLSelectElement>("scrambleKind").value;
  const from = session.state;
  const white = frameFor("U"); // western scheme: white is U → "cross on white" = cross on U
  $("scrambleInfo").textContent = "Generating…";
  const t = performance.now();
  const r =
    kind === "cross-5" ? await solver.stageScramble({ stage: STAGES.cross(), length: 5, frame: white, from })
    : kind === "xcross-7" ? await solver.stageScramble({ stage: STAGES.xcross("FR"), length: 7, frame: white, from })
    : await solver.randomScramble({ preset: kind === "ll" ? "ll" : "full", from });
  if (!r) return void ($("scrambleInfo").textContent = "No case found — try again.");
  scrambleEl.scramble = r.moves;
  $("scrambleInfo").textContent = `${r.moves.length} moves · ${Math.round(performance.now() - t)} ms (from the cube's current state)`;
};
scrambleEl.addEventListener("complete", () => {
  $("scrambleInfo").textContent = "Scrambled ✓ — solve away (log and stages restarted)";
  // After this move reaches every listener (the last scramble move belongs to the scramble, not the solve).
  queueMicrotask(() => session && restart(session.state));
});

// Keyboard for the simulated cube.
addEventListener("keydown", (e) => {
  if (!simulated || e.metaKey || e.altKey) return;
  const face = e.key.toUpperCase();
  if (!"URFDLB".includes(face) || face.length !== 1) return;
  e.preventDefault();
  simulated.turn(parseAlg(face + (e.shiftKey ? "'" : ""))[0], { delayMs: e.ctrlKey ? 3000 : 0 });
});

renderLog();
renderStages();
