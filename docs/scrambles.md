# Solvers, scrambles and following them (`@cubecore/solve`, `SequenceTracker`, `<cube-scramble>`)

## Scrambles

```ts
import { randomScramble, stageScramble, STAGES, createSolverWorker } from "@cubecore/solve";
import { frameFor, frameForColors } from "@cubecore/core";

randomScramble();                                           // random state, ≤ 21 moves (two-phase)
randomScramble({ preset: "ll", frame: frameFor("U") });     // last-layer case, cross on U
randomScramble({ from: cube.state });                       // from wherever the smart cube is now
stageScramble({ stage: STAGES.cross(), length: 6, frame: frameForColors(cube.state, "U"), from: cube.state });
stageScramble({ stage: STAGES.xcross("FR"), length: 8 });
```

Presets: `full`, `f2l` (cross solved), `ls`, `ll`, `zbll`, `pll`, `ell`, `cmll`;
or your own `solved` / `oriented` piece rules. Stages: `cross`, `eocross`,
`xcross(slot)`, `xxcross(a, b)`, `slot(slot)`, `roux-fb`, `roux-blocks` — or any `StageDef`
(a set of pieces + tables).

## Stage solvers

```ts
const x = new StageSolver(STAGES.xcross("FR"));
x.distance(state);                  // fewest moves
x.solve(state, { all: true });      // every optimal solution
x.nextMoves(state);                 // the first moves of optimal solutions (hints)
x.solve(state, { frame: frameFor("U") }); // on another face
```

Tables are built on first use: two-phase ~0.5 s, cross ~60 ms, each
cross+slot-piece table ~1.5 s. Use the worker in apps:

```ts
const solver = createSolverWorker();          // Vite / webpack / bun build pick up the worker file
await solver.warmUp([STAGES.cross(), STAGES.xcross("FR")]);
const { moves } = await solver.stageScramble({ stage: STAGES.cross(), length: 5, from: cube.state, seed: 42 });
```

Tables survive reloads: the worker's `warmUp` keeps them in IndexedDB
(`preloadStageTables(stages, indexedDbTableStore())` does the same on the
main thread), so the ~1.5 s per table is paid once per device.

Dev servers that don't rewrite `new URL("./worker.ts", import.meta.url)` (Bun's
HTML dev server) can build the worker themselves and pass its URL:
`createSolverWorker("/solver-worker.js")` — see `demo/serve.ts`.

## Following a scramble or an algorithm

`SequenceTracker` (core) matches cube states, so half turns done as quarters
(either way), opposite faces in the other order, and algorithms with
rotations / slices / wide moves (what the smart cube reports) all count.
After a slip, `undo` holds the way back; `needsReset` when it's longer than
`maxCorrection` (25).

```ts
const t = new SequenceTracker("R U2 F'", cube.state);
cube.on("move", ({ move }) => {
  const p = t.push(move);   // { done, total, partial, tokens: ["done" | "partial" | "current" | "todo"], undo, needsReset, complete }
});
```

`<cube-scramble>` shows it:

```html
<cube-scramble></cube-scramble>
<script type="module">
  const el = document.querySelector("cube-scramble");
  el.scramble = moves;               // string or Move[]
  el.attach(session);                // follows the smart cube from its current state
  el.messages = { undo: "Cofnij", reset: "Za daleko — ułóż kostkę i zacznij od nowa" };
  el.addEventListener("complete", () => { /* inspection, timer… — the app decides */ });
</script>
```

Styling: `--cc-scramble-size`, `--cc-scramble-font`, `--cc-scramble-gap`,
`--cc-done`, `--cc-current`, `--cc-current-bg`, `--cc-partial`, `--cc-todo`,
`--cc-undo`; parts `moves`, `move`, `move-done`, `move-current`,
`move-partial`, `move-todo`, `undo`, `undo-label`, `undo-move`, `message`.
