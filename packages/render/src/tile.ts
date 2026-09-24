/**
 * Tile solids — pure geometry (no three.js), shared by the renderer and its
 * tests. A tile is its outline (from @cubecore/skin: rounded shape, custom
 * SVG path or stickerless) swept through a cross-section:
 *
 *        top (flat) ── bevel (quarter round, `bevel` radius) ─┐
 *                                                             │ wall
 *   z = −sink ─────────────────────────────────────────────── ┘ (into the body)
 *
 * Sides lying on the cube's outer edge (stickerless `fillOuter`) are not
 * bevelled: they are mitred at 45° instead, so the tiles of two faces of one
 * piece meet on the edge line and their colours touch, like on a real
 * stickerless cube. With `edgeRadius` the cube edge is rounded: each of the
 * two tiles curves over its half (45°) of a quarter round, meeting the other
 * on the mitre plane — colour runs round the edge, no seam. Normals are given explicitly — smooth round the bevel,
 * straight up on the top — so a lit ("plastic") material shades it cleanly.
 */

export type Pt = readonly [number, number];

export interface TileProfile {
  /** Height of the tile above the cubie face (cubie units). */
  thickness: number;
  /** Radius of the rounded top edge (≤ thickness + sink). 0 = sharp. */
  bevel: number;
  /** Segments of the bevel's quarter round. */
  segments: number;
  /** How deep the tile reaches below the cubie face — into a body shrunk by `bodyInset`. */
  sink: number;
  /** Rounding of the cube's outer edges (stickerless, cubie units): each tile takes half of a quarter round. */
  edgeRadius?: number;
}

export interface Mitre {
  /** Which local sides lie on the cube's outer edge: -1 / 0 / +1 along x (u) and y (v). */
  u: number;
  v: number;
  /** Coordinate of the cube edge at z = 0 (the outline reaches it there). */
  edge: number;
  /** Width of the zone next to the edge that blends from mitred to bevelled. */
  ramp: number;
}

export interface TileSolid {
  positions: Float32Array;
  normals: Float32Array;
  /** Side triangles (indices into positions). */
  sides: Uint32Array;
  /** Index of the first top-ring vertex; the top cap is triangulated from `topRing` by the caller. */
  topStart: number;
  /** The top outline (2D), for the caller's triangulator; its vertices follow `topStart` in positions. */
  topRing: Pt[];
}

/** Drop consecutive duplicate points (rounded corners with radius 0 repeat their corner). */
export function dedupe(outline: readonly Pt[], eps = 1e-7): Pt[] {
  const out: Pt[] = [];
  for (const p of outline) {
    const q = out[out.length - 1];
    if (!q || Math.abs(p[0] - q[0]) > eps || Math.abs(p[1] - q[1]) > eps) out.push(p);
  }
  const first = out[0], last = out[out.length - 1];
  if (out.length > 1 && Math.abs(first[0] - last[0]) <= eps && Math.abs(first[1] - last[1]) <= eps) out.pop();
  return out;
}

/** Outward unit normal at each vertex (outline counter-clockwise) and the miter factor keeping offsets parallel. */
function vertexNormals(pts: readonly Pt[]): { n: Pt; scale: number }[] {
  const count = pts.length;
  const edgeNormal = (i: number): Pt => {
    const a = pts[i], b = pts[(i + 1) % count];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
  };
  return pts.map((_, i) => {
    const e1 = edgeNormal((i + count - 1) % count), e2 = edgeNormal(i);
    let nx = e1[0] + e2[0], ny = e1[1] + e2[1];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const cos = nx * e2[0] + ny * e2[1];
    return { n: [nx, ny] as Pt, scale: 1 / Math.max(0.5, cos) };
  });
}

/** How strongly a point belongs to the cube's outer edge: 1 on it, 0 beyond `ramp` from it. */
function edgeWeight(c: number, dir: number, mitre: Mitre): number {
  if (dir === 0) return 0;
  return Math.max(0, 1 - (mitre.edge - c * dir) / mitre.ramp);
}

/**
 * One cross-section level of a swept solid. Inner sides: height z, inward
 * offset d, normal tilt phi (0 = sideways, π/2 = up, < 0 = facing down).
 * Outer (cube-edge) sides: height oz, extent beyond the edge line `off`, tilt ophi.
 */
interface Ring {
  z: number;
  d: number;
  phi: number;
  oz: number;
  off: number;
  ophi: number;
  /**
   * Deep rings (piece skirts): inset every vertex by `d`, then cut with the
   * mitre planes (x ≤ edge + z on an outer side) — exact at any depth, where
   * the blended edge weights used near the top would skew the corners.
   */
  clamp?: boolean;
}

