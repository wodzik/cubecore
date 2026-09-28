# Smart cubes (`@wodzik/cubecore/bluetooth`)

Wraps [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth)
(GAN, MoYu, QiYi, GoCube, Giiker) and speaks cubecore:

```ts
import { SmartCubeSession } from "@wodzik/cubecore/bluetooth";
import { MoveCollapser, MethodTracker } from "@wodzik/cubecore/core";

const cube = await SmartCubeSession.connect({ enableAddressSearch: true }); // needs a click; Chrome / Edge / Bluefy, https or localhost
const log = new MoveCollapser();

cube.on("move", ({ move, time, late, state }) => {
  log.push(move, time);          // written log: R R → R2, R L' → M, R R' kept
  tracker.push(move, time);      // stages, colour neutral
});
cube.on("state", ({ state, reason }) => { /* "facelets" = resynced after a missed move, "reset" = markSolved() */ });
player.attach(cube);             // <cube-player> follows it live (moves, resyncs, gyro)
```

**Times you can trust.** Each move's `time` is on the page's clock
(`performance.now()`), taken from the **cube's own clock** when it sends one:
a burst of notifications after a backgrounded tab, or a move GAN re-sends
after a lost packet, keeps its real time instead of "when it arrived". Such
moves have `late: true` (arrived > `lateMs`, default 1 s, after they
happened) — decide in the app whether to keep, flag or void the attempt.

**State.** The session tracks the cube (`state`) from its moves and, when the
cube reports its facelets (on connect, `requestState()`), trusts the cube and
emits a `state` event with reason `"facelets"` if they disagreed.
`markSolved()` resets it (and the cube, if it can).

**Gyro.** `orientation` events are calibrated quaternions for
`CubeRenderer.setOrientation`: the first reading — or `calibrate()` — means
"held as shown" (as drawn: U up, F front; or `calibrate(shown)`, the
orientation of the view it's shown in — e.g. yellow on top). `orientation`
is the latest. The gyro's yaw drifts: `alignToGrip()` snaps it onto the
nearest grip when the cube is held square (a solve's start).

Axes default to GAN's. Other brands may report theirs differently: pass
`axes` — a map, or a signed permutation after GAN's (`"x,y,z"` = GAN, 48 in
`AXES_SPECS`) — or change them while connected with `setAxes()`; the
calibration is kept. `detectAxes(start, afterA, afterB, expectA, expectB)`
finds a cube's from three `rawOrientation` readings (held as drawn, after
turning the whole cube one way, after another).

**Rotations, slices, wide moves.** A smart cube reports face turns relative
to its core — the centres. After a y regrip its "R" is what you call F; a
slice or wide move comes as face turns while the core (and the gyro) turns
with it: S = F' B + z, r = L + x, M2 as two quarters = R' L R' L + x2.
`GripRecorder` follows the grips (hysteresis: 35°, 150 ms) and marks each
change by the number of moves before it in the session's stream — the order
the cube sent them in:

```ts
const rec = new GripRecorder(cube);
// … later, for a stretch of moves (a solve): the first's number and count
const first = rec.moveNumberAt(firstMoveTime)!;
const r = rec.forMoves(first, count, firstMoveTime);   // { startRotation: "y'", rotations: [{ after, t, move }] }
heldTokens(moves, r.startRotation, r.rotations);
// → moves as the solver named them, the regrips between them, and slices /
//   wide moves read back from face moves with the core's rotation
```

Wide moves read from one face turn are r, l, f and b by default
(`heldTokens(…, { wide })`): a u or d is almost always a U / D turn and a y
regrip. Slices are always read. `heldTokens` also takes a slice's rotation
that came in a little early or late (a cube held loosely while recognising the next case settles late);
far from its moves only a slice's signature (both faces of the axis) is
trusted. `grips.ts` has the grip maths (`readGrip`, `rotateGrip`,
`rotationBetween`, `GripTracker`, `gripQuaternion`).

**Looks.** `session.suggestedSkin` picks a skin for the connected cube (GAN
GAN → `gan`, QiYi QY-SC → `qiyiSC`, MoYu WCU_MY… → `moyu`, else `default`); `player.attach(cube,
{ autoSkin: true })` uses it. Add your own models first with
`registerCubeSkin({ protocol: "moyu", name: /V10/, skin: myMoyuSkin })`.

**Without a cube.** `new SmartCubeSession(new SimulatedCube())` behaves like a
connected cube: `turn("R U R'")`, `turn("U", { delayMs: 3000 })` (a late
notification), `turn("F", { dropLocalTime: true })` (a resent move),
`tilt(quaternion)`, `setStateSilently(state)` (a missed move).

Also in core: `stateFromFacelets` / `faceletsOf` (the 54-letter format cubes
report), `toFaceTurns` / `OrientationTracker` (what an algorithm with
rotations and slices looks like to the cube).
