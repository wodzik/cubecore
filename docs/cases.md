# OLL / PLL recognition (`@cubecore/cfop`)

Cases, numbering, names and groups as on speedcubedb.com: OLL 1–57
(groups "Dot Case", "Square Shapes", "OCLL"…), PLL Aa, Ab, E, F, Ga–Gd, H,
Ja, Jb, Na, Nb, Ra, Rb, T, Ua, Ub, V, Y, Z (groups "Adj Swap", "Opp Swap",
"EPLL"). `OLL_CASES` / `PLL_CASES` hold one standard algorithm per case.

## Recognising a cube

```ts
import { recognizeLastLayer, recognizeOll, recognizePll } from "@cubecore/cfop";

recognizeLastLayer(session.state);
// { face: "U", oll: { id: "OLL 27", group: "OCLL", preAuf: "U'", alg: "R U R' U R U2 R'" }, pll: null }
// { face: "D", oll: "skip", pll: { id: "T", … } }      ← colour neutral: F2L on any face
// null                                                  ← no F2L solved anywhere
```

Colour neutral and scheme-free: it reads colours relative to the centres
(the top colour on the last-layer pieces for OLL; the top rows' colours
against the side centres for PLL), from any angle. `preAuf` is the U turn
before the case's algorithm as the cube is held (last layer up).
`recognizeOll` / `recognizePll` take a cube already held with the last layer
on U. Every one of the 216 orientations and 288 permutations maps to exactly
one case (tested).

## Which case came up in a solve

The CFOP method's OLL and PLL stages recognise the case they start from:

```ts
const t = new MethodTracker(CFOP, scrambled);
// … after F2L:
t.current;          // { next: "oll", case: "OLL 27", … }  — live
t.boundaries;       // [… { stage: "oll", case: "OLL 27", … }, { stage: "pll", case: "T", … }]
```

"OLL skip" / "PLL skip" when a stage was skipped. Any method can do the same
with a stage's `recognize(state)`; `withLastLayerCases(stages)` adds OLL /
PLL recognition to other methods' last-layer stages (ZZ, Petrus).