/** Sweep `outline` through `rings` (bottom up); optionally close the top with a flat cap. */
function sweep(outlineIn: readonly Pt[], rings: readonly Ring[], mitre: Mitre | null, cap: boolean): TileSolid {
  const outline = dedupe(outlineIn);
  const vn = vertexNormals(outline);
  const n = outline.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const weights = outline.map(([x, y]) => ({
    ku: mitre ? edgeWeight(x, mitre.u, mitre) : 0,
    kv: mitre ? edgeWeight(y, mitre.v, mitre) : 0,
  }));
  const place = (i: number, ring: Ring): [number, number, number] => {
    let [x, y] = outline[i];
    if (ring.clamp) {
      x -= vn[i].n[0] * ring.d * vn[i].scale;
      y -= vn[i].n[1] * ring.d * vn[i].scale;
      if (mitre) {
        const limit = mitre.edge + ring.z;
        if (mitre.u !== 0) x = mitre.u > 0 ? Math.min(x, limit) : Math.max(x, -limit);
        if (mitre.v !== 0) y = mitre.v > 0 ? Math.min(y, limit) : Math.max(y, -limit);
      }
      return [x, y, ring.z];
    }
    const { ku, kv } = weights[i];
    // The inner offset fades out towards the outer edge; outer sides follow the mitre / edge round.
    const innerWeight = (1 - ku) * (1 - kv);
    x -= vn[i].n[0] * ring.d * vn[i].scale * innerWeight;
    y -= vn[i].n[1] * ring.d * vn[i].scale * innerWeight;
    if (mitre) {
      x += mitre.u * ring.off * ku;
      y += mitre.v * ring.off * kv;
    }
    const k = Math.max(ku, kv);
    return [x, y, ring.z * (1 - k) + ring.oz * k];
  };
  const normal = (i: number, ring: Ring): [number, number, number] => {
    const { ku, kv } = weights[i];
    const k = Math.max(ku, kv);
    const c = Math.cos(ring.phi), s = Math.sin(ring.phi);
    let nx = vn[i].n[0] * c * (1 - k), ny = vn[i].n[1] * c * (1 - k), nz = s * (1 - k);
    if (k > 0 && mitre) {
      const ou = mitre.u * ku, ov = mitre.v * kv, ol = Math.hypot(ou, ov) || 1;
      nx += (ou / ol) * Math.cos(ring.ophi) * k;
      ny += (ov / ol) * Math.cos(ring.ophi) * k;
      nz += Math.sin(ring.ophi) * k;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };

  for (const ring of rings) {
    for (let i = 0; i < n; i++) {
      positions.push(...place(i, ring));
      normals.push(...normal(i, ring));
    }
  }
  const sides: number[] = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i, bb = j * n + ((i + 1) % n), c = (j + 1) * n + ((i + 1) % n), d = (j + 1) * n + i;
      sides.push(a, bb, c, a, c, d);
    }
  }

  // Top cap: its own copy of the top ring, facing straight up.
  const topStart = positions.length / 3;
  const topRing: Pt[] = [];
  if (cap) {
    const top = rings[rings.length - 1];
    for (let i = 0; i < n; i++) {
      const p = place(i, top);
      positions.push(...p);
      normals.push(0, 0, 1);
      topRing.push([p[0], p[1]]);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), sides: new Uint32Array(sides), topStart, topRing };
}

export function tileSolid(outline: readonly Pt[], profile: TileProfile, mitre: Mitre | null): TileSolid {
  const t = profile.thickness;
  const b = Math.max(0, Math.min(profile.bevel, t + profile.sink));
  // The rounded cube edge dips 0.29·R below the top where the two tiles meet; keep that above the bottom.
  const R = mitre ? Math.max(0, Math.min(profile.edgeRadius ?? 0, (t + profile.sink) / (1 - Math.SQRT1_2))) : 0;
  const segs = b > 0 || R > 0 ? Math.max(1, profile.segments) : 0;

  const arcStart = t - R * (1 - Math.SQRT1_2); // where the edge round meets the mitre plane
  const rings: Ring[] = [{ z: -profile.sink, d: 0, phi: 0, oz: -profile.sink, off: -profile.sink, ophi: 0 }];
  if (segs > 0) {
    rings.push({ z: t - b, d: 0, phi: 0, oz: arcStart, off: arcStart, ophi: 0 });
    for (let k = 1; k <= segs; k++) {
      const s = k / segs;
      const th = s * (Math.PI / 2);
      const op = Math.PI / 4 + s * (Math.PI / 4); // 45° (on the mitre) → 90° (flat top)
      rings.push({
        z: t - b + b * Math.sin(th),
        d: b * (1 - Math.cos(th)),
        phi: th,
        oz: t - R + R * Math.sin(op),
        off: t - R + R * Math.cos(op),
        ophi: op,
      });
    }
  } else rings.push({ z: t, d: 0, phi: 0, oz: t, off: t, ophi: 0 });
  return sweep(outline, rings, mitre, true);
}

/**
 * The piece's plastic under a tile: the tile outline continued down into the
 * cubie from `top` to `depth` (both below the face, positive numbers),
 * narrowing by `taper` on the inner sides — the front of a piece is larger
 * than its back, and a centre piece is as round as its tile. Outer sides
 * stay on the mitre, so the skirts of one piece's faces close its outside.
 * No caps: the top is covered by the tile, the bottom faces the core.
 */
export function skirtSolid(outline: readonly Pt[], shape: { top: number; depth: number; taper: number }, mitre: Mitre | null): TileSolid {
  const h = Math.max(1e-6, shape.depth - shape.top);
  const phi = -Math.atan2(shape.taper, h); // walls lean inwards going down: normals tilt downwards
  const rings: Ring[] = [
    { z: -shape.depth, d: shape.taper, phi, oz: -shape.depth, off: -shape.depth, ophi: 0, clamp: true },
    { z: -shape.top, d: 0, phi, oz: -shape.top, off: -shape.top, ophi: 0, clamp: true },
  ];
  return sweep(outline, rings, mitre, false);
}
