# cubecore

A 3×3×3 cube library for the web, built around smart (Bluetooth) cubes: a
headless core for state, notation and colour-neutral method analysis;
solvers and random-state / trainer scrambles; timed recordings and share
codecs; a three.js renderer with skins down to per-model piece geometry;
SVG / PNG pictures; web components with themable controls; React bindings.

TypeScript, ESM, Bun workspaces. Everything runs in the browser; the
headless packages also run in Node / Bun / workers.

## Packages

| package | what |
|---|---|
| `@cubecore/core` | state (sticker permutation + centre spins), notation (parse / format / invert / simplify / mirror, `(…)3`, `[A, B]`, `.` pauses, comments, source ranges), metrics, 24 frames and colour neutrality, check primitives, method engine (`Method`, `MethodTracker`), masks, pieces view (Kociemba), 15-char state codec, facelet strings, face turns as a smart cube reports them (`toFaceTurns`, `OrientationTracker`), live move log (`MoveCollapser`: R R → R2, R L' → M), following a scramble / algorithm (`SequenceTracker`) |
| `@cubecore/cfop`, `roux`, `zz`, `petrus`, `lbl` | methods: stages, their checks, masks, trainer stages; CFOP: OLL / PLL recognition (colour neutral, speedcubedb numbering and names; which case came up after F2L / OLL in a solve) |
| `@cubecore/methods` | all methods together, masks by name |
| `@cubecore/solve` | two-phase solver (≤ 21 moves, ms), optimal stage solvers (cross, EOCross, xcross, xxcross, slot, Roux blocks), random-state scrambles with presets, trainer scrambles (a stage in exactly N moves), from the cube's current state, any face; Web Worker with a Promise API; tables kept in IndexedDB |
| `@cubecore/timeline` | recordings, replay clock (moves end at their recorded time), stage timings, sections for progress bars, pause compression, recording and share codecs |
| `@cubecore/skin` | skins as data: tile shapes, stickerless tiles, piece shapes, decals (PNG / SVG), features (`defineFeature`), glTF piece models, light / dark themes; presets `standard`, `stickerless`, `gan`, `ganI4`, `gan356m` |
| `@cubecore/render` | three.js `CubeRenderer`: skins, masks, back stickers, back view, gyro orientation, partial layers, glTF pieces (+ templates exporter) |
| `@cubecore/image` | SVG pictures (iso / top / net) from the same skin; PNG in the browser or via resvg on a server; cache keys |
| `@cubecore/bld` | Blindfolded (Old Pochmann): letter schemes (ruwix, Speffz), memo, execution followed letter by letter, a skin with letters |
| `@cubecore/analyze` | scramble analysis (CFOP): per cross colour the optimal cross / Cross+1…3, the best pair order (fewest moves or by F2L algorithms), OLL / PLL cases, coverage of known algorithms; worker |
| `@cubecore/element` | `<cube-player>` (algorithms at a tempo or timed solves; controls, progress bar with stage sections, 2D views, live mode), `<cube-scramble>` (follows a scramble on a smart cube; paste your own), `<cube-alg-practice>` (algorithm practice: hidden moves, hints, mistakes, TPS), `<cube-bld>` (blindfolded memo and execution), `<cube-alg>` (the text in sync) |
| `@cubecore/bluetooth` | `SmartCubeSession` over smartcube-web-bluetooth (GAN, MoYu, QiYi, GoCube, Giiker): moves timed by the cube's clock, resync, gyro, battery; skin per cube; `SimulatedCube` |
| `@cubecore/react` | `<CubePlayer>`, `<CubeScramble>`, `<CubeAlgPractice>`, `<CubeAlg>`, `useSmartCube()`, `useSolverWorker()` |

## Quick start

```html
<script type="module">import "@cubecore/element";</script>
<cube-player alg="R U R' U R U2 R'" anchor="end" skin="ganI4" progress></cube-player>
```

```ts
import { SmartCubeSession } from "@cubecore/bluetooth";
import { MoveCollapser } from "@cubecore/core";
import { createSolverWorker, STAGES } from "@cubecore/solve";

const cube = await SmartCubeSession.connect();          // from a click
const log = new MoveCollapser();
cube.on("move", ({ move, time }) => log.push(move, time));
document.querySelector("cube-player").attach(cube, { autoSkin: true });

const solver = createSolverWorker();
const { moves } = await solver.stageScramble({ stage: STAGES.cross(), length: 6, from: cube.state });
document.querySelector("cube-scramble").scramble = moves;
```

## Guides

- [docs/player.md](docs/player.md) — `<cube-player>`, algorithm vs recording, sections, `<cube-alg>`, customising controls
- [docs/skins.md](docs/skins.md) — making skins: shapes, decals, features, glTF pieces, themes
- [docs/scrambles.md](docs/scrambles.md) — solvers, scrambles, the worker, following scrambles
- [docs/bluetooth.md](docs/bluetooth.md) — smart cubes
- [docs/react.md](docs/react.md) — React
- [PLAN.md](PLAN.md) — design decisions and a dated log of what was built

## Development

```sh
bun install
bun test            # ~155 tests (core parity with cubing.js included)
bun run typecheck
bun run demo        # http://localhost:3000 — Core, 3D renderer, Playground, Player, React, Smart cube
bun scripts/export-models.ts ganI4 ./out   # a skin's pieces as glTF templates
```

`smartcube-web-bluetooth` is a git dependency without a build; the
workspace resolves it to its TypeScript sources (tsconfig `paths`).

Licence: to be decided.
