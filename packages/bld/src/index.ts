/**
 * Blindfolded solving (Old Pochmann): letter schemes, memorisation (the
 * letters to remember for a scrambled cube), following the execution letter
 * by letter on a smart cube, and a skin with the letters on the stickers.
 *
 *   const m = memo(state);             // { edges: ["Q","U",…], corners: [...], parity, … }
 *   formatMemo(m.edges)                // "QU SR NX IV PR DE"
 *   const t = new BldTracker(state);   // push the cube's moves; t.progress says which letter is done
 *   player.skin = letterSkin(SKINS.default);
 */

export * from "./scheme";
export * from "./memo";
export * from "./tracker";
export * from "./skin";
