/**
 * <cube-alg-practice> — practising an algorithm on a smart cube. Set the
 * case up (e.g. with <cube-scramble>), then:
 *
 *   el.alg = "R U R' U R U2 R'";
 *   el.attach(session);                         // tracks from the cube's current state
 *   el.addEventListener("complete", (e) => …);   // e.detail.practice: { elapsedMs, turns, tps, mistakes, differentAlg }
 *
 * reveal="all"   every move shown (learning)
 * reveal="done"  dots, each move shown once done (default)
 * reveal="none"  dots to the end (you know it)
 * A slip counts a mistake, shows what to undo and (unless
 * hint-on-mistake="off") the move that should have come. Another algorithm
 * that reaches the same end state completes it too, flagged `differentAlg`.
 *
 * Default controls: Hint, Show / Hide, Restart (parts button-hint,
 * button-reveal, button-restart). Customising: see sequence.ts.
 * Events: progress, mistake, complete (detail: the progress). Messages:
 * undo, reset, complete, hint, show, hide, restart, differentAlg, and
 * `formatStats(practice)` for the line under the moves.
 */

import { type Move, type PracticeProgress, PracticeTracker, type Reveal, type State, formatMove, parseAlg } from "@cubecore/core";
import { CubeSequenceElement, type SequenceMessages, type ShownToken } from "./sequence";

export interface PracticeMessages extends SequenceMessages {
  hint: string;
  show: string;
  hide: string;
  restart: string;
  differentAlg: string;
}

export class CubeAlgPractice extends CubeSequenceElement {
  static observedAttributes = ["reveal", "hint-on-mistake"];
  private tracker: PracticeTracker | null = null;
  private moves: Move[] = [];
  private shownAll = false;
  private extra = { hint: "Hint", show: "Show", hide: "Hide", restart: "Restart", differentAlg: "solved another way" };

  /** The line under the moves once done (and while going). */
  formatStats = (p: PracticeProgress["practice"], complete: boolean): string => {
    if (!p.turns) return "";
    const parts = [`${(p.elapsedMs / 1000).toFixed(2)} s`, `${p.turns} turn${p.turns === 1 ? "" : "s"}`, `${p.tps.toFixed(1)} TPS`];
    if (p.mistakes) parts.push(`${p.mistakes} mistake${p.mistakes === 1 ? "" : "s"}`);
    if (complete && p.differentAlg) parts.push(this.extra.differentAlg);
    return parts.join(" · ");
  };

  constructor() {
    super(
      "",
      `<button part="button button-hint" data-action="hint"></button><button part="button button-reveal" data-action="reveal" aria-pressed="false"></button><button part="button button-restart" data-action="restart"></button>`,
    );
    this.labelButtons();
  }

  attributeChangedCallback(): void {
    this.tracker?.setReveal(this.revealMode());
    this.update();
  }

  get alg(): string {
    return this.moves.map(formatMove).join(" ");
  }
  set alg(v: string | readonly Move[]) {
    this.moves = typeof v === "string" ? parseAlg(v) : [...v];
    this.shownAll = false;
    this.reset();
  }

  get messages(): PracticeMessages {
    return { ...this.messagesBase, ...this.extra };
  }
  set messages(m: Partial<PracticeMessages>) {
    const { hint, show, hide, restart, differentAlg, ...base } = m;
    this.extra = { ...this.extra, ...Object.fromEntries(Object.entries({ hint, show, hide, restart, differentAlg }).filter(([, v]) => v !== undefined)) };
    this.labelButtons();
    this.setMessages(base);
  }

  get progress(): PracticeProgress | null {
    return this.tracker?.progress ?? null;
  }

  /** Show the next move. */
  hint(): void {
    this.tracker?.hint();
    this.update();
  }

  /** Show every move / back to the reveal mode. */
  toggleShown(): void {
    this.shownAll = !this.shownAll;
    this.tracker?.setReveal(this.revealMode());
    this.labelButtons();
    this.update();
  }

  protected startTracking(start: State): void {
    this.tracker = new PracticeTracker(this.moves, start, { reveal: this.revealMode(), hintOnMistake: this.getAttribute("hint-on-mistake") !== "off" });
  }

  protected track(move: Move, time: number): PracticeProgress {
    const before = this.tracker!.progress.practice.mistakes;
    const p = this.tracker!.push(move, time);
    if (p.practice.mistakes > before) this.dispatchEvent(new CustomEvent("mistake", { detail: p }));
    return p;
  }

  protected tokens(): ShownToken[] {
    const p = this.tracker?.progress;
    return this.moves.map((m, i) => {
      const t = p?.practice.tokens[i];
      return { text: formatMove(m), status: t?.status ?? "todo", visible: t?.visible ?? true };
    });
  }

  protected extraMessage(): string {
    const p = this.tracker?.progress;
    return p ? this.formatStats(p.practice, p.complete) : "";
  }

  protected onAction(action: string): void {
    if (action === "hint") this.hint();
    else if (action === "reveal") this.toggleShown();
    else if (action === "restart") this.reset();
  }

  private revealMode(): Reveal {
    if (this.shownAll) return "all";
    const r = this.getAttribute("reveal");
    return r === "all" || r === "none" ? r : "done";
  }

  private labelButtons(): void {
    const set = (sel: string, text: string) => {
      const b = this.root.querySelector<HTMLElement>(`[data-action="${sel}"]`);
      if (b) b.textContent = text;
    };
    set("hint", this.extra.hint);
    set("reveal", this.shownAll ? this.extra.hide : this.extra.show);
    set("restart", this.extra.restart);
    this.root.querySelector('[data-action="reveal"]')?.setAttribute("aria-pressed", String(this.shownAll));
  }
}

export function defineCubeAlgPractice(tag = "cube-alg-practice"): void {
  if (!customElements.get(tag)) customElements.define(tag, class extends CubeAlgPractice {});
}

declare global {
  interface HTMLElementTagNameMap {
    "cube-alg-practice": CubeAlgPractice;
  }
}
