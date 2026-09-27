# Recordings, replay and statistics (`@wodzik/cubecore/timeline`)

Headless: a timed solve as data, and what to do with it.

## A recording

```ts
import { recording, type Recording } from "@wodzik/cubecore/timeline";

// Built by hand (times in ms since the timer started, when each move FINISHED):
const rec = recording("R U R' U'", [["U", 420], ["R", 610], ["U'", 780]], 900);

// From a smart cube:
const moves: { move: Move; t: number }[] = [];
cube.on("move", ({ move, time }) => moves.push({ move, t: time - startedAt }));
const live: Recording = { scramble: parseAlg(scramble), moves, totalMs };
```

Smart cubes report a move when it's done, so `t` is when it finished.

## Stage timings

```ts
import { stageTimings, stageSegments } from "@wodzik/cubecore/timeline";
import { CFOP } from "@wodzik/cubecore/cfop";

const { stages, fluency, bottomFace } = stageTimings(CFOP, rec);
// stages: { stage, label, moveCount, startMs, endMs, recognitionMs, executionMs, skipped, detail }[]
// fluency: the share of the solve spent turning rather than looking (0..1)
```

`recognitionMs` is the pause before the first move of a stage,
`executionMs` the rest. `stageSegments(method, rec)` gives the same stages as
segments for the progress bar of `<cube-player>`
([player.md](player.md#sections-on-the-progress-bar)).

## Replay

```ts
import { ReplayClock, positionAt, compressPauses } from "@wodzik/cubecore/timeline";
import { showPosition } from "@wodzik/cubecore/render";

const clock = new ReplayClock(compressPauses(rec, 1500));   // long pauses cut to 1.5 s
clock.onChange((time, position) => showPosition(renderer, start, rec.moves.map((m) => m.move), position));
clock.rate = 2;
clock.play();
clock.seek(3000);
clock.seekToMove(12);
```

Each move animates up to the time it was recorded (at most `maxAnimMs`,
150 ms by default), so a replay shows the solve as it was turned.
`positionAt(rec, timeMs)` gives the same position without a clock: moves
done, and the move under way with its progress.

## Codecs

```ts
import { encodeRecording, decodeRecording, encodeShare, decodeShare } from "@wodzik/cubecore/timeline";

const text = encodeRecording(rec);              // compact, URL-safe (base64url)
const link = `#solve=${encodeShare({ recording: rec, method: "cfop", dnf: false, hideTimes: false })}`;
decodeShare(link.slice(7));                      // null when the text isn't a share
```

A typical 100-move solve is about 250 characters. A share also carries
the method, a DNF flag, "show move counts only", and a start state when the
cube wasn't solved before the scramble. Both formats are versioned
(`CODEC_VERSION`, `SHARE_VERSION`).

## Statistics

```ts
import { DNF, ao, bestAo, mo, sessionStats } from "@wodzik/cubecore/timeline";

const times = [9870, 11020, DNF, 10450, 9990];
ao(times, 5);                                  // WCA average: best and worst dropped
sessionStats(times);                           // best, worst, mean, mo3, ao5, ao12, ao100, bestAo5, bestAo12
```

Averages follow WCA rules: 5 % trimmed from each end (1 solve up to ao12).
DNF is `Infinity`, and an average with too many DNFs is a DNF.
