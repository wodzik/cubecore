/**
 * Tile and piece geometry for a skin — everything the renderer needs to
 * build one cubie, as cached three.js geometries. Pure construction, no
 * scene state: swap this module (or wrap it) to give a skin different solids.
 *
 * Per facelet POSITION, a tile's shape only depends on its piece kind and
 * where it sits (corner / edge / centre, which way the centre is), so tiles
 * are built per position and cached per distinct shape. Anything that must
 * follow a particular STICKER (logos, holes, charging ports) is an
 * attachment — see attachments.ts.
 */

import { BufferGeometry, Float32BufferAttribute, Shape, ShapeGeometry, ShapeUtils, SphereGeometry, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { type PieceKind, type Skin, type StickerShape, overlayOutline, reachEdge, roundedOutline, stickerLayout, stickerlessOutline, tileSize, tileThickness } from "@cubecore/skin";
import { type Mitre, type TileSolid, applyDome, cornerRound, densify, planeCut, skirtSolid, tileSolid } from "../tile";

export interface TileKit {
  /** Tile side (cubie units) — the usual one; `sideOf` per piece kind. */
  side: number;
  /** Height of a tile's top above the cubie face — the usual one; `thicknessOf` per piece kind. */
  thickness: number;
  sideOf(kind: PieceKind): number;
  thicknessOf(kind: PieceKind): number;
  /** Distance from a cubie's centre to the plane its tiles sit on. */
  faceOffset: number;
  /** The cubie body (a rounded box, or the small core when pieces are shaped). */
  body: BufferGeometry;
  /** A centre cubie's body: smaller when the centre cap is domed, so it stays under the cap's lowered corners. */
  centerBody: BufferGeometry;
  /**
   * Shaped pieces: the mechanism in the middle of the cube (a dark ball round
   * the one cell with no cubie), so gaps never show through to the far side.
   * Null otherwise.
   */
  mechanism: BufferGeometry | null;
  /** The tile at facelet position `fi`, in its face's local frame (x = a, y = b, z = outward). */
  tile(fi: number): BufferGeometry;
  /** The sticker lying on the tile at `fi` (`stickers.overlay`), in the tile's frame, or null. */
  overlay(fi: number): BufferGeometry | null;
  /** With `overlay.pedestal`: the flat print on top of the (black) sticker pedestal at `fi`, or null. */
  overlayCap(fi: number): BufferGeometry | null;
  /** The piece's plastic under that tile (`skin.pieces`), or null. */
  skirt(fi: number): BufferGeometry | null;
  /** The flat floating "back" sticker for position `fi`. */
  hint(fi: number): BufferGeometry;
  dispose(): void;
}

/** Default radius of the mechanism ball (cubie units). */
const MECHANISM = 1.15;

export function tileKit(skin: Skin): TileKit {
  const size = skin.cubieSize;
  const inset = skin.bodyInset ?? 0;
  const side = skin.stickers.size * size;
  const thickness = skin.stickers.thickness ?? 0;
  const sideOf = (kind: PieceKind) => tileSize(skin, kind) * size;
  const thicknessOf = (kind: PieceKind) => tileThickness(skin, kind);
  const faceOffset = size / 2 + 0.002;
  const edge = faceOffset;
  const shape: StickerShape = skin.stickers.shape ?? {
    corner: { inner: skin.stickers.radius, outer: skin.stickers.radius },
    edge: { inner: skin.stickers.radius, outer: skin.stickers.radius },
    center: skin.stickers.radius,
  };

  // With shaped pieces the box is only the hidden core; the visible plastic is the skirts under the tiles.
  const bodySize = skin.pieces ? skin.pieces.core * size : size - 2 * inset;
  const box = (s: number) => new RoundedBoxGeometry(s, s, s, 3, Math.min(skin.cubieRadius * size, s / 2));
  const body = box(bodySize);
  const dome = skin.stickers.kinds?.center?.dome;
  // The core's top must stay under the dome's lowest point (its corners, `drop` below the face).
  const centerBody = skin.pieces && dome ? box(Math.min(bodySize, size - 2 * (dome.drop + inset + 0.01))) : body;
  // A ball: the same from every side, so layers turn round it; only its dark surface shows deep in the gaps.
  const mechanism = skin.pieces ? new SphereGeometry(skin.pieces.mechanism ?? MECHANISM, 48, 32) : null;

  // Corner-cutting relief: the tile corner(s) next to the face centre (corner pieces; edges if asked).
  const reliefAt = (layout: ReturnType<typeof stickerLayout>, s: number): [number, number][] => {
    const relief = skin.pieces?.relief;
    if (!relief) return [];
    const h = s / 2, su = -Math.sign(layout.u), sv = -Math.sign(layout.v);
    if (layout.kind === "corner") return [[su * h, sv * h]];
    if (layout.kind === "edge" && relief.edges) return layout.u ? [[su * h, h], [su * h, -h]] : [[h, sv * h], [-h, sv * h]];
    return [];
  };

  // Cube corners rounder than the edges: a ball at each corner (in a corner tile's frame).
  const roundCorner = (solid: TileSolid, layout: ReturnType<typeof stickerLayout>): TileSolid => {
    const R = skin.stickers.cornerRound;
    if (!R || layout.kind !== "corner") return solid;
    const top = thicknessOf("corner");
    return cornerRound(solid, [layout.u * (edge - R), layout.v * (edge - R), top - R], [layout.u, layout.v, 1], R);
  };

  const outlineFor = (fi: number) => {
    const layout = stickerLayout(fi, shape);
    const path = skin.stickers.paths?.[layout.kind];
    const fill = skin.stickers.fillOuter === true;
    const s = sideOf(layout.kind), t = thicknessOf(layout.kind);
    const outline = path
      ? fill
        ? reachEdge(pathOutline(path, s, layout.pathQuarters), layout, s / 2, edge)
        : pathOutline(path, s, layout.pathQuarters)
      : fill
        ? stickerlessOutline(layout, s, edge)
        : roundedOutline(s, layout.radii);
    const mitre: Mitre | null = fill ? { u: layout.u, v: layout.v, edge, ramp: Math.max(t * 4, 0.03) } : null;
    const key = (path ? `p|${layout.kind}|${layout.pathQuarters}` : `r|${layout.radii.join(",")}`) + `${fill ? `|${layout.u},${layout.v}` : ""}|${s}|${t}`;
    return { outline, mitre, key, layout, thickness: t, side: s };
  };

  const cache = new Map<string, BufferGeometry>();
  const cached = (key: string, make: () => BufferGeometry) => {
    let g = cache.get(key);
    if (!g) cache.set(key, (g = make()));
    return g;
  };

  return {
    side,
    thickness,
    sideOf,
    // Where things on a sticker sit: on the tile, or on the sticker lying on it.
    thicknessOf: (kind: PieceKind) => thicknessOf(kind) + (skin.stickers.overlay?.thickness ?? 0),
    faceOffset,
    body,
    centerBody,
    mechanism,
    tile(fi) {
      const { outline, mitre, key, thickness: t, layout, side: s } = outlineFor(fi);
      const relief = skin.pieces?.relief;
      const at = relief?.tile !== undefined ? reliefAt(layout, s) : [];
      const undercut = relief && at.length ? { at, r: relief.start ?? 0, z: relief.tile! } : undefined;
      const kind = skin.stickers.kinds?.[layout.kind];
      const bevel = Math.min(kind?.bevel ?? skin.stickers.bevel ?? 0, t);
      const dome = kind?.dome;
      // A domed tile reaches deeper, so its lowered corners stay above its bottom.
      const sink = inset + 0.002 + (dome ? dome.drop : 0);
      return cached(`tile|${key}|${bevel}|${dome ? `${dome.flat},${dome.drop}` : ""}|${undercut ? "uc" : ""}`, () =>
        t > 0
          ? solidToGeometry(
              ((solid) => roundCorner(dome ? applyDome(solid, dome, sink) : solid, layout))(
                tileSolid(
                  dome || undercut || (skin.stickers.cornerRound && layout.kind === "corner") ? densify(outline, undercut ? 192 : 128) : outline,
                  { thickness: t, bevel, segments: 4, sink, edgeRadius: skin.stickers.edgeRadius ?? 0, undercut },
                  mitre,
                ),
              ),
            )
          : new ShapeGeometry(new Shape(outline.map(([x, y]) => new Vector2(x, y)))),
      );
    },
    overlay(fi) {
      const ov = skin.stickers.overlay;
      if (!ov) return null;
      const { layout } = outlineFor(fi);
      const base = thicknessOf(layout.kind);
      return cached(`overlay|${fi}`, () => {
        const g = solidToGeometry(tileSolid(overlayOutline(fi, ov), { thickness: ov.thickness, bevel: Math.min(ov.bevel ?? 0.004, ov.thickness), segments: 2, sink: 0.002 }, null));
        g.translate(0, 0, base);
        return g;
      });
    },
    overlayCap(fi) {
      const ov = skin.stickers.overlay;
      if (!ov?.pedestal) return null;
      const { layout } = outlineFor(fi);
      const z = thicknessOf(layout.kind) + ov.thickness + 0.0008;
      return cached(`cap|${fi}`, () => {
        const pts = overlayOutline(fi, ov, 8, Math.min(ov.bevel ?? 0.004, ov.thickness));
        const g = new ShapeGeometry(new Shape(pts.map(([x, y]) => new Vector2(x, y))));
        g.translate(0, 0, z);
        return g;
      });
    },
    skirt(fi) {
      const pieces = skin.pieces;
      if (!pieces) return null;
      const { outline, mitre, key, layout, side: s } = outlineFor(fi);
      // Solid pieces: through the whole cubie. The walls lean in, so where two meet inside the
      // piece the one from the nearer tile is outermost — the colours split on the diagonals.
      const depth = pieces.fill === "solid" ? size : pieces.depth;
      const at = reliefAt(layout, s);
      const relief = pieces.relief && at.length ? { at, ...pieces.relief } : undefined;
      // The inside is cut flat, square to the piece's direction from the cube's centre and touching the mechanism
      // ball: a corner's inner point becomes a small triangle, an edge's inner edge a flat strip, a centre's back flat.
      // (In this tile's frame the cube's centre is one step in along the face normal and −u / −v across.)
      const ball = pieces.mechanism ?? MECHANISM;
      const centre: [number, number, number] = [-layout.u, -layout.v, -1 - faceOffset];
      const len = Math.hypot(layout.u, layout.v, 1);
      const dir: [number, number, number] = [layout.u / len, layout.v / len, 1 / len];
      return cached(`skirt|${key}|${depth}`, () =>
        solidToGeometry(
          roundCorner(
            planeCut(
              skirtSolid(densify(outline, 192), { top: inset + 0.002, depth, taper: pieces.taper, wall: pieces.wall, relief, steps: 32 }, mitre),
              centre,
              dir,
              ball,
            ),
            layout,
          ),
        ),
      );
    },
    hint(fi) {
      const { layout, side: s } = outlineFor(fi);
      return cached(`hint|${layout.radii.join(",")}|${s}`, () => new ShapeGeometry(new Shape(roundedOutline(s * 0.92, layout.radii).map(([x, y]) => new Vector2(x, y)))));
    },
    dispose() {
      body.dispose();
      for (const g of cache.values()) g.dispose();
      cache.clear();
    },
  };
}

/** three.js geometry of a swept solid (see tile.ts): sides plus a triangulated flat top, if any. */
export function solidToGeometry(solid: TileSolid): BufferGeometry {
  const cap = solid.topRing.length ? ShapeUtils.triangulateShape(solid.topRing.map(([x, y]) => new Vector2(x, y)), []) : [];
  const index = [...solid.sides];
  for (const [a, b, c] of cap) index.push(solid.topStart + a, solid.topStart + b, solid.topStart + c);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
  g.setAttribute("normal", new Float32BufferAttribute(solid.normals, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Outline of a custom SVG path (0..1 box, y down) scaled to `side`, rotated by `quarters` CCW, centred. */
function pathOutline(d: string, side: number, quarters: number): [number, number][] {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const shape = SVGLoader.createShapes(data.paths[0])[0];
  if (!shape) throw new Error("Sticker path has no closed shape");
  const pts = shape.getPoints(8).map((p) => [(p.x - 0.5) * side, (0.5 - p.y) * side] as [number, number]);
  const c = Math.cos((quarters * Math.PI) / 2), s = Math.sin((quarters * Math.PI) / 2);
  const rotated = pts.map(([x, y]) => [Math.round((x * c - y * s) * 1e6) / 1e6, Math.round((x * s + y * c) * 1e6) / 1e6] as [number, number]);
  // Keep the outline counter-clockwise (y flip reversed SVG's winding).
  let area = 0;
  for (let i = 0; i < rotated.length; i++) {
    const [x1, y1] = rotated[i], [x2, y2] = rotated[(i + 1) % rotated.length];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0 ? rotated.reverse() : rotated;
}

