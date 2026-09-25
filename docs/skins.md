# Making a skin

A skin is **plain data** (`Skin` from `@cubecore/skin`). The same object
drives the 3D renderer (`@cubecore/render`) and the SVG/PNG pictures
(`@cubecore/image`), so one skin looks the same everywhere. Start from a
preset and change what you need:

| preset | |
|---|---|
| `standard` | black plastic, rounded stickers |
| `stickerless` | tiles filling the faces |
| `gan` | GAN-style stickerless (rounded corner / edge tongues, near-round centres) |
| `ganI4` | GAN i4 smart cube (from product photos) |
| `gan356m` | GAN 356 M: square corner tiles, round edge tongues, near-round centres — measured from "GAN CUBE 356s M air" by Amyyu (Sketchfab, CC BY 4.0) |

**Per piece kind:** `stickers.kinds` gives corner / edge / centre tiles their
own size and thickness — e.g. a centre cap that is smaller and stands out
more (`gan356m`: `kinds: { center: { size: 0.979, thickness: 0.04 } }`).
Decals and features sit on their own tile's top. `tileSize(skin, kind)` /
`tileThickness(skin, kind)` read the values.

**Logo:** a decal on the centre sticker (`select: { stickers: [4] }` = the
U centre), e.g. `{ image: "/assets/gan-logo.png", size: 0.75, blend: "multiply" }`.
Brand logos are trademarks — the library ships none; bring your own file.

Measuring a skin from a 3D model: a model with separate sticker / tile
meshes gives each tile's size and corner radii (per piece kind, inner corner
towards the face centre vs the others) and the colours — that's how
`gan356m` was made; the model file itself isn't needed at runtime.

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

## Light and dark pages

What reads well on a dark page doesn't always on a light one: grey masked
stickers, a white back sticker (on white it vanishes — cubing.js #394), the
background. `skin.themes` holds the adjustments; presets are tuned for dark
and carry a `light` theme:

```ts
themes: {
  light: {
    mask: { ignored: "#c4c7cd" },
    hints: { opacity: 0.85, colors: ["#6f7b8a", "#e8322f", "#1fb24a", "#e0bb00", "#ff8a00", "#1e5eff"] },
  },
}
```

`themed(skin, "light")` applies them; `new CubeRenderer(el, { theme })` /
`renderer.setTheme()`, `renderSvg(state, { theme })`, and
`<cube-player theme="light | dark | auto">` (auto = the system setting,
followed live) do it for you. `hints.colors` is a back-sticker palette of its
own (any theme).

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

## Your own 3D pieces (glTF)

When parameters aren't enough — a specific cube model's exact shapes — give
the skin one model per piece kind:

```ts
const mine: Skin = {
  ...SKINS.ganI4,
  models: { corner: "/models/my-corner.glb", edge: "/models/my-edge.glb", center: "/models/my-center.glb", surface: 0.04 },
};
```

Convention (1 unit = one cubie, centred on the cubie, Y up, Z towards you):

| kind | modelled as | stickers |
|---|---|---|
| corner | the UFR corner (+x +y +z) | `sticker-U`, `sticker-F`, `sticker-R` |
| edge | the UF edge (0 +y +z) | `sticker-U`, `sticker-F` |
| center | the U centre (0 +y 0) | `sticker-U` |

Meshes whose **material name** is `sticker-X` are recoloured (state, masks);
everything else (`body`, springs, a moulded logo…) is drawn as authored. The
renderer rotates each model onto all positions of its kind. Kinds left out
keep the built-in pieces; until a model has loaded (or if loading fails) the
built-in pieces are drawn. `surface` = height of the sticker surface above
the cubie face, so decals and features sit on it. `scale` if you didn't
model in cubie units. 2D pictures keep using the skin's outlines.

**Start from a template:** `bun scripts/export-models.ts ganI4 ./out` writes
the skin's pieces as `.gltf` in exactly this convention (`pieceTemplates(skin)`
in code) — open in Blender, reshape, keep the material names, export GLB.
`demo/models/` has the i4 templates (our own geometry, CC0); the "glTF models
(sample)" skin in `/render` draws them. Brand models are the app's business,
like logos.

## Where the code lives

- `@cubecore/skin` — `skin.ts` (the data model, presets), `shapes.ts` (tile
  outlines), `attachments.ts` (selectors, decals, `defineFeature`, built-ins).
- `@cubecore/render` — `tile.ts` (tile / piece solids, pure maths),
  `pieceModels.ts` (placing glTF pieces), `gltf.ts` (templates), `build/models.ts` (loading),
  `build/tiles.ts` (three.js geometry for a skin), `build/attachments.ts`
  (decals & features riding on stickers), `renderer.ts` (scene, animation).
- `@cubecore/image` — `svg.ts` (the same skin as SVG).

