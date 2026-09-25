# Smart cubes (`@cubecore/bluetooth`)

Wraps [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth)
(GAN, MoYu, QiYi, GoCube, Giiker) and speaks cubecore:

```ts
import { SmartCubeSession } from "@cubecore/bluetooth";
import { MoveCollapser, MethodTracker } from "@cubecore/core";

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
"held as shown". Axes default to GAN's; pass `axes` for other cubes.

**Looks.** `session.suggestedSkin` picks a skin for the connected cube (GAN
i4 → `ganI4`, other GAN → `gan`, QiYi QY-SC → `qiyiSC`, else `stickerless`); `player.attach(cube,
{ autoSkin: true })` uses it. Add your own models first with
`registerCubeSkin({ protocol: "moyu", name: /V10/, skin: myMoyuSkin })`.

**Without a cube.** `new SmartCubeSession(new SimulatedCube())` behaves like a
connected cube: `turn("R U R'")`, `turn("U", { delayMs: 3000 })` (a late
notification), `turn("F", { dropLocalTime: true })` (a resent move),
`tilt(quaternion)`, `setStateSilently(state)` (a missed move).

Also in core: `stateFromFacelets` / `faceletsOf` (the 54-letter format cubes
report), `toFaceTurns` / `OrientationTracker` (what an algorithm with
rotations and slices looks like to the cube).
