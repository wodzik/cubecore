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
  core/        @cubecore/core      state, moves, notation, check primitives, frames, method engine
  cfop/        @cubecore/cfop      CFOP stages, masks, case recognition (OLL/PLL…), alg sets
  roux/        @cubecore/roux      Roux stages, masks, CMLL/LSE cases
  zz/          @cubecore/zz        ZZ stages (EOLine/EOCross…), masks
  petrus/      @cubecore/petrus    Petrus stages, masks
  lbl/         @cubecore/lbl       beginner layer-by-layer stages, masks
  methods/     @cubecore/methods   optional: all methods together (METHODS), method auto-detection
  solve/       @cubecore/solve     two-phase solver + random-state scrambles (done); cross / xcross / EO / pair solvers — TS, worker
  solve-wasm/  @cubecore/solve-wasm  two-phase / optimal full-cube solver (Rust→WASM), optional
  timeline/    @cubecore/timeline  timed recordings, replay clock, stage timings
  skin/        @cubecore/skin      Skin data + tile geometry, shared by render and image
  render/      @cubecore/render    three.js scene, animation, camera, drag input
  image/       @cubecore/image     SVG pictures of states (iso / top / net), cacheable, server-side PNG
  element/     @cubecore/element   <cube-player> web component (headless-first) + optional controls
  react/       @cubecore/react     thin React bindings
  bluetooth/   @cubecore/bluetooth adapters from smart-cube drivers to core/timeline events
