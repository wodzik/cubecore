/**
 * <cube-scramble> — shows a scramble and follows it on a smart cube: done
 * moves fade, the next one is highlighted, half of a half turn shows as
 * partial, after a slip it shows what to undo. The scramble is always shown
 * in full (never hidden).
 *
 *   el.scramble = "R U2 F' …";      // or Move[]
 *   el.attach(session);             // a SmartCubeSession, or anything with state + "move" events
 *   el.addEventListener("complete", startInspection);
 *
 * `editable`: an input to paste or type your own scramble (competition,
 * another timer…) — validated as you type; a valid one replaces the
 * scramble and fires `change` (detail: { moves, text }).
 *
 * Customising: see sequence.ts (CSS variables, ::part, slots, headless).
 * Own parts: input, error. Messages: undo, reset, complete, placeholder, invalid.
 * What happens when it's done (inspection, timer…) is the app's call.
 */

import { type Move, type NextTurn, type SequenceProgress, SequenceTracker, type State, formatMove, parseAlg } from "@cubecore/core";
import { CubeSequenceElement, type SequenceMessages, type ShownToken } from "./sequence";

export interface ScrambleMessages extends SequenceMessages {
  placeholder: string;
  invalid: string;
}

const STYLES = /* css */ `
.input { flex: 1; min-width: 12em; display: none; }
:host([editable]) .input { display: block; }
.input input {
  width: 100%; box-sizing: border-box;
  background: color-mix(in srgb, currentColor 6%, transparent); color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: var(--cc-control-radius);
  padding: 7px 9px; font: 13px var(--cc-seq-font);
}
.error { display: none; color: var(--cc-seq-undo); font: 500 12px/1.3 system-ui, sans-serif; width: 100%; }
.error.on { display: block; }
`;

export class CubeScramble extends CubeSequenceElement {
  static observedAttributes = [...CubeSequenceElement.observedAttributes, "editable"];
  private tracker: SequenceTracker | null = null;
  private moves: Move[] = [];
  private extra = { placeholder: "Paste or type your own scramble", invalid: "Not a scramble:" };

  constructor() {
    super(STYLES, `<div class="input" part="input-container"><input part="input" type="text" spellcheck="false" autocomplete="off" /></div><div class="error" part="error"></div>`);
    const input = this.root.querySelector("input")!;
    input.placeholder = this.extra.placeholder;
    input.addEventListener("input", () => this.fromText(input.value));
  }

  /** The scramble (written notation or moves). */
  get scramble(): string {
    return this.moves.map(formatMove).join(" ");
  }
  set scramble(v: string | readonly Move[]) {
    this.setMoves(typeof v === "string" ? parseAlg(v) : [...v]);
    // Set from outside (a new generated one): the typed text is stale.
    this.root.querySelector("input")!.value = "";
    this.root.querySelector(".error")!.classList.remove("on");
  }

  private setMoves(moves: Move[]): void {
    this.moves = moves;
    this.reset();
  }

  get messages(): ScrambleMessages {
    return { ...this.messagesBase, ...this.extra };
  }
  set messages(m: Partial<ScrambleMessages>) {
    const { placeholder, invalid, ...base } = m;
    if (placeholder !== undefined) this.extra.placeholder = placeholder;
    if (invalid !== undefined) this.extra.invalid = invalid;
    this.root.querySelector("input")!.placeholder = this.extra.placeholder;
    this.setMessages(base);
  }

  get progress(): SequenceProgress | null {
    return this.tracker?.progress ?? null;
  }

  protected startTracking(start: State): void {
    this.tracker = new SequenceTracker(this.moves, start);
  }

  protected track(move: Move): SequenceProgress {
    return this.tracker!.push(move);
  }

  protected nextTurn(): NextTurn | null {
    return this.tracker?.nextTurn ?? null;
  }

  protected tokens(): ShownToken[] {
    const p = this.tracker?.progress;
    return this.moves.map((m, i) => ({ text: formatMove(m), status: p?.tokens[i] ?? "todo", visible: true }));
  }

  /** A pasted / typed scramble: take it if it parses (and isn't empty). */
  private fromText(text: string): void {
    const error = this.root.querySelector(".error")!;
    try {
      const moves = parseAlg(text);
      error.classList.remove("on");
      if (!moves.length) return;
      this.setMoves(moves);
      this.dispatchEvent(new CustomEvent("change", { detail: { moves, text } }));
    } catch (e) {
      error.textContent = `${this.extra.invalid} ${e instanceof Error ? e.message : String(e)}`;
      error.classList.add("on");
    }
  }
}

export function defineCubeScramble(tag = "cube-scramble"): void {
  if (!customElements.get(tag)) customElements.define(tag, class extends CubeScramble {});
}

declare global {
  interface HTMLElementTagNameMap {
    "cube-scramble": CubeScramble;
  }
}
