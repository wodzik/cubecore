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
| `markers` | show stage markers on it — from `method`, or an explicit `markers` list |
| `controls` | `default` or `none` |
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

## Stage markers

`markers` shows ticks on the progress bar where stages END. They come from:

- **`player.method`** — any `Method` (CFOP, Roux, ZZ, Petrus, LBL, or your own
  from `@cubecore/core`'s `Method` / `Stage`). The player runs the method's
  colour-neutral `MethodTracker` over the recording (its scramble + moves) and
  puts a tick at the time each stage was reached (skipped stages — reached on
  the same move as the previous — get none). Nothing to pass: stage times are
  derived from the moves, like `stageTimings` in @cubecore/timeline.
- **`player.markers = [{ time, label }, …]`** — any ticks you like (overrides
  `method`): chapters of a guide, your own analysis, stage times you stored.

Hovering a tick shows its label and time.
Keyboard (when focused): Space / K, ← →, Home / End.

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
`--cc-progress-fill`, `--cc-marker`, `--cc-thumb-size`, `--cc-font`. Colours
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
