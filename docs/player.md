# `<cube-player>`

```html
<script type="module">import "@cubecore/element";</script>

<cube-player alg="R U R' U R U2 R'" setup="R U2 R' U' R U' R'" tempo="2"></cube-player>
<cube-player id="solve" progress markers skin="gan"></cube-player>
<script type="module">
  const p = document.getElementById("solve");
  p.recording = myRecording;   // a timed solve (@cubecore/timeline) — plays in real time
  p.method = CFOP;             // stage markers on the progress bar (@cubecore/cfop)
</script>
```

## Attributes and properties

| | |
|---|---|
| `alg`, `setup`, `tempo` | an algorithm at a steady tempo (moves per second), after a setup (moves, or a `State` via the property) |
| `anchor` | `start` (default): play the algorithm from the (set-up) cube · `end`: the algorithm **solves** the cube — it starts at setup + the algorithm's inverse and ends solved (case practice) |
| `visualization` | `3d` (default), `net`, `top`, `iso` — the 2D views are SVG pictures (@cubecore/image) with the same skin and mask |
| `recording` (property) | a timed solve; takes precedence over `alg` |
| `skin` | preset name, or a `Skin` object via the property |
| `back-view` | `none` / `side-by-side` / `top-right` |
| `progress` | show the progress bar (seek by click / drag / arrow keys) |
| `segment-labels`, `tooltips`, `markers` | section names under the bar · the section popup (`off` hides it) · tick marks at section ends |
| `controls` | `default` or `none` |
| `max-pause` | ms — recorded pauses longer than this are shortened in the replay (`compressPauses`) |
| `mask`, `speeds`, `rate` | properties |

