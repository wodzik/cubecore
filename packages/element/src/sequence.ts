/**
 * CubeSequenceElement — what <cube-scramble> and <cube-alg-practice> share:
 * a list of moves followed on a smart cube (core SequenceTracker under the
 * hood), with the slip / undo line, a status message, controls, events and
 * one styling vocabulary. Not registered on its own.
 *
 * Three levels of customising, like <cube-player>:
 *   1. CSS variables (on the element or any ancestor):
 *        --cc-seq-font, --cc-seq-size, --cc-seq-gap           text
 *        --cc-seq-done, --cc-seq-current, --cc-seq-current-bg, --cc-seq-partial,
 *        --cc-seq-todo, --cc-seq-hidden (dots), --cc-seq-undo  move colours
 *        --cc-accent, --cc-control-bg, --cc-control-radius      controls
 *   2. ::part(): container, moves, move, move-done / -current / -partial / -todo /
 *      -hidden, undo, undo-label, undo-move, message, controls, button (+ button-<name>),
 *      and each element's own (scramble: input, error).
 *   3. Replace pieces: children with slot="undo", slot="message" or
 *      slot="controls" take those places (controls="none" hides the default
 *      controls); `headless` hides the whole built-in view — build yours
 *      from the `progress` event (tokens with text / status / visibility,
 *      undo, needsReset, complete, …) and call the element's methods.
 *
 * Arrows: with `arrows` set and a player (`player="id"` of a <cube-player>,
 * or the `player` property), the 3D cube shows the next turn — one arrow per
 * turning layer (two for a wide r), a longer one with two heads for a
 * double, in --cc-arrow (after a slip: the undo move, in --cc-arrow-undo).
 *
 * Events: progress (detail: the progress), complete.
 */

import { type Move, type NextTurn, type SequenceProgress, type State, type TurnArrow, formatMove, solvedState } from "@cubecore/core";
import type { ArrowStyle } from "@cubecore/render";
import { ElementBase } from "./base";

/** Where turn arrows go — a <cube-player> fits. */
export interface ArrowTarget {
  showTurnArrows(arrows: readonly TurnArrow[] | null, style?: ArrowStyle, owner?: unknown): void;
}

/** What `attach` needs: the cube's current state and its moves (a SmartCubeSession fits). */
export interface MoveSource {
  readonly state: State;
  on(type: "move", listener: (e: { move: Move; time?: number }) => void): () => void;
}

/** One move as shown: its text, where it stands, whether it's shown (else a dot). */
export interface ShownToken {
  text: string;
  status: "done" | "partial" | "current" | "todo";
  visible: boolean;
}

export interface SequenceMessages {
  undo: string;
  reset: string;
  complete: string;
}

export const SEQUENCE_STYLES = /* css */ `
:host {
  --cc-seq-font: ui-monospace, "SF Mono", Menlo, monospace;
  --cc-seq-size: 22px;
  --cc-seq-gap: 0.35em;
  --cc-seq-done: color-mix(in srgb, currentColor 35%, transparent);
  --cc-seq-current: currentColor;
  --cc-seq-current-bg: color-mix(in srgb, var(--cc-accent) 24%, transparent);
  --cc-seq-partial: var(--cc-accent);
  --cc-seq-todo: color-mix(in srgb, currentColor 82%, transparent);
  --cc-seq-hidden: color-mix(in srgb, currentColor 45%, transparent);
  --cc-seq-undo: #ff8a4c;
  --cc-arrow: #ff2d95;
  --cc-arrow-undo: var(--cc-seq-undo);
  --cc-accent: #4f8cff;
  --cc-control-bg: color-mix(in srgb, currentColor 8%, transparent);
  --cc-control-bg-hover: color-mix(in srgb, currentColor 15%, transparent);
  --cc-control-radius: 8px;
  display: block;
}
:host([headless]) .container { display: none; }
.container { display: flex; flex-direction: column; gap: 0.5em; }
.moves { display: flex; flex-wrap: wrap; gap: 0.1em var(--cc-seq-gap); font: 600 var(--cc-seq-size) / 1.5 var(--cc-seq-font); }
.move { padding: 0 0.18em; border-radius: 0.25em; transition: color 0.15s ease, background 0.15s ease; }
.done { color: var(--cc-seq-done); }
.current { color: var(--cc-seq-current); background: var(--cc-seq-current-bg); }
.partial { color: var(--cc-seq-partial); background: var(--cc-seq-current-bg); }
.todo { color: var(--cc-seq-todo); }
.hidden { color: var(--cc-seq-hidden); }
.undo { display: none; color: var(--cc-seq-undo); gap: var(--cc-seq-gap); flex-wrap: wrap; align-items: baseline; font: 600 calc(var(--cc-seq-size) * 0.85) / 1.4 var(--cc-seq-font); }
.undo.on { display: flex; }
.undo-label { font: 600 0.65em/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 0.3em; }
.message { display: none; font: 500 13px/1.4 system-ui, sans-serif; opacity: 0.85; }
.message.on { display: block; }
.controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.controls:empty { display: none; }
:host([controls="none"]) .controls { display: none; }
button {
  border: 0; border-radius: var(--cc-control-radius);
  background: var(--cc-control-bg); color: inherit;
  padding: 6px 11px; font: 600 12px/1 system-ui, sans-serif; cursor: pointer;
}
button:hover { background: var(--cc-control-bg-hover); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--cc-accent); outline-offset: 2px; }
button[aria-pressed="true"] { background: color-mix(in srgb, var(--cc-accent) 25%, transparent); }
`;

