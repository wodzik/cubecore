/**
 * Masks — which stickers matter. A mask gives each STICKER (by its home
 * facelet, i.e. piece identity) a display state, so it follows the pieces as
 * they move: masking "the cross edges" keeps highlighting them wherever they
 * are, which is what a "watch these pieces" view needs.
 *
 * Masks are defined for the canonical frame (cross on D, last layer on U, Roux
 * blocks on L/R) and mapped to any frame, so they are colour neutral too:
 * `buildMask(CFOP_MASKS.oll, frame)` masks the last layer of a cube solved
 * with the cross on any face.
 */

import { CUBIE_OF_FACELET, type Cubie, FACELETS, FACELET_COUNT, type Facelet } from "./geometry";
import { type Frame, IDENTITY_FRAME } from "./frames";
import type { State } from "./state";

/**
 * regular: full colour · dim: darkened colour (context) · ignored: grey (not
 * relevant) · oriented: one "this sticker matters for orientation" colour ·
 * invisible: not drawn.
 */
export type MaskState = "regular" | "dim" | "ignored" | "oriented" | "invisible";
export const MASK_STATES: readonly MaskState[] = ["regular", "dim", "ignored", "oriented", "invisible"];

/** Per home facelet (piece identity) → index into MASK_STATES. */
export type Mask = Uint8Array;

const code = (s: MaskState) => MASK_STATES.indexOf(s);

/** Rule over the CANONICAL home facelet and its cubie. */
export type MaskRule = (facelet: Facelet, cubie: Cubie) => MaskState;

export function buildMask(rule: MaskRule, frame: Frame = IDENTITY_FRAME): Mask {
  const mask = new Uint8Array(FACELET_COUNT);
  for (const f of FACELETS) mask[frame.map[f.index]] = code(rule(f, CUBIE_OF_FACELET[f.index]));
  return mask;
}

export const fullMask = (): Mask => new Uint8Array(FACELET_COUNT); // all "regular" (code 0)

/** Display state of whatever sticker currently sits at facelet position `position`. */
export function maskStateAt(mask: Mask, state: State, position: number): MaskState {
  return MASK_STATES[mask[state[position]]];
}

// ─── Generic presets (canonical: first layer D, last layer U) ───
// Method-specific presets (OLL, CMLL, EOLine…) live in the method packages as
// `MaskRule`s: `buildMask(CFOP_MASKS.oll, frame)`.

export type MaskPreset = "full" | "first-layer" | "ll" | "centers" | "void";

const RULES: Record<MaskPreset, MaskRule> = {
  full: () => "regular",
  "first-layer": (f, c) => (c.kind === "center" || c.pos[1] === -1 ? "regular" : "ignored"),
  ll: () => "regular",
  /** Only the centres in colour — orientation practice, colour-neutral recognition. */
  centers: (f, c) => (c.kind === "center" ? "regular" : "ignored"),
  /** Void cube: no centres. */
  void: (f, c) => (c.kind === "center" ? "invisible" : "regular"),
};

export const MASK_PRESETS = Object.keys(RULES) as MaskPreset[];

export function presetMask(preset: MaskPreset, frame: Frame = IDENTITY_FRAME): Mask {
  return buildMask(RULES[preset], frame);
}
