/**
 * All methods together — for apps that let the user pick a method, or show
 * every analysis side by side. Apps using a single method import its own
 * package (@cubecore/cfop…) and skip the rest.
 */

import { type Frame, IDENTITY_FRAME, MASK_PRESETS, type Mask, type MaskRule, type Method, buildMask, presetMask } from "@cubecore/core";
import { CFOP, CFOP_MASKS } from "@cubecore/cfop";
import { LBL, LBL_MASKS } from "@cubecore/lbl";
import { PETRUS, PETRUS_MASKS } from "@cubecore/petrus";
import { ROUX, ROUX_MASKS } from "@cubecore/roux";
import { ZZ, ZZ_MASKS } from "@cubecore/zz";

export { CFOP, LBL, PETRUS, ROUX, ZZ };

export const METHODS: readonly Method[] = [CFOP, LBL, ROUX, ZZ, PETRUS];
export const methodById = (id: string): Method | undefined => METHODS.find((m) => m.id === id);

/** Every method's masks, keyed "method:name" (e.g. "cfop:oll", "roux:cmll"). */
export const METHOD_MASKS: Readonly<Record<string, MaskRule>> = Object.fromEntries(
  (
    [
      ["cfop", CFOP_MASKS],
      ["lbl", LBL_MASKS],
      ["roux", ROUX_MASKS],
      ["zz", ZZ_MASKS],
      ["petrus", PETRUS_MASKS],
    ] as const
  ).flatMap(([method, masks]) => Object.entries(masks).map(([name, rule]) => [`${method}:${name}`, rule as MaskRule])),
);

/** All mask names: the generic presets ("full", "first-layer", "ll") and every "method:name". */
export const MASK_NAMES: readonly string[] = [...MASK_PRESETS, ...Object.keys(METHOD_MASKS)];

/** A mask by name from `MASK_NAMES`, for a cube held in `frame`. */
export function maskByName(name: string, frame: Frame = IDENTITY_FRAME): Mask {
  const rule = METHOD_MASKS[name];
  if (rule) return buildMask(rule, frame);
  if ((MASK_PRESETS as readonly string[]).includes(name)) return presetMask(name as (typeof MASK_PRESETS)[number], frame);
  throw new Error(`Unknown mask "${name}"`);
}
