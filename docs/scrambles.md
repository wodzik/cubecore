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

## Elements: `<cube-scramble>` and `<cube-alg-practice>`

Two elements on one base (`CubeSequenceElement`): both follow a move list
on a smart cube (done moves fade, the next is highlighted, half of a half
turn shows as partial, a slip shows what to undo), and share styling, slots
and events. They differ where a scramble and an algorithm differ:

| | `<cube-scramble>` | `<cube-alg-practice>` |
|---|---|---|
| moves shown | always all | `reveal="all"` / `"done"` (dots until done, default) / `"none"` |
| your own moves | `editable`: paste or type a scramble (validated, `change` event) | — |
| controls | — | Hint, Show / Hide, Restart |
| extra | — | mistakes, time from the first turn, TPS, `differentAlg`; slices, wide moves and rotations in the algorithm |
| events | `progress`, `complete`, `change` | `progress`, `mistake`, `complete` |

```html
<cube-scramble editable></cube-scramble>
<cube-alg-practice reveal="done"></cube-alg-practice>
<script type="module">
  import "@cubecore/element";
  const scramble = document.querySelector("cube-scramble");
  scramble.scramble = moves;                 // string or Move[]
  scramble.attach(session);                  // follows the cube from its current state
  scramble.addEventListener("change", (e) => e.detail.moves);   // pasted / typed
  scramble.addEventListener("complete", () => { /* inspection, timer… — the app decides */ });

  const practice = document.querySelector("cube-alg-practice");
  practice.alg = "R U R' U R U2 R'";
  practice.attach(session);                  // attempt starts from the cube's current state
  practice.addEventListener("complete", (e) => e.detail.practice); // { elapsedMs, turns, tps, mistakes, differentAlg }
  practice.hint(); practice.toggleShown(); practice.reset();
</script>
```

Once complete, an element ignores further turns until a new sequence or
`reset()`. Texts: `el.messages = { undo: "Cofnij", reset: "…", hint: "Podpowiedź", … }`
(scramble: `placeholder`, `invalid`; practice: `hint`, `show`, `hide`,
`restart`, `differentAlg`; `practice.formatStats` for the stats line).
The core behind them: `SequenceTracker` and `PracticeTracker`.

### Arrows on the 3D cube

With `arrows` and a player, the cube shows the next turn: a ribbon with an
arrowhead just above each turning layer, centred on its row (two for a wide
`r`, the middle row for `M`), over the face you see best and a little onto
the next. Every arrow has the same length; the heads say how far — one per
quarter turn (R, R2, R3). The direction is the one written — `R2'` the other
way than `R2` (the parser keeps it in `move.written`).
`arrow-shape="circle"` draws an arc of a circle over the faces instead of a
ribbon following them. After a slip it shows the undo move
instead; in practice it stays hidden with the move (Hint or a slip shows it).
It follows the gyro and camera drags.

```html
<cube-player id="p"></cube-player>
<cube-alg-practice arrows player="p"></cube-alg-practice>   <!-- or el.player = playerElement -->
```

Colours: `--cc-arrow` (next move), `--cc-arrow-undo` (back after a slip),
`--cc-arrow-wrong-way` (back after the right face went the wrong way or too
far — `nextTurn().kind`); after changing them from script call
`el.refreshArrows()`. Underneath: core `turnArrow(move, frame)`
and the trackers' `nextTurn` (which layers, which way, in the cube's own
coordinates — after a rotation or an `r` the next move lands on the right
physical face), `renderer.setTurnArrows(arrows, { color, opacity, scale })`,
`player.showTurnArrows(arrows, style, owner)`.

### Styling and your own controls

1. **CSS variables**: `--cc-seq-font`, `--cc-seq-size`, `--cc-seq-gap`,
   `--cc-seq-done`, `--cc-seq-current`, `--cc-seq-current-bg`,
   `--cc-seq-partial`, `--cc-seq-todo`, `--cc-seq-hidden` (dots),
   `--cc-seq-undo`, `--cc-accent`, `--cc-control-bg`, `--cc-control-radius`.
2. **`::part()`**: `container`, `moves`, `move`, `move-done` / `-current` /
   `-partial` / `-todo` / `-hidden`, `undo`, `undo-label`, `undo-move`,
   `message`, `controls`, `button`, `button-hint` / `-reveal` / `-restart`;
   scramble: `input`, `error`.
3. **Slots**: children with `slot="controls"`, `slot="undo"` or
   `slot="message"` replace those pieces (e.g. your buttons calling
   `hint()` / `toggleShown()` / `reset()`); `controls="none"` just hides the
   default controls (for the scramble that includes the input).
4. **`headless`**: no built-in view at all; build your own from the
   `progress` event — `detail` is the progress (`done`, `total`, `undo`,
   `needsReset`, `complete`, practice stats) plus `shown`:
   `[{ text, status, visible }]`.

Demo: `/sequences` — scramble or algorithm, with the cube and arrows (simulated cube works).