export abstract class CubeSequenceElement extends ElementBase {
  protected readonly root: ShadowRoot;
  protected source: MoveSource | null = null;
  private off: (() => void) | null = null;
  protected messagesBase: SequenceMessages = { undo: "Undo", reset: "Too far off — solve the cube and start again", complete: "" };
  private completed = false;
  private _player: ArrowTarget | null = null;

  static observedAttributes = ["arrows", "player"];

  attributeChangedCallback(): void {
    this.update();
  }

  constructor(extraStyles = "", controlsHtml = "") {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SEQUENCE_STYLES}${extraStyles}</style>
      <div class="container" part="container">
        <div class="moves" part="moves"></div>
        <slot name="undo"><div class="undo" part="undo"><span class="undo-label" part="undo-label"></span><span class="undo-moves"></span></div></slot>
        <slot name="message"><div class="message" part="message" role="status"></div></slot>
        <slot name="controls"><div class="controls" part="controls">${controlsHtml}</div></slot>
      </div>`;
    this.root.addEventListener("click", (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action) this.onAction(action);
    });
  }

  // ─── what each element decides ───

  /** Start following from `start`. */
  protected abstract startTracking(start: State): void;
  /** Feed one face turn; return the progress. */
  protected abstract track(move: Move, time: number): SequenceProgress;
  /** Current progress (null before anything is set). */
  abstract get progress(): SequenceProgress | null;
  /** The moves as shown. */
  protected abstract tokens(): ShownToken[];
  /** What to turn now (null: nothing, or nothing to give away). */
  protected abstract nextTurn(): NextTurn | null;
  /** Extra message (e.g. stats) when nothing else is said. */
  protected extraMessage(): string {
    return "";
  }
  protected onAction(_action: string): void {}

  // ─── shared API ───

  /** Follow a smart cube from its current state. Returns detach. */
  attach(source: MoveSource): () => void {
    this.detach();
    this.source = source;
    this.off = source.on("move", (e) => this.push(e.move, e.time));
    this.reset();
    return () => this.detach();
  }

  detach(): void {
    this.arrowTarget()?.showTurnArrows(null, {}, this);
    this.off?.();
    this.off = null;
    this.source = null;
  }

  /** Start again from `start` (default: the attached cube's state, else solved). */
  reset(start?: State): void {
    this.completed = false;
    this.startTracking(start ?? this.source?.state ?? solvedState());
    this.update();
  }

  /** A face turn from the cube (called for you when attached). Once complete, further turns are
   * ignored (the solve / next attempt has started) until a new sequence or `reset()`. */
  push(move: Move, time: number = performance.now()): void {
    if (this.completed) return;
    const p = this.track(move, time);
    this.update();
    if (p.complete && !this.completed) {
      this.completed = true;
      this.dispatchEvent(new CustomEvent("complete", { detail: p }));
    }
  }

  /** Player for the arrows (else the `player` attribute's id). */
  get player(): ArrowTarget | null {
    return this.arrowTarget();
  }
  set player(p: ArrowTarget | null) {
    this.arrowTarget()?.showTurnArrows(null, {}, this);
    this._player = p;
    this.update();
  }

  private arrowTarget(): ArrowTarget | null {
    if (this._player) return this._player;
    const id = this.getAttribute("player");
    const el = id ? (this.getRootNode() as Document | ShadowRoot).getElementById?.(id) : null;
    return el && "showTurnArrows" in el ? (el as unknown as ArrowTarget) : null;
  }

  private syncArrows(): void {
    const target = this.arrowTarget();
    if (!target) return;
    const turn = this.hasAttribute("arrows") && this.source ? this.nextTurn() : null;
    if (!turn) return target.showTurnArrows(null, {}, this);
    const css = getComputedStyle(this);
    const color = css.getPropertyValue(turn.kind === "undo" ? "--cc-arrow-undo" : "--cc-arrow").trim();
    target.showTurnArrows(turn.arrows, { color: color || undefined }, this);
  }

  get messages(): SequenceMessages {
    return { ...this.messagesBase };
  }
  set messages(m: Partial<SequenceMessages>) {
    this.setMessages(m);
  }
  protected setMessages(m: Partial<SequenceMessages>): void {
    this.messagesBase = { ...this.messagesBase, ...m };
    this.update();
  }

  // ─── rendering ───

  protected update(): void {
    const p = this.progress;
    this.root.querySelector(".moves")!.innerHTML = this.tokens()
      .map((t) => {
        const cls = t.visible ? t.status : `${t.status} hidden`;
        const parts = t.visible ? `move move-${t.status}` : `move move-${t.status} move-hidden`;
        return `<span class="move ${cls}" part="${parts}">${t.visible ? escapeHtml(t.text) : "•"}</span>`;
      })
      .join("");
    const showUndo = !!p && p.undo.length > 0 && !p.needsReset;
    this.root.querySelector(".undo")?.classList.toggle("on", showUndo);
    const label = this.root.querySelector(".undo-label");
    if (label) label.textContent = this.messagesBase.undo;
    const undoMoves = this.root.querySelector(".undo-moves");
    if (undoMoves) undoMoves.innerHTML = showUndo ? p!.undo.map((m) => `<span class="move" part="undo-move">${formatMove(m)}</span>`).join(" ") : "";
    const message = this.root.querySelector(".message");
    if (message) {
      const text = p?.needsReset ? this.messagesBase.reset : p?.complete && this.messagesBase.complete ? this.messagesBase.complete : this.extraMessage();
      message.textContent = text;
      message.classList.toggle("on", !!text);
    }
    this.syncArrows();
    if (p) this.dispatchEvent(new CustomEvent("progress", { detail: { ...p, shown: this.tokens() } }));
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
