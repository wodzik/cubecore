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

## Roux

```ts
const r = analyzeRoux(scramble, { known: myCmllCases });     // or analyzer.analyzeRoux(…) in the worker
r.best.side / r.best.bottom   // the first block against this face, bottom on that one (best of four bottoms per side)
r.best.rotation               // hold like this: block on the left, its bottom down
r.best.steps                  // fb, ss ("front" / "back"), sb, cmll (case named), lse (M / U; eo / ulur / l4e move counts)
r.bySide                      // all six sides, shortest first (STM: a slice counts one)
```

Blocks are the fewest face turns (first block optimal; then the better
second square and the rest of the second block, each optimal keeping what's
built) — any face turns, so shorter than the usual ⟨R, r, U, M⟩ style; CMLL
by its algorithm (named, speedcubedb); LSE optimal in M and U from an exact
table (184 320 states, ~1 s to build). Warm: a whole analysis in ~10 ms;
the first builds the block tables (~12 s, kept in IndexedDB by the worker).

## ZZ

```ts
const z = analyzeZZ(scramble);     // or analyzer.analyzeZZ(…)
z.best.steps       // cross (the EOCross), pair ×4 — R, U, L only — in the best order, oll (OCLL / skip), pll, auf
z.best.eoAxis      // physical faces the edges are oriented against, e.g. ["F", "B"]
z.byCross          // all six cross colours, shortest first (HTM)
```

Classic ZZ: `analyzeZZ(scramble, { start: "eoline" })` — EOLine (edges
oriented + DF, DB; ~6 moves), then the left and right blocks with R U L in
the better order (`steps`: eoline, block, block, oll, pll, auf;
`blockOrder`). The R U L stages build their tables with R U L only — tiny
and exact, so each block takes milliseconds.

EOCross optimal on the better of the two EO axes; the pairs keep every
edge oriented (R U L — the stage's `moves`), so the last layer's OLL is a
corners-only case. Warm: ~0.2 s for all six colours.

Demo: `/analyze` (CFOP / Roux / ZZ with EOCross or EOLine).
