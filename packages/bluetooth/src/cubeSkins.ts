/**
 * Which skin suits the connected cube. Rules match the protocol id and the
 * device / hardware name the cube reports; the first match wins, so rules an
 * app registers (e.g. skins made for particular models) go before the
 * built-in defaults:
 *
 *   GAN i4 (name contains "i4")  → ganI4
 *   any other GAN                → gan
 *   QiYi QY-SC (name QY-QYSC…)   → qiyiSC
 *   anything else                → stickerless (most smart cubes are)
 *
 * Only looks are chosen here — nothing depends on it.
 */

import { SKINS, type Skin } from "@cubecore/skin";

export interface CubeSkinRule {
  /** Protocol id (smartcube-web-bluetooth: "gan-gen4", "moyu32", "qiyi"…) — string = prefix, or a RegExp. */
  protocol?: string | RegExp;
  /** Device or hardware name (as the cube advertises it). */
  name?: RegExp;
  skin: Skin | keyof typeof SKINS;
}

const test = (m: string | RegExp | undefined, value: string) => m === undefined || (typeof m === "string" ? value.startsWith(m) : m.test(value));

const BUILT_IN: CubeSkinRule[] = [
  { protocol: "gan", name: /i4\b|i4[^\d]|gan\s*i4/i, skin: "ganI4" },
  { protocol: "gan", skin: "gan" },
  { protocol: "qiyi", name: /^QY-QYSC/i, skin: "qiyiSC" },
  { skin: "stickerless" },
];
const registered: CubeSkinRule[] = [];

/** Add a rule ahead of the built-in ones (later registrations win over earlier ones). */
export function registerCubeSkin(rule: CubeSkinRule): void {
  registered.unshift(rule);
}

/** The skin for a cube: its protocol and the names it reported. */
export function skinForCube(cube: { protocol: { id: string }; name?: string; hardwareName?: string }): Skin {
  const names = [cube.name ?? "", cube.hardwareName ?? ""];
  const rule = [...registered, ...BUILT_IN].find((r) => test(r.protocol, cube.protocol.id) && (!r.name || names.some((n) => r.name!.test(n))))!;
  return typeof rule.skin === "string" ? SKINS[rule.skin] : rule.skin;
}
