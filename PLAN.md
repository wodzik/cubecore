# cubecore — Implementation Plan

A 3x3x3-only cube library in TypeScript: a **headless core** (state, notation,
solved/stage checks, solvers, timed recordings) that runs anywhere JS runs,
and an **optional renderer** that only reads from it. Built to fix the parts
of cubing.js that hurt in `act`:

| Pain in cubing.js (seen in act) | cubecore answer |
|---|---|
| Built-in control panel in closed shadow DOM, no custom/styled buttons | Headless player API (`play/pause/seek`, events); optional default controls are plain, stylable elements (`::part`, CSS variables) |
| Replay animates every move at a fixed tempo | `Timeline` driven by wall-clock time: each move starts when it was actually made; speed factor keeps pause proportions |
| Cube look is fixed (colours via internal materials, hint stickers needing hacks — cubing.js #394) | A declarative **Skin**: body colour, sticker colours, sticker shape, gaps, corner radius, logo texture, hint/mask styles per theme; presets per smart-cube model (e.g. GAN 356) |
| Masks, hint ("back") stickers and themes only reachable through experimental APIs | First-class API: per-facelet mask states and their colours, hint distance, theme switch — no three.js internals |
| Everything tied to the player; hard to use logic alone | `@cubecore/core` has zero dependencies and no DOM; renderer is a separate package |

Decisions (2026-09-24):

- **Developed standalone.** Nothing is adopted in act until cubecore is
  ready; it is first exercised on a plain HTML demo page (`demo/`).
- **Many methods, not just CFOP**: CFOP, beginner LBL, Roux, ZZ, Petrus
  from the start (Mehta/others later), each as data (ordered stages with
  predicates) so adding a method needs no engine change.
- **Colour neutral everywhere.** Nothing assumes "white cross on D". Pieces
  are checked against the *current centre colours*, and every method stage is
  searched over all cube orientations (frames) until one fits; the found frame
  anchors the later stages. Works for any colour scheme and when centres move
  (M/E/S, rotations).

Non-goals: other puzzles (2x2, 4x4, megaminx…), a full Twizzle-like editor,
WCA scramble certification.

---

## 1. Technology decisions

- **TypeScript**, ESM, zero runtime deps in `core`/`timeline`. Bun for
  build/test (same toolchain as act).
- **WebAssembly only where it pays**: full-cube solvers (two-phase,
  optimal) and very large pruning tables. Compiled from Rust (or reuse of an
  existing C++ solver if the licence allows), shipped as an optional package
  that runs in a Web Worker. Everything else stays in TS — a move on a
  20-element state is nanoseconds; the JS↔WASM call would cost more.
- **Rendering: three.js** in `@cubecore/render` (mature, handles WebGL
  context loss, text/textures). Keep an internal seam so a raw-WebGL
  renderer could replace it later.
- **Workers** for anything that builds tables or searches, with a Promise
  API; the main thread never blocks.

## 2. Packages (monorepo, bun workspaces)

```
packages/
  core/        @cubecore/core      state, moves, notation, checks, orientation
  solve/       @cubecore/solve     IDA* + pruning tables (cross, xcross, EO, F2L pair, LL cases) — TS, worker
  solve-wasm/  @cubecore/solve-wasm  two-phase / optimal full-cube solver (Rust→WASM), optional
  timeline/    @cubecore/timeline  timed recordings, replay clock, stage timings
  render/      @cubecore/render    three.js scene, animation, camera, drag input, Skin
  element/     @cubecore/element   <cube-player> web component (headless-first) + optional controls
  react/       @cubecore/react     thin React bindings
  bluetooth/   @cubecore/bluetooth adapters from smart-cube drivers to core/timeline events
```

Dependency direction is strictly downward: `core` ← `solve`, `timeline` ←
`render` ← `element` ← `react`. `bluetooth` depends on `core` only.

## 3. `@cubecore/core`

### 3.1 State
- Cubie representation: `cp: Uint8Array(8)`, `co: Uint8Array(8)`,
  `ep: Uint8Array(12)`, `eo: Uint8Array(12)`, plus centre orientation /
  whole-cube orientation (needed for slice/wide moves and rotations).
- Facelet view (`54` stickers) derived on demand for rendering and for
  "what colour is at U-front" queries.
- Immutable by default (`applyMove(state, m) → state`), plus a mutable
  `CubeState` class for hot paths (trackers applying hundreds of moves/s).

### 3.2 Notation
- Parse/format: `U D L R F B`, `' 2`, wide (`r`, `Rw`, `3Rw`-style not needed),
  slices `M E S`, rotations `x y z`, grouping `( )`, repetition `(…)3`,
  commutators/conjugates `[A, B]`, `[A: B]` (optional, phase 2).
- `invert`, `simplify` (cancel/merge `R R' → ∅`, `R R → R2`), `mirror` (L/R),
  metric counts: HTM, QTM, STM, ETM.
- Physical-move expansion: `R2` → two quarter turns, rotations → orientation
  change (what act's `moveParser` does today).

### 3.3 Checks & queries
- `isSolved(state, { ignoreOrientation })`.
- Piece predicates composable into stage checks: `crossSolved(face)`,
  `f2lPairSolved(slot)`, `ollSolved`, `pllSolved`, Roux `fb/sb/cmll/lse`.
- Stage detector for a move stream (CFOP / Roux / LBL), emitting boundaries —
  port of act's `stageDetection`.

### 3.4 Frames, blocks and colour neutrality
- A **Frame** is one of the 24 cube orientations; canonical block
  definitions (e.g. "cross = the D-layer edges", "Roux FB = 1×2×3 on L,
  bottom D") are mapped through it to physical facelet positions.
- A block is **solved** when every facelet in it shows the colour of the
  centre of the face it sits on — no fixed colours anywhere.
- Method stages search frames: the first stage fixes the frame (e.g. which
  face the cross is on), later stages reuse it.

### 3.5 Methods & stage tracking
- Method = ordered stages, each `{ id, check(state, frame) → done | progress }`.
- Built-in: CFOP (cross, F2L ×4 in any order, OLL, PLL, AUF), LBL (cross,
  corners ×4, edges ×4, OLL, PLL), Roux (FB, SB, CMLL, EO, UL/UR, L4E),
  ZZ (EOLine/EOCross, left block, right block, LL), Petrus (2×2×2, 2×2×3,
  EO, F2L, LL).
- `MethodTracker`: feed moves (with timestamps), get stage boundaries and
  the frame each method settled on; several methods can be tracked at once.

### 3.6 Masks
- Per-facelet mask states: `regular | dim | ignored | oriented | invisible`
  (+ `hint` override), built from piece groups (`cross(D)`, `f2lSlot(FR)`,
  `ll`, …). Masks follow pieces, like cubing.js stickering masks.

## 4. `@cubecore/solve`

- Generic IDA* over a coordinate space with a pruning table, move tables and
  a goal predicate.
- Targets and sizes (plan tables accordingly):
  - **Cross**: 4 edges → 12·11·10·9·2⁴ = 190 080 states — table built in ms.
  - **EOCross**: cross + orientation of the other 8 edges (×2⁷) ≈ 24M — use
    cross table × EO table as separate heuristics (max), no joint table.
  - **XCross**: 5 edges × 1 corner ≈ 73M states (the "700 MB" in or18's
    trainer). Options: 4-bit packed joint table (~37 MB, built in a worker on
    first use and cached in IndexedDB) **or** IDA* with `max(crossTable,
    pairTable)` heuristic — slower search, no big table. Start with the
    heuristic version; add the packed table if search times are too slow.
  - **F2L pair / LL cases**: small coordinate spaces; also used to generate
    "case" scrambles.
- API: `solveCross(state, face, { all: true, maxDepth })` → all optimal
  solutions; `distance(state, target)`.
- Scramble generation "state at exact optimal depth N" (act's trainer need):
  sample from depth-indexed table, then produce a full random-looking
  scramble via `solve-wasm`.

## 5. `@cubecore/timeline`

- Recording format: `{ scramble, moves: [{ move, t }] , startedAt, endedAt,
  meta }` with `t` in ms from start. Compact binary/base64url encoding for
  links (act's share-link codec is the reference: 4-bit moves + LEB128
  deltas at 10 ms).
- `ReplayClock`: `play/pause/seek(ms)/rate`, emits `move-start`, `move-end`,
  `stage`, `tick`. A move's animation starts at its recorded `t` and lasts
  `min(recordedGap, maxAnimMs)` so fast triggers stay fast and pauses stay
  pauses. `rate` scales time; optional "compress pauses over X s".
- Stage timings (recognition / execution / total per stage) — port of act's
  `computeStageTimings`.

## 6. `@cubecore/render`

- three.js scene: 26 cubies, animated layer turns, camera orbit, optional
  drag-to-rotate and drag-to-turn.
- **Skin** (plain data, serialisable, presets exported):
  ```ts
  interface Skin {
    body: string;                       // plastic colour
    gap: number; cubieRadius: number;
    stickers: { colors: Record<Face, string>; shape: "square" | "rounded" | "custom"; radius?: number; inset: number; sdf?: string };
    logo?: { face: Face; facelet: number; image: string; scale?: number };
    mask: Record<MaskState, { color?: string; opacity: number }>;
    hints: { distance: number; opacity: number; colorOverrides?: Partial<Record<Face, string>> };
  }
  ```
  Sticker shapes via an SDF fragment shader on a quad (any shape, one
  draw call per material); logo as a texture on one facelet.
- Themes: `skin.light` / `skin.dark` variants; switching re-renders once.
- Fixes by construction: white hint stickers and masked stickers get their
  own colours per theme (cubing.js #394).
- Presets: `standard`, `stickerless`, `gan356`, `ganI3`, `moyuWeilong`…
  (colours/shape/logo per model; bluetooth adapters report the model).

## 7. `@cubecore/element` / `@cubecore/react`

- `<cube-player>`: no UI by default. Attributes/properties: `state`,
  `alg`, `setup`, `timeline`, `mask`, `skin`, `theme`. Methods `play`,
  `pause`, `seek`, `step`. Events `move`, `stage`, `timeupdate`, `ended`.
- `<cube-controls for="player-id">`: optional default controls built from
  ordinary buttons with `part` names and CSS variables — or render your own
  against the same methods/events.
- React: `useCubePlayer()` hook + `<CubePlayer>`; no styling opinions.

## 8. `@cubecore/bluetooth`

- Adapter interface: `connect()`, `onMove(move, timestampMs)`,
  `onState(facelets)`, `battery`, `model` (drives the Skin preset).
- Wrap an existing driver library (act uses `smartcube-web-bluetooth`) rather
  than reimplementing protocols; feed `core` (live state) and `timeline`
  (recording) directly.

## 9. Phases

1. **Core** — state, notation (parse/format/invert/simplify/mirror), metrics,
   `isSolved`, masks, stage checks. Exhaustive tests (move group
   identities: `R4 = id`, `(R U R' U')6 = id`, superflip, inverse
   round-trips; parity with cubing.js kpuzzle on random scrambles).
2. **Timeline** — recording format + codec, `ReplayClock`, stage timings.
   Tested with fake clocks.
3. **Solve (TS)** — cross, EOCross, xcross (heuristic), F2L pair; worker
   wrapper; benchmark suite. Cross-check against act's current engine results.
4. **Render MVP** — cubies, animation, camera, Skin (colours, rounded
   stickers, gaps), masks, hints, themes; timeline-driven replay.
   Visual tests via Playwright screenshots.
5. **Element + controls + React.**
6. **Skins & presets** — SDF sticker shapes, logo texture, smart-cube presets.
7. **Bluetooth adapters.**
8. **solve-wasm** — two-phase full solver for random-state scrambles.
9. **Adopt in act** behind a flag, page by page (Solve analysis replay first:
   it benefits most from timed replay and styled controls).

## 10. Status

- 2026-09-24 — **Phase 1 core done** (`packages/core`): geometry-derived
  moves (face/wide/slice/rotation), notation (repetition, commutators,
  conjugates, invert/simplify/mirror, HTM/QTM/STM/ETM), sticker-identity
  state + facelet strings, 24 frames + `transformMoves`, colour-neutral
  checks, methods CFOP/LBL/Roux/ZZ/Petrus, `MethodTracker` (per-frame
  progress, best frame wins; ~0.005 ms per move). 26 tests, every method
  test repeated in all 24 orientations. Demo: `bun run demo` (2D net,
  scrubber, all methods side by side, colour scheme + orientation switch).
- Next: masks (3.6) → `timeline` → `solve` (cross/xcross) → renderer.

## 11. Open questions

- Licence (MIT vs MPL/GPL) — decide before copying/porting anything from
  cubing.js or or18; check their licences first.
- npm: `cubecore` and `@cubecore/*` scope must be claimed before publishing
  (`cubecore` looked free on 2026-09-24).
- three.js as a peer dependency vs bundled.
- How much of act's `stageDetection` / share codec moves into cubecore vs
  stays app-specific.