```

Dependency direction is strictly downward: `core` ← `solve`, `timeline` ←
`render` ← `element` ← `react`. `bluetooth` depends on `core` only. Method
packages depend on `core` (and later on `solve` for case scrambles); nothing
in `core` knows any concrete method.

### Method packages (decided 2026-09-24)

`core` keeps the **engine**: the `Method` / `Stage` interfaces,
`MethodTracker`, frames, colour-neutral check primitives (block solved, edge
orientation, pair solved, layer oriented/permuted…) and generic
`buildMask`. Each method is its own package built only from those
primitives — so every method stays colour neutral by construction:

- `@cubecore/cfop` — stages (cross, F2L ×4 with slot detail, OLL, PLL, AUF),
  mask presets (`cross`, `f2l`, `oll`, `pll`, `coll`, `ocll`, `ell`, `cll`),
  later: OLL/PLL/COLL case recognition from a state (in any frame / AUF),
  alg sets as data, case scrambles via `solve`.
- `@cubecore/roux` — FB, SB, CMLL, EO, UL/UR, L4E; masks `roux-fb`,
  `roux-blocks`, `cmll`, `lse`; later CMLL recognition.
- `@cubecore/zz` — EOLine/EOCross, blocks, LL; masks `eoline`, `zz-f2l`.
- `@cubecore/petrus`, `@cubecore/lbl` — stages and masks.
- `@cubecore/methods` — re-exports all of them as `METHODS` / `methodById`
  and adds "which method was this solve?" (track all, pick the best fit).

Generic presets (`full`, `ll`, `first-layer`) stay in core. Why separate
packages rather than one `methods` package with subpaths: recognition tables
and alg sets make CFOP much larger than the rest, and an app for one method
shouldn't download or version the others. Migration done (see Status): no
re-export shims in core — they would make core depend on the method packages
(a cycle), and nothing was published yet.

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
- 2026-09-24 — **masks, timeline, images**: masks follow pieces, 17
  colour-neutral presets. `@cubecore/timeline`: recordings, a 6-bit/varint
  URL-safe codec (all move families), `positionAt` + `ReplayClock` (moves
  end at their recorded time, rate, seek), stage timings with recognition /
  execution / fluency. `@cubecore/image` (new, not in the original plan):
  SVG strings with no DOM — iso, last-layer "top" and net views, schemes,
  masks, frames, rounded stickers — ~0.04 ms per image; `SvgCache` + stable
  `svgKey` for any cache; PNG via canvas in the browser or
  `@cubecore/image/png-node` (resvg) on a server. 47 tests.
- 2026-09-24 — **3D renderer MVP** (`@cubecore/render`, three.js peer
  dependency): `CubeRenderer` with no built-in UI (`setState`, `animate`,
  `showPartial`, `showPosition` for timeline replays, `setMask`, `setSkin`,
  `setCamera`, drag-to-orbit), on-demand rendering, camera auto-fit (also
  with back stickers), Skin presets `standard` / `stickerless` / `gan`,
  back ("hint") stickers per skin, smart-cube-friendly queue (backlog applied
  instantly, only the newest move animates: 20 moves caught up in ~150 ms),
  `setOrientation(quaternion, smoothing)` for gyroscopes. Demo: `/render`.
- 2026-09-24 — **one skin for 3D and 2D**: `@cubecore/skin` (pure data +
  geometry, no three.js) holds `Skin`, presets, tile shapes per piece kind,
  custom SVG tile outlines, stickerless tiles (`fillOuter`: a piece's faces
  meet on the cube edge — mitred in 3D) and the logo. `@cubecore/render` and
  `@cubecore/image` both draw from it (`renderSvg(state, { skin })`; the old
  `scheme`/`stickerRadius`/`gap` options are gone — use `withColors`).
  Centre spins in core (`advanceSpins`, `spinsAfter`): the renderer tracks
  them through every move, `setState`/`showPosition`/`renderSvg` take them,
  so a logo keeps its orientation. Demo `/render` shows the same skin in 2D.
- 2026-09-24 — **back view**: `backView: "none" | "side-by-side" |
  "top-right"` (option + `setBackView`) — a second camera opposite the main
  one shows the three hidden faces; one WebGL context, scissored viewports;
  the inset only clears depth and back stickers are hidden in it.
- 2026-09-24 — **methods split into packages**: `@cubecore/cfop`, `lbl`,
  `roux`, `zz`, `petrus` (method + its checks + masks as `MaskRule`s, e.g.
  `CFOP_MASKS.oll`, `cfopMask("oll", frame)`), `@cubecore/methods`
  (`METHODS`, `methodById`, `MASK_NAMES`, `maskByName("roux:cmll")`). Core
  keeps the engine: `Method`/`Stage`, `countedStages`, `LAST_LAYER_STAGES`,
  `MethodTracker`, exported check primitives (`cubieSolved`, `allSolved`,
  `upToAuf`, `cubieAt`…) and generic masks (`full`, `first-layer`, `ll`).
  `@cubecore/core/testing` has `runSegments` for method-package tests.
- 2026-09-24 — **tile profiles (level 1 of per-model geometry)**: tiles
  are solids from `tile.ts` — outline (shape / SVG path / stickerless) swept
  through a cross-section: wall sunk into the body, rounded top edge
  (`stickers.bevel`), 45° mitre on the cube's outer edges so stickerless
  colours still meet. `stickers.material: "plastic"` (lit, emissive lift so
  colours stay vivid) vs "flat" (exact colours); `bodyInset` shrinks the black
  core under thick tiles. `gan` / `stickerless` presets use it; `standard`
  keeps flat stickers. Next levels: a custom cross-section curve, then glTF
  piece models per cube model (materials named sticker-U/F/R, body).
- 2026-09-24 — **GAN i4-style skin + finer stickerless**: `stickers.edgeRadius`
  rounds the cube's edges (each tile takes 45° of the round, meeting on the
  mitre — colour runs round the edge), `stickers.roughness` (matte ↔ UV
  gloss), `stickers.centerHoles` (translucent discs, 3D and SVG). New preset
  `ganI4` from product photos (light internals, minimal gaps, squarish holed
  centres); `stickerless` / `gan` gaps made minimal.
- 2026-09-24 — **shaped pieces**: `pieces: { depth, taper, core }` — under
  each tile the piece's plastic follows the tile outline into the cubie and
  narrows (front larger than back; centres as round as their tiles), around a
  small core, instead of one rounded box. `gan` / `ganI4` use it; i4 tile
  corners less rounded. Demo: "hold a layer part-way" slider (showPartial).
- 2026-09-24 — **extensible skins**: geometry split out of the renderer
  (`build/tiles.ts` — tile/piece geometry kit for a skin; `build/attachments.ts`
  — things riding on stickers). Sticker selectors (`{ faces, kinds, stickers }`),
  decals (any PNG/SVG, replaces `logo`), features via a registry
  (`defineFeature` with `build3d` + optional `svg`; built-ins `holes`, `slot`;
  replaces `centerHoles`) — per sticker, so e.g. a charging port only on the
  yellow centre; everything follows its sticker and turns with it (core
  `stickerTurn`). Same in SVG pictures. Guide: `docs/skins.md`.
- 2026-09-24 — **smart-cube notation, codecs, scrambles** (from the
  cubing.js comparison): `toFaceTurns` / `OrientationTracker` (an algorithm
  as the face turns a smart cube reports — r U → L F — and where the centres
  are afterwards), `MoveCollapser` (live log: R R → R2, R R' kept, opposite
  faces together → M/E/S in any reporting order), `cubies.ts` + a 15-char
  state codec, share links in timeline, colour-neutral `frameFor` /
  `frameForColors` and more masks (LS, ELS, CLS, VLS, ZBLS, EPLL, CPLL, ZBLL,
  EOCross, LSE EO, UL/UR, centres, void). New `@cubecore/solve`: two-phase
  solver in TS (tables ~0.5 s, solves in a few ms, ≤ 21 moves) and
  random-state scrambles with presets (full, F2L, last slot, LL, ZBLL, PLL,
  ELL, CMLL) on any face via frames.
- 2026-09-24 — **`<cube-player>`** (`@cubecore/element`): plays an algorithm
  at a tempo or a recorded solve in real time; default controls (inline SVG
  icons, time, speed) and an optional progress bar (`progress`: click / drag
  / keys to seek, `markers`: stage ends from a method). Themable with
  `--cc-*` variables and `::part()`, replaceable via `slot="controls"` or
  `controls="none"` + the API (play / pause / seek / step…) and events.
  Container query keeps the bar on one row down to ~300 px. Demo `/player`,
  guide `docs/player.md`.
- 2026-09-24 — **smart cubes** (`@cubecore/bluetooth`): `SmartCubeSession`
  over smartcube-web-bluetooth (used from its TS sources via a tsconfig path —
  the git dependency ships no build) — moves with times from the cube's own
  clock (ClockSync: bursts from a backgrounded tab and resent moves keep their
  real times, flagged `late`), tracked state resynced from FACELETS reports,
  calibrated gyro for `setOrientation`, battery / hardware; `SimulatedCube`
  with the same events. Core: `stateFromFacelets` / `faceletsOf`.
  `<cube-player>` live mode: `attach(session)` / `detach()` / `pushMove()`.
  Demo `/bluetooth` (real or simulated cube, written log, CFOP stages), guide
  `docs/bluetooth.md`. Demo pages share a menu (`demo/nav.ts`).
- 2026-09-24 — **stage solvers, trainer scrambles, worker, following
  scrambles**: `StageSolver` (cross, EOCross, xcross, xxcross, slot, Roux FB;
  IDA* with group BFS tables; distance, all optimal solutions, next moves,
  sampling at an exact distance), `stageScramble` (a stage in exactly N moves,
  any face, from the cube's current state — core `relativeState`, `reframe` /
  `unreframe`), `createSolverWorker` (Promise API; tables built off the main
  thread), `SequenceTracker` (core; follows scrambles and algorithms on a
  smart cube by state: half turns, reordered opposite faces, slices /
  rotations; undo after a slip) and `<cube-scramble>`. With these, act no
  longer needs cubing.js or or18 for anything. Guide: `docs/scrambles.md`.
- 2026-09-25 — **player: anchor, 2D views, errors; Playground demo**:
  `anchor="end"` (the algorithm solves the cube: start = setup + inverse, as
  act's "this algorithm solves the cube"), `visualization="net" | "top" |
  "iso"` (SVG with the same skin / mask), `error` events for bad notation.
  Demo `/playground`: every player option (timing: tempo / recording / share
  code; skins, page theme, 2D views, back view, hints, masks, stage markers,
  controls) with the matching code snippet.
- 2026-09-25 — **progress bar sections**: `Segment` data + `stageSegments`
  (timeline; any Method), `player.segments` / `player.method`; coloured
  sections (palette or per-segment colour, `::part(segment-<id>)`), hatched
  recognition, `segment-labels` (click to jump), popup over a section
  (`formatSegment`, `tooltips="off"`), PageUp/PageDown, `segmentchange`.
- 2026-09-25 — **glTF piece models** (geometry level 3): `skin.models`
  (corner / edge / centre URLs, scale, surface); convention UFR / UF / U with
  `sticker-X` materials recoloured, rest as authored; placement maths in
  `pieceModels.ts` (tested), loader with fallback to built-in pieces, decals
  / features on per-facelet anchors; `pieceTemplates(skin)` +
  `scripts/export-models.ts` write any skin's pieces as glTF templates;
  sample i4 models in demo/models (CC0), "glTF models (sample)" in /render.
- 2026-09-25 — **notation extras + synced text**: `.` pauses (a beat of
  stillness in tempo playback), `parseAlgDocument` (moves with source
  ranges — repeats / commutator inverses point at the original — pauses,
  comments), player `seekToMove`, `applied`, `moves`, `load` event;
  `<cube-alg for>` highlights the move playing, click to jump.
- 2026-09-25 — **light / dark skin themes**: `skin.themes` (+ `themed`,
  `hintColor`, `hints.colors`), presets carry a light-page theme (lighter
  masked greys, blue-grey white back sticker); renderer `theme` /
  `setTheme`, `renderSvg({ theme })`, `<cube-player theme="light|dark|auto">`.
- 2026-09-25 — **skins for smart cubes**: `skinForCube` rules (protocol /
  device / hardware name → skin; GAN i4 → ganI4, GAN → gan, else
  stickerless), `registerCubeSkin` for app rules, `session.suggestedSkin`,
  `player.attach(…, { autoSkin })`. Per-model skins beyond i4 wait for
  reference photos (to be prepared before act adoption).
- 2026-09-25 — **leftovers**: parity test with cubing.js kpuzzle (dev
  dependency; 40 random 25-move sequences — every piece and orientation
  identical); `compressPauses` + player `max-pause`; stage tables kept across
  sessions (`preloadStageTables`, `indexedDbTableStore`; the worker's
  `warmUp` uses IndexedDB when there is one); `roux-blocks` stage; stage
  solutions are now said in the cube's own terms when slices / rotations
  moved the centres (bug found by the Roux test).
- 2026-09-25 — **React** (`@cubecore/react`): `<CubePlayer>`, `<CubeScramble>`,
  `<CubeAlg>` (props → attributes / properties / events; ref = the element),
  `useSmartCube()`, `useSolverWorker()`; server-render tests; elements
  importable without a DOM (SSR). Demo `/react`, guide `docs/react.md`.
- Next: overall README.

### Gyroscope (planned)
- `setOrientation(q, smoothing)` is the whole renderer-side API: the cube's
  root group takes the quaternion, independent of the camera orbit.
- A `@cubecore/bluetooth` adapter will map a smart cube's gyro quaternion
  (GAN i3/i4 etc. report one) into the renderer's frame: calibrate on
  "hold the cube as shown" (store the inverse of the current reading), then
  `setOrientation(inverse(calibration) × reading)`; smoothing hides sensor
  noise. Rotations from the gyro never change the cube State — they are view
  only, so method tracking stays unaffected.

## 11. Decisions & open questions

Decided 2026-09-24:
- **three.js and smartcube-web-bluetooth are regular dependencies** of
  `@cubecore/render` / `@cubecore/element` and `@cubecore/bluetooth`.
- **Share links: the library ships the codec only** (`encodeShare` /
  `decodeShare`); building and reading URLs is up to the app.
- **Order**: follow the plan phase by phase; adoption in act comes last —
  after the whole library is done and a few cube skins are prepared.
- Licence and the npm name: decided at the end.

Still open:

- Licence (MIT vs MPL/GPL) — at the end; check cubing.js / or18 licences
  before porting anything from them.
- npm: claim `cubecore` / `@cubecore/*` before publishing (`cubecore` looked
  free on 2026-09-24).
