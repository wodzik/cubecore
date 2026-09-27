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
  /**
   * Corner relief reaching into the tile: below `z` (height above the face,
   * ≤ where the bevel starts) the tile is cut back by `r` round each of `at`,
   * leaving a thinner overhanging corner above.
   */
  undercut?: { at: readonly Pt[]; r: number; z: number };
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
  /** Corner relief: outline points within `r` of any of `at` are pushed out onto that circle (a cone when r grows with depth). */
  cut?: { at: readonly Pt[]; r: number; slope: number };
}

/**
 * Cut a disc of radius `r` round `c` out of a closed ring of points (in place,
 * keeping the point count): the run of points inside the disc is laid out
 * along the arc between where the ring enters and leaves it, with normals of
 * a cone facing its axis and downwards (`slope`: how fast the radius grows with depth).
 */
function cutCorner(pts: [number, number, number][], nrm: [number, number, number][], c: Pt, r: number, slope: number): void {
  const n = pts.length;
  const inside = pts.map(([x, y]) => Math.hypot(x - c[0], y - c[1]) < r);
  if (inside.every(Boolean) || !inside.some(Boolean)) return;
  // Find each run of inside points (the ring is closed).
  let start = inside.findIndex((v, i) => v && !inside[(i - 1 + n) % n]);
  const visited = new Set<number>();
  while (start >= 0 && !visited.has(start)) {
    visited.add(start);
    const run: number[] = [];
    for (let i = start; inside[i % n] && run.length < n; i++) run.push(i % n);
    const before = pts[(start - 1 + n) % n], after = pts[(run[run.length - 1] + 1) % n];
    // Where the ring crosses the circle: between the last outside point and the first inside one (and back).
    const cross = (p: number[], q: number[]): number => {
      let lo = 0, hi = 1; // p outside, q inside
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2, x = p[0] + (q[0] - p[0]) * m, y = p[1] + (q[1] - p[1]) * m;
        if (Math.hypot(x - c[0], y - c[1]) < r) hi = m; else lo = m;
      }
      const m = (lo + hi) / 2;
      return Math.atan2(p[1] + (q[1] - p[1]) * m - c[1], p[0] + (q[0] - p[0]) * m - c[0]);
    };
    const a0 = cross(before, pts[run[0]]);
    let a1 = cross(after, pts[run[run.length - 1]]);
    // The arc away from the corner: the shorter way round (the removed bit is less than half the disc).
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    a1 = a0 + da;
    // Place each point by its distance along the original outline (entry → exit), so neighbouring rings stay in step.
    const z = pts[run[0]][2], nl = Math.hypot(1, slope);
    const path = [before, ...run.map((i) => pts[i]), after];
    const cum = [0];
    for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
    const total = cum[cum.length - 1] || 1;
    run.forEach((idx, k) => {
      const a = a0 + (cum[k + 1] / total) * (a1 - a0);
      pts[idx] = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z];
      nrm[idx] = [-Math.cos(a) / nl, -Math.sin(a) / nl, -slope / nl]; // the tile overhangs the cut: it faces down
    });
    const next = inside.findIndex((v, i) => i > run[run.length - 1] && v && !inside[(i - 1 + n) % n]);
    start = next;
  }
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
  // Deep rings shrink the outline towards the tile centre (so its inner sides move in by `d`): unlike an
  // offset along the normals, this can't turn a corner inside out when `d` exceeds the corner's radius.
  const innerHalf = Math.min(...[0, 1].flatMap((k) => [Math.max(...outline.map((p) => p[k])), -Math.min(...outline.map((p) => p[k]))]));
  const place = (i: number, ring: Ring): [number, number, number] => {
    let [x, y] = outline[i];
    if (ring.clamp) {
      const k = Math.max(0, 1 - ring.d / innerHalf);
      x *= k;
      y *= k;
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
    const pts = outline.map((_, i) => place(i, ring));
    const nrm = outline.map((_, i) => normal(i, ring));
    if (ring.cut && ring.cut.r > 0) for (const c of ring.cut.at) cutCorner(pts, nrm, c, ring.cut.r, ring.cut.slope);
    for (let i = 0; i < n; i++) {
      positions.push(...pts[i]);
      normals.push(...nrm[i]);
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
  const flat = (z: number): Ring => ({ z, d: 0, phi: 0, oz: z, off: z, ophi: 0 });
  const rings: Ring[] = [flat(-profile.sink)];
  const uc = profile.undercut;
  if (uc && uc.r > 0 && uc.at.length) {
    // Cut back from the bottom up to z, then a ledge (the underside of the overhang) back out to the outline.
    const z = Math.max(-profile.sink, Math.min(uc.z, t - b));
    const cut = { at: uc.at, r: uc.r, slope: 0 };
    rings[0] = { ...rings[0], cut };
    rings.push({ ...flat(z), cut }, flat(z));
  }
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
 * than its back, and a centre piece is as round as its tile. With `wall` the
 * sides first run straight down to that depth (as real pieces: a flat bit of
 * wall behind the tile, then the narrowing). Outer sides
 * stay on the mitre, so the skirts of one piece's faces close its outside.
 * No caps: the top is covered by the tile, the bottom faces the core.
 */
export function skirtSolid(
  outline: readonly Pt[],
  shape: {
    top: number;
    depth: number;
    taper: number;
    wall?: number;
    relief?: { at: readonly Pt[]; radius: number; depth: number; start?: number };
    /** Extra evenly spaced rings from the wall down (for cutting the solid afterwards, e.g. a chamfer). */
    steps?: number;
  },
  mitre: Mitre | null,
): TileSolid {
  // Straight walls along the tile outline down to `wall`, then leaning in by `taper` at `depth` (a crisp crease between).
  const wall = Math.min(Math.max(shape.wall ?? shape.top, shape.top), shape.depth);
  const h = Math.max(1e-6, shape.depth - wall);
  const phi = -Math.atan2(shape.taper, h); // walls lean inwards going down: normals tilt downwards
  const inset = (z: number) => (z <= wall ? 0 : ((z - wall) / h) * shape.taper);
  // Corner relief: a cone cut from the tile's corner(s) next to the centre, `start` wide at the tile, `radius` at `depth` below it.
  const relief = shape.relief && shape.relief.radius > 0 && shape.relief.at.length ? shape.relief : null;
  const r0 = relief?.start ?? 0;
  const cutAt = (z: number) =>
    relief
      ? { at: relief.at, r: r0 + (relief.radius - r0) * Math.min(1, Math.max(0, (z - shape.top) / relief.depth)), slope: (relief.radius - r0) / relief.depth }
      : undefined;
  const ring = (z: number, tilt: number): Ring => ({ z: -z, d: inset(z), phi: tilt, oz: -z, off: -z, ophi: 0, clamp: true, cut: cutAt(z) });
  const levels = new Set([shape.top, wall, shape.depth]);
  if (relief) for (let k = 1; k <= 16; k++) levels.add(Math.min(shape.depth, shape.top + (relief.depth * k) / 16));
  for (let k = 1; k < (shape.steps ?? 0); k++) levels.add(wall + ((shape.depth - wall) * k) / (shape.steps ?? 1));
  const zs = [...levels].sort((a, b) => b - a); // bottom up
  const rings: Ring[] = [];
  for (const z of zs) {
    if (z === wall && wall > shape.top) rings.push(ring(z, phi), ring(z, 0)); // the crease: two normals
    else rings.push(ring(z, wall > shape.top && z <= wall ? 0 : phi));
  }
  return sweep(outline, rings, mitre, false);
}

/**
 * A domed top (e.g. QiYi's centre caps): flat inside a circle of `flat` ×
 * the tile's reach, then falling straight to `drop` lower at the outline's
 * farthest points — a round plateau at the tile's height, the corners
 * lower. The tile's rings are lowered in proportion to their height above
 * its bottom (`sink` below the face, which must be deeper than `drop`), and
 * the flat cap is replaced by a polar mesh with a ring exactly on the
 * circle, so the plateau's edge is round.
 */
export function applyDome(solid: TileSolid, dome: { flat: number; drop: number }, sink: number, spokes = 10): TileSolid {
  const ring = solid.topRing;
  if (!ring.length) return solid;
  const reach = Math.max(...ring.map(([x, y]) => Math.hypot(x, y)));
  const r0 = dome.flat * reach;
  const slope = dome.drop / Math.max(1e-6, reach - r0);
  const lowerBy = (r: number) => Math.max(0, r - r0) * slope;
  const zTop = solid.positions[solid.topStart * 3 + 2];
  // Sides: lowered in proportion to height, so their bottom stays put.
  const positions = Array.from(solid.positions.subarray(0, solid.topStart * 3));
  const normals = Array.from(solid.normals.subarray(0, solid.topStart * 3));
  for (let i = 0; i < positions.length; i += 3) {
    const k = (positions[i + 2] + sink) / (zTop + sink);
    positions[i + 2] -= lowerBy(Math.hypot(positions[i], positions[i + 1])) * Math.max(0, Math.min(1, k));
  }
  // Cap: a ray from the middle to each outline point — flat out to the circle, then down the slope.
  const sides = Array.from(solid.sides);
  const start = positions.length / 3;
  const n = ring.length;
  const samples = spokes * 2 + 1;
  for (const [px, py] of ring) {
    const R = Math.hypot(px, py) || 1e-9;
    const ux = px / R, uy = py / R;
    const rc = Math.min(r0, R);
    for (let k = 0; k < samples; k++) {
      const r = k <= spokes ? (rc * k) / spokes : rc + ((R - rc) * (k - spokes)) / spokes;
      positions.push(ux * r, uy * r, zTop - lowerBy(r));
      if (r > r0 + 1e-9) {
        const l = Math.hypot(slope, 1);
        normals.push((ux * slope) / l, (uy * slope) / l, 1 / l);
      } else normals.push(0, 0, 1);
    }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k + 1 < samples; k++) {
      const a = start + i * samples + k, b = start + i * samples + k + 1, c = start + j * samples + k + 1, d = start + j * samples + k;
      sides.push(a, b, c, a, c, d);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), sides: new Uint32Array(sides), topStart: positions.length / 3, topRing: [] };
}

/** The outline resampled to `count` points evenly along its length (dense enough for a domed top to be round). */
export function densify(outlineIn: readonly Pt[], count = 128): Pt[] {
  const pts = dedupe(outlineIn);
  const n = pts.length;
  const seg = pts.map((p, i) => Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const out: Pt[] = [];
  let i = 0, acc = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (acc + seg[i] < target && i < n - 1) acc += seg[i++];
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    const a = pts[i], b = pts[(i + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * Cut a solid flat: points behind the plane through `c + d·n` square to `n`
 * (unit, pointing away from `c`) are moved onto it and face back along `−n` —
 * a piece's inside cut square to its direction from the cube's centre, clear
 * of the mechanism ball of radius `d`. Needs rings dense enough where the plane crosses them.
 */
export function planeCut(solid: TileSolid, c: readonly [number, number, number], n: readonly [number, number, number], d: number): TileSolid {
  const positions = solid.positions.slice();
  const normals = solid.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    const s = (positions[i] - c[0]) * n[0] + (positions[i + 1] - c[1]) * n[1] + (positions[i + 2] - c[2]) * n[2] - d;
    if (s >= 0) continue;
    for (let k = 0; k < 3; k++) {
      positions[i + k] -= s * n[k];
      normals[i + k] = -n[k];
    }
  }
  return { ...solid, positions, normals };
}

/**
 * Round a cube corner: points of a corner piece's solid beyond the ball of
 * radius `r` at `c` (in all three outward directions `dir`) are pulled onto
 * it — a cube corner rounder than its edges.
 */
export function cornerRound(solid: TileSolid, c: readonly [number, number, number], dir: readonly [number, number, number], r: number): TileSolid {
  const positions = solid.positions.slice();
  const normals = solid.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    const d = [positions[i] - c[0], positions[i + 1] - c[1], positions[i + 2] - c[2]];
    if (d[0] * dir[0] <= 0 || d[1] * dir[1] <= 0 || d[2] * dir[2] <= 0) continue;
    const l = Math.hypot(d[0], d[1], d[2]);
    if (l <= r) continue;
    for (let k = 0; k < 3; k++) {
      positions[i + k] = c[k] + (d[k] / l) * r;
      normals[i + k] = d[k] / l;
    }
  }
  return { ...solid, positions, normals };
}
