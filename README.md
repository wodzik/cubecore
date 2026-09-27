# cubecore

A 3×3×3 cube library for the web, built around smart (Bluetooth) cubes: a
headless core for state, notation and colour-neutral method analysis;
solvers and random-state / trainer scrambles; timed recordings and share
codecs; a three.js renderer with skins down to per-model piece geometry;
SVG / PNG pictures; web components with themable controls; React bindings.

TypeScript, ESM; one npm package (`cubecore`), developed as Bun workspaces. Everything runs in the browser; the
headless packages also run in Node / Bun / workers.

## Packages

| package | what |
|---|---|
| `cubecore/core` | state (sticker permutation + centre spins), notation (parse / format / invert / simplify / mirror, `(…)3`, `[A, B]`, `.` pauses, comments, source ranges), metrics, 24 frames and colour neutrality, check primitives, method engine (`Method`, `MethodTracker`), masks, pieces view (Kociemba), 15-char state codec, facelet strings, face turns as a smart cube reports them (`toFaceTurns`, `OrientationTracker`), live move log (`MoveCollapser`: R R → R2, R L' → M), following a scramble / algorithm (`SequenceTracker`) |
| `cubecore/cfop`, `roux`, `zz`, `petrus`, `lbl` | methods: stages, their checks, masks, trainer stages; CFOP: OLL / PLL recognition (colour neutral, speedcubedb numbering and names; which case came up after F2L / OLL in a solve) |
| `cubecore/methods` | all methods together, masks by name |
| `cubecore/solve` | two-phase solver (≤ 21 moves, ms), optimal stage solvers (cross, EOCross, xcross, xxcross, slot, Roux blocks), random-state scrambles with presets, trainer scrambles (a stage in exactly N moves), from the cube's current state, any face; Web Worker with a Promise API; tables kept in IndexedDB |
| `cubecore/timeline` | recordings, replay clock (moves end at their recorded time), stage timings, sections for progress bars, pause compression, recording and share codecs |
| `cubecore/skin` | skins as data: tile shapes, stickerless tiles, piece shapes, decals (PNG / SVG), features (`defineFeature`), glTF piece models, light / dark themes; presets `default`, `gan`, `qiyiSC`, `moyu` and their stickered versions (`withStickers`), matte / UV (`withFinish`) |
| `cubecore/render` | three.js `CubeRenderer`: skins, masks, back stickers, back view, gyro orientation, partial layers, glTF pieces (+ templates exporter) |
| `cubecore/image` | SVG pictures (iso / top / net) from the same skin; PNG in the browser or via resvg on a server; cache keys |
| `cubecore/bld` | Blindfolded (Old Pochmann): letter schemes (ruwix, Speffz), memo, execution followed letter by letter, a skin with letters |
| `cubecore/analyze` | scramble analysis — CFOP: per cross colour the optimal cross / Cross+1…3, the best pair order (fewest moves or by F2L algorithms), OLL / PLL cases, coverage of known algorithms; Roux: per block side FB, second square + block, CMLL case, optimal LSE; ZZ: EOCross, R U L pairs, OCLL + PLL; worker |
| `cubecore/element` | `<cube-player>` (algorithms at a tempo or timed solves; controls, progress bar with stage sections, 2D views, live mode), `<cube-scramble>` (follows a scramble on a smart cube; paste your own), `<cube-alg-practice>` (algorithm practice: hidden moves, hints, mistakes, TPS), `<cube-bld>` (blindfolded memo and execution), `<cube-alg>` (the text in sync) |
| `cubecore/bluetooth` | `SmartCubeSession` over smartcube-web-bluetooth (GAN, MoYu, QiYi, GoCube, Giiker): moves timed by the cube's clock, resync, gyro, battery; skin per cube; `SimulatedCube` |
| `cubecore/react` | `<CubePlayer>`, `<CubeScramble>`, `<CubeAlgPractice>`, `<CubeAlg>`, `useSmartCube()`, `useSolverWorker()` |

## Quick start

```html
<script type="module">import "cubecore/element";</script>
<cube-player alg="R U R' U R U2 R'" anchor="end" skin="gan" progress></cube-player>
```

```ts
import { SmartCubeSession } from "cubecore/bluetooth";
import { MoveCollapser } from "cubecore/core";
import { createSolverWorker, STAGES } from "cubecore/solve";

const cube = await SmartCubeSession.connect();          // from a click
const log = new MoveCollapser();
cube.on("move", ({ move, time }) => log.push(move, time));
document.querySelector("cube-player").attach(cube, { autoSkin: true });

const solver = createSolverWorker();
const { moves } = await solver.stageScramble({ stage: STAGES.cross(), length: 6, from: cube.state });
document.querySelector("cube-scramble").scramble = moves;
```

## Guides

- [docs/core.md](docs/core.md) — state, notation, frames and colour neutrality, methods, masks, smart-cube moves
- [docs/cases.md](docs/cases.md) — OLL / PLL / CMLL recognition
- [docs/scrambles.md](docs/scrambles.md) — solvers, scrambles, trainer stages, following a scramble, `<cube-scramble>`, `<cube-alg-practice>`, arrows
- [docs/player.md](docs/player.md) — `<cube-player>`, algorithm vs recording, sections, `<cube-alg>`, customising controls
- [docs/render.md](docs/render.md) — the three.js renderer, still pictures, turn arrows, SVG / PNG
- [docs/skins.md](docs/skins.md) — making skins: shapes, decals, features, glTF pieces, themes
- [docs/timeline.md](docs/timeline.md) — recordings, stage timings, replay, codecs, statistics
- [docs/analyze.md](docs/analyze.md) — scramble analysis for CFOP, Roux and ZZ
- [docs/bld.md](docs/bld.md) — blindfolded: letters, memo, execution, `<cube-bld>`
- [docs/bluetooth.md](docs/bluetooth.md) — smart cubes
- [docs/react.md](docs/react.md) — React

## Development

```sh
bun install
bun test            # ~220 tests (core parity with cubing.js included)
bun run typecheck
bun run demo        # http://localhost:3000 — core, 3D, skins, player, sequences, BLD, analysis, React, smart cubes
bun scripts/export-models.ts ganI4 ./out   # a skin's pieces as glTF templates
bun run build:npm 0.1.0                    # the npm package in dist/package
```

In the repository every part is a workspace package (`packages/core` is
`@cubecore/core`…); `bun run build:npm` compiles them into the single
`cubecore` package, one subpath each.

The demo shows brand logos on the cubes only if you supply them: PNGs in
`../cubecore-assets` next to the repo (or `CUBECORE_ASSETS=/path`). Brand
logos are trademarks and are never part of this repository.

## Install

```sh
npm install cubecore            # plus three for 3D / elements, react for cubecore/react
```

One package, a subpath per part — import only what you use:
`cubecore/core`, `cubecore/cfop`, `cubecore/roux`, `cubecore/zz`, `cubecore/petrus`,
`cubecore/lbl`, `cubecore/methods`, `cubecore/solve`, `cubecore/timeline`,
`cubecore/skin`, `cubecore/render`, `cubecore/image` (+ `cubecore/image/png-node`),
`cubecore/bld`, `cubecore/analyze`, `cubecore/element`, `cubecore/bluetooth`,
`cubecore/react`. `three`, `react` and `@resvg/resvg-js` are optional peer
dependencies: install them if you use the parts that need them.

The solver and analyser run in Web Workers created with
`new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`,
which Vite, webpack 5 and other bundlers pick up by themselves.

## Licence

[Mozilla Public License 2.0](LICENSE). You can use cubecore in any project,
open or closed; changes to cubecore's own files must be shared under the
same licence.

## Credits

- The `gan` skin's piece shapes were measured from
  ["GAN CUBE 356s M air"](https://sketchfab.com/3d-models/gan-cube-356s-m-air-dd4768b8fe2841c78e418230e5d9e192)
  by Amyyu (Sketchfab, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- Smart-cube protocols: [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth)
  by Pau Oliva and Andy Fedotov (MIT).
- Case numbering, names and groups (OLL, PLL, F2L, CMLL) follow
  [speedcubedb.com](https://speedcubedb.com).
- Notation and state tests compare against [cubing.js](https://github.com/cubing/cubing.js).
- Cube names such as GAN, MoYu and QiYi are trademarks of their owners;
  cubecore is not affiliated with them.
