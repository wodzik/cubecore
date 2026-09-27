# 3D and pictures (`@wodzik/cubecore/render`, `@wodzik/cubecore/image`)

Both draw from the same skin ([skins.md](skins.md)): `render` with three.js
(a live cube, or still pictures), `image` as SVG without WebGL (and PNG in
the browser or on a server).

## `CubeRenderer`

```ts
import { CubeRenderer, SKINS } from "@wodzik/cubecore/render";
import { applyMoves, solvedState } from "@wodzik/cubecore/core";

const r = new CubeRenderer(document.querySelector("#cube")!, {
  skin: SKINS.gan,
  theme: "dark",                                   // skins adjust to light / dark pages
  camera: { latitude: 30, longitude: 30, distance: "auto", fov: 30 },
  dragToRotate: true,
  quarterTurnMs: 120,
  backView: "top-right",                           // "none" | "side-by-side" | "top-right"
});

r.setState(applyMoves(solvedState(), "R U R'"));
await r.animate(parseAlg("U'")[0]);                // one move, animated
r.showPartial(state, move, 0.4);                   // a move 40 % done (scrubbing)
r.setMask(cfopMask("oll"));                        // see core.md → Masks
r.setOrientation(gyroQuaternion, 0.2);             // a smart cube's gyro; null to stop
r.setExplode(0.3);
const png = r.snapshot();                          // a data URL of the current frame
r.dispose();                                       // frees the WebGL context
```

`@wodzik/cubecore/render` re-exports `@wodzik/cubecore/skin`, so `SKINS`, `withStickers`
and the rest come from the same import. `setSkin` and `setTheme` switch
the look of a live cube. `showPosition(renderer, start, moves, position)`
shows a replay position from `@wodzik/cubecore/timeline`.

Browsers keep about 16 WebGL contexts per page. A page with many cubes
should use one live renderer and still pictures for the rest.

## Still pictures from one renderer: `CubePictures`

```ts
import { sharedPictures } from "@wodzik/cubecore/render";

const pictures = sharedPictures();                   // one hidden renderer for the page
img.src = pictures.draw({ state, mask, skin, camera: { latitude: 20, longitude: 25 } }, cacheKey);
```

Every picture has the same 3D look as the live cube. Pictures are PNG data
URLs, cached by `key` (up to 500 by default; `new CubePictures(size, maxCached)`
for your own). The `orientation` option turns the whole cube, e.g. to show
a case as the cube is held.

## Turn arrows

Arrows show the next turn on the 3D cube: two per turning layer, on
opposite sides, travelling round the layer the way it turns.

```ts
import { turnArrow } from "@wodzik/cubecore/core";

r.setTurnArrows([turnArrow(move, frame)], { shape: "circle", color: "#2f8bff", speed: 0.35 });
r.setTurnArrows(null);                               // off
```

- `shape`: `"box"` runs over the faces and round the edges, `"circle"` is an
  arc. Both look the same from every camera angle.
- `quarters` of the arrow: ±1 a single turn, ±2 a double, ±3 a triple — one
  arrowhead per quarter turn.
- `SequenceTracker.nextTurn` gives the arrows for the move due, the undo
  after a slip, or `"wrong-way"` when the right face was turned the wrong
  way. The elements colour it: blue next, orange wrong way. See
  [scrambles.md](scrambles.md#arrows-on-the-3d-cube).

Arrows are drawn after the stickers and the decals (logos), so a logo never
covers them.

## SVG pictures: `@wodzik/cubecore/image`

```ts
import { renderSvg, SvgCache, svgDataUrl, svgToPngBlob } from "@wodzik/cubecore/image";

const svg = renderSvg(state, { view: "iso", size: 160, skin, mask, frame, theme: "light" });
img.src = svgDataUrl(svg);
const blob = await svgToPngBlob(svg, 320);           // in the browser
```

- `view`: `"iso"` (three faces), `"top"` (the U face with the side stickers
  of the top layer in perspective, for OLL / PLL), `"net"` (all six faces).
- `frame` draws the cube held another way, e.g. a case with the cross on D
  whatever face it was solved on.
- `SvgCache` caches by `svgKey(state, options)`.
- On a server, `@wodzik/cubecore/image/png-node` has `svgToPng(svg, width)` (needs
  `@resvg/resvg-js`).

No WebGL and no DOM: `renderSvg` also runs in workers and on servers.
