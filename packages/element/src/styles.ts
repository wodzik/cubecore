/**
 * Default look of <cube-player>. Everything is themable from outside:
 *
 * - CSS custom properties on the element (or any ancestor) — quick theming:
 *     --cc-accent            play button, progress fill, focus ring
 *     --cc-control-bg        button background        --cc-control-bg-hover
 *     --cc-control-fg        button icon colour       --cc-control-radius
 *     --cc-button-size       button height/width      --cc-controls-gap
 *     --cc-progress-height   bar thickness            --cc-progress-track / --cc-progress-fill
 *     --cc-marker            stage marker colour      --cc-thumb-size
 *     --cc-font              time / speed text
 * - ::part() for anything else: stage, progress, progress-track,
 *   progress-fill, progress-thumb, progress-marker, controls, buttons, button,
 *   button-start, button-back, button-play, button-forward, button-end,
 *   button-speed, time.
 * - Replace the controls entirely: put your own element in slot="controls"
 *   (or set controls="none") and drive the player's API.
 *
 * Colours derive from `currentColor`, so the defaults fit light and dark pages.
 */

export const STYLES = /* css */ `
:host {
  --cc-accent: #4f8cff;
  --cc-control-bg: color-mix(in srgb, currentColor 8%, transparent);
  --cc-control-bg-hover: color-mix(in srgb, currentColor 15%, transparent);
  --cc-control-fg: currentColor;
  --cc-control-radius: 10px;
  --cc-button-size: 34px;
  --cc-controls-gap: 5px;
  --cc-progress-height: 6px;
  --cc-progress-track: color-mix(in srgb, currentColor 14%, transparent);
  --cc-progress-fill: var(--cc-accent);
  --cc-marker: color-mix(in srgb, currentColor 55%, transparent);
  --cc-thumb-size: 14px;
  --cc-font: ui-monospace, "SF Mono", Menlo, monospace;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 200px;
  min-height: 200px;
  outline: none;
  container-type: inline-size;
}
:host([hidden]) { display: none; }
.stage { position: relative; flex: 1; min-height: 0; }

/* ─── progress bar ─── */
.progress { display: none; padding: 6px 2px; cursor: pointer; touch-action: none; }
:host([progress]) .progress { display: block; }
.track {
  position: relative;
  height: var(--cc-progress-height);
  border-radius: 999px;
  background: var(--cc-progress-track);
}
.fill {
  position: absolute; inset: 0 auto 0 0;
  width: 0;
  border-radius: inherit;
  background: var(--cc-progress-fill);
}
.thumb {
  position: absolute; top: 50%; left: 0;
  width: var(--cc-thumb-size); height: var(--cc-thumb-size);
  border-radius: 50%;
  background: var(--cc-progress-fill);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cc-progress-fill) 25%, transparent);
  transform: translate(-50%, -50%) scale(0.85);
  transition: transform 0.12s ease;
}
.progress:hover .thumb, .progress.dragging .thumb { transform: translate(-50%, -50%) scale(1); }
.marker {
  position: absolute; top: 50%;
  width: 2px; height: calc(var(--cc-progress-height) + 8px);
  border-radius: 1px;
  background: var(--cc-marker);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
:host(:not([markers])) .marker { display: none; }
.progress:focus-visible .track { outline: 2px solid var(--cc-accent); outline-offset: 4px; }

/* ─── controls ─── */
/* time | buttons | speed — the buttons stay centred whatever the time text's width */
.controls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--cc-controls-gap); }
.buttons { display: flex; gap: var(--cc-controls-gap); }
.time { justify-self: start; }
.speed { justify-self: end; }
/* Narrow players: buttons on top, time and speed below. */
@container (max-width: 300px) {
  .controls { grid-template-columns: 1fr 1fr; grid-template-areas: "buttons buttons" "time speed"; }
  .buttons { grid-area: buttons; justify-content: center; }
  .time { grid-area: time; }
  .speed { grid-area: speed; }
}
:host([controls="none"]) .controls { display: none; }
/* Live (following a smart cube): nothing to replay. */
:host([live]) .controls, :host([live]) .progress { display: none; }
button {
  display: inline-grid; place-items: center;
  min-width: var(--cc-button-size); height: var(--cc-button-size);
  padding: 0 8px;
  border: 0;
  border-radius: var(--cc-control-radius);
  background: var(--cc-control-bg);
  color: var(--cc-control-fg);
  font: 600 12px/1 var(--cc-font);
  cursor: pointer;
  transition: background 0.12s ease, transform 0.08s ease;
}
button:hover { background: var(--cc-control-bg-hover); }
button:active { transform: scale(0.94); }
button:focus-visible { outline: 2px solid var(--cc-accent); outline-offset: 2px; }
button:disabled { opacity: 0.4; cursor: default; transform: none; }
button svg { width: 18px; height: 18px; display: block; fill: currentColor; }
.play { min-width: calc(var(--cc-button-size) * 1.25); background: var(--cc-accent); color: #fff; }
.play:hover { background: color-mix(in srgb, var(--cc-accent) 85%, #000); }
.time { font: 500 12px/1 var(--cc-font); opacity: 0.75; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

/** Inline icons (no icon font, no network). */
export const ICONS = {
  start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5.5v13a.5.5 0 0 1-.78.42L9.5 12.4a.5.5 0 0 1 0-.8l9.72-6.52A.5.5 0 0 1 20 5.5z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6.2v11.6a.5.5 0 0 1-.8.4L8 12.4a.5.5 0 0 1 0-.8l8.2-5.8a.5.5 0 0 1 .8.4zM6 6h2v12H6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a.6.6 0 0 0 .92.5l10.1-6.4a.6.6 0 0 0 0-1L8.92 5.1a.6.6 0 0 0-.92.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
  forward: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6.2v11.6a.5.5 0 0 0 .8.4l8.2-5.8a.5.5 0 0 0 0-.8L7.8 5.8a.5.5 0 0 0-.8.4zM16 6h2v12h-2z"/></svg>',
  end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5.5v13a.5.5 0 0 0 .78.42l9.72-6.52a.5.5 0 0 0 0-.8L4.78 5.08A.5.5 0 0 0 4 5.5z"/></svg>',
} as const;
