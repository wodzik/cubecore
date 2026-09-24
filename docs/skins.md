# Making a skin

A skin is **plain data** (`Skin` from `@cubecore/skin`). The same object
drives the 3D renderer (`@cubecore/render`) and the SVG/PNG pictures
(`@cubecore/image`), so one skin looks the same everywhere. Start from a
preset and change what you need:

```ts
import { SKINS, type Skin } from "@cubecore/skin";

const mine: Skin = {
  ...SKINS.ganI4,
  body: "#202226",
  stickers: { ...SKINS.ganI4.stickers, colors: ["#fff", "#e33", "#2c5", "#fd3", "#f82", "#26f"] },
};
renderer.setSkin(mine);
renderSvg(state, { skin: mine });
```

Colours are per **colour class** (the sticker's home face, U R F D L B), so a
different colour scheme is just another `colors` array (`withColors`).

## The layers of a skin

| What | Fields | Notes |
|---|---|---|
| Plastic | `body`, `cubieSize`, `cubieRadius`, `bodyInset` | `bodyInset` recesses the core under thick tiles |
| Piece shape | `pieces: { depth, taper, core }` | plastic under each tile follows the tile outline and narrows inwards (stickerless cubes) |
| Tile outline (seen from above) | `stickers.size`, `radius`, `shape` (radii per corner / edge / centre, inner vs outer corners), `paths` (your own SVG outline per piece kind) | `paths` use a 0..1 box, face centre towards the bottom-right (corner tiles) / bottom (edge tiles) |
| Tile cross-section | `stickers.thickness`, `bevel`, `edgeRadius`, `fillOuter` | `fillOuter` + `edgeRadius`: stickerless — colours meet round the cube's edges |
| Finish | `stickers.material` (`"flat"` exact colours / `"plastic"` lit), `roughness` | |
| Masks & back stickers | `mask`, `hints` | colours for ignored / oriented / dimmed stickers |
| Decals | `decals` | any PNG / SVG on chosen stickers (below) |
| Features | `features` | extra geometry on chosen stickers (below) |

## Choosing stickers

Decals and features take a `StickerSelector`; all given conditions must hold:

```ts
{ faces: ["D"], kinds: ["center"] }   // the yellow centre (western scheme: D = yellow)
{ kinds: ["center"] }                 // every centre
{ faces: ["R"] }                      // all nine red stickers
{ stickers: [4] }                     // exactly the U centre (home facelet index)
```

They belong to the **sticker**, not to a place on the cube: whatever you turn,
the yellow centre's charging port stays on the yellow centre and turns with
it (corner and edge stickers too — see core `stickerTurn`).

## Decals — your own images

```ts
decals: [
  { select: { stickers: [4] }, image: "/brand.png", size: 0.62, blend: "multiply" },
  { select: { faces: ["R"] }, image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">…</svg>`, size: 0.5 },
]
```

- `image`: a URL, a `data:` URL or an SVG string.
- `size`: fraction of the tile side; `offset`: `[x, y]` in fractions of the
  tile's half side (±1 = tile edge, y up); `rotate`: extra quarter turns.
- `blend: "multiply"` makes a logo drawn on white sit on any colour.
- Hidden while a mask dims or greys the sticker (`onlyRegular: false` to keep).
- Brand logos are trademarks — ship your own, the library ships none.

## Features — extra geometry

A skin names a feature `type` and passes `params`; the code is registered once:

```ts
features: [
  { select: { faces: ["D"], kinds: ["center"] }, type: "slot", params: { width: 0.42, height: 0.11 } },
  { select: { kinds: ["center"] }, type: "holes", params: { radius: 0.045, at: [[0.64, 0.64], [-0.64, -0.64]] } },
]
```

Built in: `holes` (`radius`, `at`, `opacity`) and `slot` (`width`, `height`,
`radius`, `at`, `opacity`). Add your own with `defineFeature`:

```ts
import { defineFeature } from "@cubecore/skin";

defineFeature({
  type: "ridge",
  // three.js objects in tile-local units: x/y in the tile plane (centre 0, cubie units), z = 0 on the tile top.
  build3d({ three, side, params }) {
    const m = new three.Mesh(new three.BoxGeometry(side * 0.6, side * 0.04, 0.01), new three.MeshStandardMaterial({ color: 0x222222 }));
    m.position.z = 0.005;
    return m;
  },
  // Optional, for pictures: SVG markup in the tile's 0..1 box (y down).
  svg: () => `<rect x="0.2" y="0.48" width="0.6" height="0.04" fill="#222"/>`,
});
```

Register before building the renderer / rendering pictures. A feature with no
`svg` simply doesn't appear in 2D; unknown types are skipped.

## Where the code lives

- `@cubecore/skin` — `skin.ts` (the data model, presets), `shapes.ts` (tile
  outlines), `attachments.ts` (selectors, decals, `defineFeature`, built-ins).
- `@cubecore/render` — `tile.ts` (tile / piece solids, pure maths),
  `build/tiles.ts` (three.js geometry for a skin), `build/attachments.ts`
  (decals & features riding on stickers), `renderer.ts` (scene, animation).
- `@cubecore/image` — `svg.ts` (the same skin as SVG).

Planned: whole-piece models (glTF per corner / edge / centre, materials named
`sticker-*` and `body`) for cubes that parameters can't describe.