API: `play()`, `pause()`, `toggle()`, `seek(ms)`, `stepForward()`, `stepBack()`,
`toStart()`, `toEnd()`; `playing`, `currentTime`, `duration`, `renderer`.
Events: `timeupdate` (`detail: { time, duration, applied }`), `play`, `pause`, `ended`,
`error` (`detail: { message }` — e.g. notation that doesn't parse; the cube then shows the setup).

## Algorithm vs recording (timestamps)

Both end up as the same thing inside — a *recording*: moves, each with the
time it **completed**, and a total time — driven by the same clock, controls
and progress bar. The difference is where the times come from:

| | `alg` (+ `tempo`) | `recording` |
|---|---|---|
| times | made up: move *i* ends at (*i*+1) / tempo s | real, as recorded (e.g. from a smart cube: `SmartCubeSession` move times) |
| pauses | none — a steady rhythm | kept (recognition pauses stay pauses) |
| a move's animation | 80 % of the interval | at most 150 ms, ending at the move's time, never overlapping the previous one |
| start state | solved (+ `setup`; `anchor="end"` for "the algorithm solves it") | solved + the recording's `scramble` |
| typical use | guides, case practice, algorithm demos | solve replays, shared solves (`decodeShare`) |

`rate` (speed button) scales either one, keeping proportions.

## Sections on the progress bar

The bar can be split into **sections** — plain data, not tied to any method:

```ts
interface Segment {           // @cubecore/timeline
  start: number; end: number; // ms
  label: string;              // "F2L 2"
  id?: string;                // "f2l-2" → ::part(segment-f2l-2)
  detail?: string;            // "FL", "OLL 27"…
  split?: number;             // end of recognition: the part before it is hatched
  moves?: number;
  color?: string;             // else the palette --cc-segment-1…8
}

player.segments = [...];                 // anything: guide chapters, stored stage times…
player.method = CFOP;                    // shortcut: sections computed from the recording
stageSegments(ROUX, recording);          // the same helper, anywhere (next to stageTimings)
```

With a `method`, the player runs its colour-neutral `MethodTracker` over the
recording — any `Method` works (CFOP, Roux, ZZ, Petrus, LBL, your own);
stages reached on the same move as the previous one get no section of their
own. Nothing about times has to be passed: they come from the moves.

What the bar shows: each section in its colour, dim until played; the
recognition part (before `split`) hatched; `segment-labels` puts the names
under the bar (click one to jump to that section; the current one is bold);
a popup over the section under the pointer / while scrubbing / when the bar
has focus (`tooltips="off"` hides it, `player.formatSegment = (s) => "…"` for
your own text, e.g. a translation). PageUp / PageDown jump between sections;
`segmentchange` fires when the playhead enters another section. `markers`
adds tick marks at the section ends (or at `player.markers = [{ time, label }]`).

Styling: `--cc-segment-1…8`, `--cc-segment-height`, `--cc-segment-gap`,
`--cc-segment-unplayed`, `--cc-tooltip-bg`, `--cc-tooltip-fg`; parts `segment`,
`segment-<id>`, `segment-played`, `segment-recognition`, `segment-labels`,
`segment-label`, `segment-label-<id>`, `tooltip`, `tooltip-text`. Per section:
`cube-player::part(segment-cross) { --seg: white; }`.

## The algorithm text in sync: `<cube-alg>`

```html
<cube-player id="p" alg="R U R' U . R U2 R' // Sune" anchor="end"></cube-player>
<cube-alg for="p"></cube-alg>
```

Shows the algorithm as written — grouping, `(…)3` repeats, `[A, B]`
commutators, `.` pauses (one beat of stillness when played) and `// comments`
— highlights the move playing, fades played ones, and jumps there on click
(`player.seekToMove(k)`). Repeats and commutator inverses light up the move
they copy. Text: its own `alg`, else the player's, else the player's moves (a
recorded solve). Styling: `--cc-alg-font`, `--cc-alg-size`, `--cc-alg-done`,
`--cc-alg-current`, `--cc-alg-current-bg`, `--cc-alg-comment`; parts `alg`,
`token`, `token-done`, `token-current`, `token-todo`, `comment`. In code:
`parseAlgDocument(text)` → `{ moves, sources, pausesBefore, comments }`.

## Three levels of customising the controls

**1. Theme with CSS variables** — on the element or any ancestor:

```css
cube-player {
  --cc-accent: #ff7a2f;           /* play button, progress fill, focus ring */
  --cc-control-radius: 999px;
  --cc-button-size: 34px;
  --cc-progress-height: 10px;
  --cc-marker: #ffd28a;
}
```

All variables: `--cc-accent`, `--cc-control-bg`, `--cc-control-bg-hover`,
`--cc-control-fg`, `--cc-control-radius`, `--cc-button-size`,
`--cc-controls-gap`, `--cc-progress-height`, `--cc-progress-track`,
`--cc-progress-fill`, `--cc-marker`, `--cc-thumb-size`, `--cc-font`, and the
section ones below. Colours
default to shades of `currentColor`, so light and dark pages both work.

**2. Style any piece with `::part()`**: `stage`, `progress`, `progress-track`,
`progress-fill`, `progress-thumb`, `progress-marker`, `controls`, `buttons`,
`button` (every button) and `button-start`, `button-back`, `button-play`,
`button-forward`, `button-end`, `button-speed`, `time`.

```css
cube-player::part(button-play) { box-shadow: 0 6px 18px -6px #ff7a2f; }
cube-player::part(controls) { background: #1c1917; border-radius: 999px; }
```

**3. Replace them** — any markup in `slot="controls"` takes their place
(or `controls="none"` to hide them and put your UI anywhere):

```html
<cube-player id="p" alg="…">
  <div slot="controls">
    <button onclick="p.toggle()">Play</button>
    <input type="range" oninput="p.seek(this.value / 1000 * p.duration)" max="1000" />
  </div>
</cube-player>
```

The progress bar is independent of the controls: `progress` shows it with
either the default or your own controls. Live smart-cube input goes through
`player.renderer.animate(move)`.
