# Scramble analysis (`@cubecore/analyze`)

In the spirit of speedcubedb.com/analyze: for each cross colour, a good
CFOP way through a scramble — so an app can show the optimal cross, the
recommended first pair, the pair order, the cases that come up, and how
much of it the solver's own algorithms cover.

```ts
import { analyzeScramble, createAnalyzerWorker } from "@cubecore/analyze";

const a = analyzeScramble("D2 R2 F2 U' B2 …", { f2l: "optimal", start: "cross" });
a.best.face            // "F" — the best cross colour (physical face)
a.best.rotation        // "x'" — hold like this (cross on the bottom), then do the moves as written
a.best.steps           // cross, pair FR / BR / FL / BL (in the best order), OLL, PLL, AUF — moves, cases
a.best.pairOrder       // ["FR", "BR", "FL", "BL"] — [0] is the recommended first pair
a.byCross              // all six colours, shortest first
```

Options:

| option | |
|---|---|
| `start` | `"cross"` (full solve), `"xcross"` / `"xxcross"` / `"xxxcross"` — cross + 1–3 pairs solved optimally together, best slots ("Cross+1…3") |
| `f2l` | `"optimal"`: each pair the fewest moves keeping the cross and pairs in, over all 24 orders; `"algorithms"`: each pair its F2L case's algorithm (pre-AUF + alg) over all orders — a pair outside the 41 cases (piece in another slot) falls back to fewest moves (`how: "optimal"`) |
| `crosses` | faces to try (default all six) |
| `known` | case ids the solver knows ("F2L 7", "OLL 27", "T") — steps get `known: true / false` (coverage) |

The last layer goes by OLL + PLL algorithms and AUF, with the cases named
(speedcubedb numbering). Step moves are face turns in the cross grip (ready
for a smart cube); algorithm steps also carry `alg` as written.

Timing (Apple Silicon): the first analysis builds the F2L tables (~10–20 s,
then kept in IndexedDB by the worker); after that all six colours take
~0.5 s with `"optimal"`, ~50 ms with `"algorithms"`. Use the worker:

```ts
const analyzer = createAnalyzerWorker();          // or createAnalyzerWorker("/analyzer-worker.js")
const a = await analyzer.analyze(scramble, { f2l: "algorithms", known: myCases });
```

Demo: `/analyze`.
