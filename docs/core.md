# Core and methods (`cubecore/core`, `cfop`, `roux`, `zz`, `petrus`, `lbl`, `methods`)

`cubecore/core` is headless — no DOM, no three.js — and runs in the browser,
Node, Bun and workers. Everything else builds on it.

## State and notation

A state is a `Uint8Array` of 54 stickers: position → which sticker sits there
(faces in Kociemba order U R F D L B, 9 stickers each). Centres are stickers
too, so rotations and slices are ordinary permutations.

```ts
import { applyMoves, isSolved, parseAlg, formatAlg, invert, simplify, moveCount, solvedState } from "cubecore/core";

const s = applyMoves(solvedState(), "R U R' U'");   // a string or Move[]
isSolved(s);                                        // false; a solved cube held any way counts as solved

const moves = parseAlg("[R, U] (R U2)3 M' . x");    // commutators, repeats, pauses, rotations
formatAlg(invert(moves));
simplify(parseAlg("R R U U'"));                     // R2
moveCount(moves, "stm");                            // htm, qtm, stm, etm
```

- `parseAlgDocument(text)` keeps comments and the source range of every move
  (for highlighting the text while an algorithm plays); `NotationError` has
  the position of a mistake.
- `mirrorLR(moves)` mirrors left ↔ right.
- `CubeState` is a mutable wrapper for hot loops: `new CubeState().apply("R U").isSolved()`.
- `relativeState(from, to)` is the state whose solution takes `from` to `to` —
  how every solver and scramble works from the cube's current state.

### Pieces, facelets, share codes

- `toCubies(state)` / `fromCubies(c)` — corner / edge permutation and
  orientation (Kociemba numbering), `isSolvable(c)`.
- `toFaceletString` / `fromFaceletString` — the 54-letter "UUUUUUUUURRR…"
  strings other solvers use; `stateFromFacelets` / `faceletsOf` read and write
  colour strings.
- `encodeState(state)` / `decodeState(text)` — a state in 15 URL-safe
  characters, for links and storage.

## Frames and colour neutrality

A `Frame` is one of the 24 ways to hold the cube (`FRAMES`). Every check is
written once for the canonical grip (first layer on D, last layer on U) and
run on `view(state, frame)`, so every method works on any face in any
colour scheme.

```ts
import { FRAMES, frameFor, frameForColors, view, transformMoves } from "cubecore/core";

const whiteDown = frameForColors(state, "U");       // the frame with the white (U-coloured) centre down
const canonical = view(state, whiteDown);           // the state as seen held that way
transformMoves(parseAlg("R U R'"), frameFor("F"));  // the same moves for a cube held with F down
```

## Methods

A method is data: an ordered list of stages, each a check on the canonical
view. The method packages build theirs from `checks` (`crossSolved`,
`solvedPairs`, `topOriented`, `edgesOrientedFB`…), so adding a method needs
no engine change.

```ts
import { MethodTracker, analyzeSolve } from "cubecore/core";
import { CFOP } from "cubecore/cfop";

const tracker = new MethodTracker(CFOP, "R U F' D2 …");     // the scramble (or a start state)
cube.on("move", ({ move, time }) => {
  for (const b of tracker.push(move, time)) console.log(b.stage, b.moveIndex, b.detail, b.case);
});
tracker.current;      // { next: "oll", done: false, frame, case: "OLL 27" }
tracker.bottomFace;   // the face the cross was built on

analyzeSolve(CFOP, scramble, solution, times);        // all boundaries at once
```

The tracker follows the method in all 24 frames at once and reports the
one that got furthest, so a cross that appears by accident elsewhere
doesn't take over the analysis. `detail` is the F2L slot as physical faces
("FR"…); `case` is the OLL / PLL / CMLL the stage started from.

| package | method | stages | extras |
|---|---|---|---|
| `cubecore/cfop` | `CFOP` | cross, F2L 1–4 (any order), OLL, PLL, AUF | OLL / PLL / F2L recognition ([cases.md](cases.md)), masks `cross` `f2l` `oll` `pll` `coll` `zbll` `els` `cls`…, `CFOP_TRAINERS` |
| `cubecore/roux` | `ROUX` | first block, second block, CMLL, EO, UL/UR, L4E | CMLL recognition, masks `fb` `blocks` `cmll` `lse` `eo` `ulur`, `ROUX_TRAINERS` |
| `cubecore/zz` | `ZZ` | EOLine, left and right block, last layer | EOCross check, masks `eoline` `eocross` `f2l`, `ZZ_TRAINERS` |
| `cubecore/petrus` | `PETRUS` | 2×2×2, 2×2×3, EO, F2L, last layer | masks |
| `cubecore/lbl` | `LBL` | the beginner's method: cross, first layer, second layer, orient, permute corners, permute edges | masks |
| `cubecore/methods` | `METHODS`, `methodById` | all of the above | `maskByName("cfop:oll", frame)`, `MASK_NAMES` |

Trainer stages (`CFOP_TRAINERS`…) are the stage definitions the solver uses
for trainer scrambles — see [scrambles.md](scrambles.md).

## Masks

A mask gives every sticker a state: `regular`, `dim`, `ignored` (grey),
`oriented` (a single colour for "oriented" pieces) or `invisible`. Masks are
rules on the canonical grip, built for the frame the cube is held in:

```ts
import { buildMask, presetMask } from "cubecore/core";
import { cfopMask } from "cubecore/cfop";

renderer.setMask(cfopMask("oll", whiteDown));
presetMask("first-layer");
buildMask((facelet, cubie) => (cubie.kind === "corner" ? "regular" : "ignored"), frame);
```

## Smart-cube moves

A smart cube reports face turns only. Three helpers bridge the gap between
what it reports and what was written:

- `toFaceTurns(alg, start?)` — an algorithm with rotations, slices and wide
  moves as the face turns the cube will report, and how it ends up held.
  `OrientationTracker` does the same one move at a time.
- `MoveCollapser` — the live move log: R R → R2, R L' → M (within
  `sliceWindowMs`, 200 ms by default). `push(move, time)` returns what to
  remove from the end of the log and what to add.
- `SequenceTracker(target, start, { frame, maxCorrection })` — following a
  scramble or an algorithm: done / partial / current / wrong-way tokens, the
  undo after a slip, and `nextTurn` for arrows. `PracticeTracker` adds hidden
  moves, hints, mistakes and TPS. See [scrambles.md](scrambles.md).
- `turnArrow(move, frame)` — the axis, layers and direction of an arrow for
  a move, for the 3D renderer ([render.md](render.md)).
