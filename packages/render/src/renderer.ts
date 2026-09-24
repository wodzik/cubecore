/**
 * CubeRenderer — a three.js view of a cubecore State.
 *
 * - Headless-first: no UI of its own; you drive it (setState / animate /
 *   showPosition) and style/build controls however you like.
 * - Renders on demand (nothing is drawn while nothing changes).
 * - Animation: see layers.ts — colours of the state BEFORE the move, its layer
 *   rotated by progress × angle.
 * - Gyroscope-ready: `setOrientation(quaternion)` rotates the whole cube
 *   (e.g. from a smart cube's gyro), independently of the camera.
 */

import {
  BackSide,
  Color,
  FrontSide,
  Group,
  HemisphereLight,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Matrix4,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  CUBIES,
  type CenterSpins,
  FACELETS,
  FACE_BASIS,
  type Mask,
  type Move,
  type State,
  advanceSpins,
  applyMove,
  colorAt,
  maskStateAt,
  solvedSpins,
  solvedState,
} from "@cubecore/core";
import { SKINS, type Skin, stickerColor } from "@cubecore/skin";
import { layerTurn, defaultDuration } from "./layers";
import { type AttachmentSet, buildAttachments, placeAttachments } from "./build/attachments";
import { type TileKit, tileKit } from "./build/tiles";
import { loadModel, readyModel } from "./build/models";
import { PLACEMENTS, stickerFaceOf } from "./pieceModels";
import { type BackView, backPosition, viewports } from "./viewports";

export interface CameraOptions {
  /** Degrees above the horizon. */
  latitude: number;
  /** Degrees around the vertical axis (0 = looking at F, positive = towards R). */
  longitude: number;
  /** Distance from the centre in cubie units, or "auto" to fit the cube (and back stickers) in view. */
  distance: number | "auto";
  /** Vertical field of view, degrees. */
  fov: number;
}

export interface RendererOptions {
  skin?: Skin;
  camera?: Partial<CameraOptions>;
  /** Drag with mouse/touch to orbit the camera. Default true. */
  dragToRotate?: boolean;
  /** Quarter-turn animation length in ms. Default 120. */
  quarterTurnMs?: number;
  /** Second view from the opposite side showing the hidden faces. Default "none". */
  backView?: BackView;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface Partial3 {
  move: Move;
  progress: number;
}

export class CubeRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  /** Opposite the main camera — sees the three faces the main view hides. */
  private backCamera: PerspectiveCamera;
  private backView: BackView;
  private size = { w: 1, h: 1 };
  private root = new Group(); // gyroscope orientation applies here
  private cubieGroups: Group[] = [];
  /** Meshes coloured as the sticker at each facelet position (a built-in tile, or a model's sticker-X meshes). */
  private paintTargets: Mesh[][] = [];
  /** Tile frame at each facelet position (z = 0 on the cubie face): where decals and features attach. */
  private anchors: Object3D[] = [];
  /** Height of the sticker surface above the anchors. */
  private surface = 0;
  private hintMeshes: Mesh[] = [];
  private kit: TileKit | null = null;
  private attachments: AttachmentSet | null = null;
  /** Cubie group index holding each facelet position. */
  private cubieOfFacelet: number[] = [];
  private materials = new Map<string, MeshBasicMaterial | MeshStandardMaterial>();
  private skin: Skin;
  private cam: CameraOptions;
  private state: State = solvedState();
  /** Centre spins, tracked through every move so a logo keeps its orientation. */
  private spins: CenterSpins = solvedSpins();
  private mask: Mask | null = null;
  private partial: Partial3 | null = null;
  private frameRequested = false;
  private resizeObserver: ResizeObserver;
  private queue: { move: Move; ms: number; resolve: () => void }[] = [];
  private active: { move: Move; ms: number; start: number; resolve: () => void } | null = null;
  private quarterMs: number;
  private disposed = false;
  private targetOrientation = new Quaternion();
  private orientationSmoothing = 0;

  constructor(private readonly container: HTMLElement, options: RendererOptions = {}) {
    this.skin = options.skin ?? SKINS.standard;
    this.quarterMs = options.quarterTurnMs ?? 120;
    this.cam = { latitude: 30, longitude: 35, distance: "auto", fov: 34, ...options.camera };

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";
    container.appendChild(this.canvas);

    this.camera = new PerspectiveCamera(this.cam.fov, 1, 0.1, 100);
    this.backCamera = new PerspectiveCamera(this.cam.fov, 1, 0.1, 100);
    this.backView = options.backView ?? "none";
    this.scene.add(new HemisphereLight(0xffffff, 0x444444, 2.2));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(4, 8, 6);
    this.scene.add(sun);
    this.scene.add(this.root);

    this.build();
    this.applyCamera();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    if (options.dragToRotate !== false) this.enableDrag();
  }

  // ─── public API ───

  /**
   * Show a state immediately (cancels running and queued animations). A
   * permutation can't say how centres are turned — pass `spins` (see
   * `spinsAfter`) when a logo's orientation matters; default: all upright.
   */
  setState(state: State, spins: CenterSpins = solvedSpins()): void {
    this.finishAll(false);
    this.state = new Uint8Array(state);
    this.spins = new Uint8Array(spins);
    this.partial = null;
    this.requestRender();
  }

  /** Show `state` with `move` part-way (0..1) — for scrubbing / time-accurate replay. */
  showPartial(state: State, move: Move | null, progress = 0, spins: CenterSpins = solvedSpins()): void {
    this.finishAll(false);
    this.state = new Uint8Array(state);
    this.spins = new Uint8Array(spins);
    this.partial = move && progress > 0 && progress < 1 ? { move, progress } : null;
    this.requestRender();
  }

  /**
   * Animate a move from the current state. When moves come faster than they
   * animate (smart cubes do), the running animation snaps to its end and any
   * backlog is applied instantly — only the newest move animates, so the
   * picture never lags behind the real cube. Awaiting each call instead plays
   * an algorithm move by move.
   */
  animate(move: Move, ms = defaultDuration(move, this.quarterMs)): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ move, ms, resolve });
      // A newer move arrived: the running animation snaps to its end.
      if (this.active) this.completeActive();
      this.requestRender();
    });
  }

  get currentSpins(): CenterSpins {
    return new Uint8Array(this.spins);
  }

  get currentState(): State {
    return this.state;
  }

  setMask(mask: Mask | null): void {
    this.mask = mask;
    this.requestRender();
  }

  setSkin(skin: Skin): void {
    this.skin = skin;
    this.build();
    this.applyCamera();
    this.requestRender();
  }

  setCamera(camera: Partial<CameraOptions>): void {
    this.cam = { ...this.cam, ...camera };
    this.applyCamera();
    this.requestRender();
  }

  /** Show the hidden faces in a second view: side by side, as a corner inset, or not at all. */
  setBackView(mode: BackView): void {
    this.backView = mode;
    this.applyCamera();
    this.requestRender();
  }

  get cameraOptions(): CameraOptions {
    return { ...this.cam };
  }

  /**
   * Orientation of the whole cube, e.g. from a smart cube's gyroscope.
   * `smoothing` 0..1 eases towards the target each frame (0 = snap).
   * Pass null to reset.
   */
  setOrientation(q: Quat | null, smoothing = 0): void {
    this.targetOrientation.set(q?.x ?? 0, q?.y ?? 0, q?.z ?? 0, q?.w ?? 1).normalize();
    this.orientationSmoothing = Math.min(Math.max(smoothing, 0), 0.99);
    if (this.orientationSmoothing === 0) this.root.quaternion.copy(this.targetOrientation);
    this.requestRender();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.finishAll(true);
    this.renderer.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.kit?.dispose();
    this.attachments?.dispose();
    this.canvas.remove();
  }

  // ─── scene ───

  private material(color: string, hint: boolean, opacity = 1): MeshBasicMaterial | MeshStandardMaterial {
    // Tiles of a "plastic" skin are lit; hint stickers always stay flat (they're a see-through aid, not plastic).
    const lit = !hint && this.skin.stickers.material === "plastic";
    const roughness = this.skin.stickers.roughness ?? 0.4;
    const key = `${color}|${hint}|${opacity}|${lit}|${roughness}`;
    let m = this.materials.get(key);
    if (!m) {
      m = lit
        ? // A little of the tile's own colour as emission keeps shaded faces from going muddy; the highlight stays.
          new MeshStandardMaterial({ color: new Color(color), emissive: new Color(color), emissiveIntensity: 0.32, roughness, metalness: 0 })
        : new MeshBasicMaterial({
            color: new Color(color),
            side: hint ? BackSide : FrontSide,
            transparent: hint,
            opacity: hint ? opacity : 1,
            depthWrite: !hint,
          });
      this.materials.set(key, m);
    }
    return m;
  }

  private build(): void {
    this.root.clear();
    this.kit?.dispose();
    this.attachments?.dispose();
    this.cubieGroups = [];
    this.paintTargets = Array.from({ length: 54 }, () => []);
    this.anchors = [];
    this.hintMeshes = [];
    const s = this.skin;
    const kit = tileKit(s);
    this.kit = kit;
    const bodyMat = new MeshStandardMaterial({ color: new Color(s.body), roughness: 0.85, metalness: 0 });

    const models = s.models;
    let waiting = false;
    this.surface = models?.surface ?? kit.thickness;

    CUBIES.forEach((cubie, ci) => {
      const g = new Group();
      const place = PLACEMENTS[ci];
      const url = models?.[place.kind];
      const model = readyModel(url);
      if (url && !model) waiting = true;
      if (model) {
        // A model for this kind: rotate it onto the cubie, colour its sticker-X meshes.
        const clone = model.clone(true);
        const r = place.rotation;
        clone.matrixAutoUpdate = false;
        clone.matrix.set(r[0][0], r[0][1], r[0][2], cubie.pos[0], r[1][0], r[1][1], r[1][2], cubie.pos[1], r[2][0], r[2][1], r[2][2], cubie.pos[2], 0, 0, 0, 1);
        if (models?.scale && models.scale !== 1) clone.matrix.multiply(new Matrix4().makeScale(models.scale, models.scale, models.scale));
        clone.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const face = stickerFaceOf((Array.isArray(m.material) ? m.material[0] : m.material)?.name);
          const fi = face ? place.stickers[face] : undefined;
          if (fi !== undefined) this.paintTargets[fi].push(m);
        });
        g.add(clone);
      } else {
        const body = new Mesh(kit.body, bodyMat);
        body.position.set(...cubie.pos);
        g.add(body);
      }
      for (const fi of cubie.facelets) {
        const f = FACELETS[fi];
        const { a, b, n } = FACE_BASIS[f.face];
        const basis = new Matrix4().makeBasis(new Vector3(...a), new Vector3(...b), new Vector3(...n));
        const normal = new Vector3(...n);
        if (model) {
          // Nothing to draw here: an invisible frame for decals / features.
          const anchor = new Object3D();
          anchor.position.set(...f.pos).addScaledVector(normal, kit.faceOffset);
          anchor.quaternion.setFromRotationMatrix(basis);
          g.add(anchor);
          this.anchors[fi] = anchor;
        } else {
          const mesh = new Mesh(kit.tile(fi), this.material("#000000", false));
          mesh.position.set(...f.pos).addScaledVector(normal, kit.faceOffset);
          mesh.quaternion.setFromRotationMatrix(basis);
          g.add(mesh);
          const skirt = kit.skirt(fi);
          if (skirt) {
            const m = new Mesh(skirt, bodyMat);
            m.position.copy(mesh.position);
            m.quaternion.copy(mesh.quaternion);
            g.add(m);
          }
          this.paintTargets[fi].push(mesh);
          this.anchors[fi] = mesh;
        }
        this.cubieOfFacelet[fi] = ci;
        if (s.hints.enabled) {
          const hint = new Mesh(kit.hint(fi), this.material("#000000", true));
          hint.position.set(...f.pos).addScaledVector(normal, 0.5 + s.hints.distance);
          hint.quaternion.setFromRotationMatrix(basis);
          g.add(hint);
          this.hintMeshes[fi] = hint;
        }
      }
      this.root.add(g);
      this.cubieGroups.push(g);
    });
    this.attachments = buildAttachments(s, kit, () => this.requestRender());
    // Models still loading: rebuild with them once they're here (if this skin is still the one shown).
    if (waiting && models) {
      const urls = [models.corner, models.edge, models.center].filter((u): u is string => !!u);
      Promise.all(urls.map(loadModel)).then(() => {
        if (this.skin === s && !this.disposed) {
          this.build();
          this.requestRender();
        }
      });
    }
    this.renderer.setClearColor(s.background ? new Color(s.background) : new Color(0x000000), s.background ? 1 : 0);
  }

  private paint(): void {
    for (let i = 0; i < this.paintTargets.length; i++) {
      const st = this.mask ? maskStateAt(this.mask, this.state, i) : "regular";
      const color = stickerColor(this.skin, colorAt(this.state, i), st);
      for (const mesh of this.paintTargets[i]) {
        mesh.visible = color !== null;
        if (color) mesh.material = this.material(color, false);
      }
      if (this.anchors[i]) this.anchors[i].visible = color !== null;
      const hint = this.hintMeshes[i];
      if (hint) {
        hint.visible = color !== null;
        if (color) hint.material = this.material(color, true, st === "regular" || st === "dim" ? this.skin.hints.opacity : this.skin.hints.ignoredOpacity);
      }
    }
    if (this.attachments) placeAttachments(this.attachments, this.state, this.spins, this.anchors, this.surface, this.mask);
    const turn = this.partial ? layerTurn(this.partial.move) : null;
    const axis = turn ? new Vector3(turn.axis === 0 ? 1 : 0, turn.axis === 1 ? 1 : 0, turn.axis === 2 ? 1 : 0) : null;
    CUBIES.forEach((c, i) => {
      const g = this.cubieGroups[i];
      if (turn && axis && turn.turns(c.pos)) g.quaternion.setFromAxisAngle(axis, turn.angle * this.partial!.progress);
      else g.quaternion.identity();
    });
  }

  private applyCamera(): void {
    const lat = (this.cam.latitude * Math.PI) / 180;
    const lon = (this.cam.longitude * Math.PI) / 180;
    const dir: [number, number, number] = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    const { main, back } = viewports(this.backView, this.size.w, this.size.h);
    this.camera.aspect = main.w / main.h;
    // With a corner inset, pull the main cube back a little so the inset covers less of it.
    const inset = this.backView === "top-right" ? 1.18 : 1;
    const d = this.cam.distance === "auto" ? this.fitDistance(this.camera.aspect, this.skin.hints.enabled) * inset : this.cam.distance;
    this.camera.fov = this.cam.fov;
    this.camera.position.set(dir[0] * d, dir[1] * d, dir[2] * d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    if (back) {
      // Back stickers are hidden in the back view (they'd float between it and the cube), so it fits the bare cube.
      this.backCamera.aspect = back.w / back.h;
      this.backCamera.fov = this.cam.fov;
      const bd = this.cam.distance === "auto" ? this.fitDistance(this.backCamera.aspect, false) : this.cam.distance;
      this.backCamera.position.set(...backPosition([dir[0] * bd, dir[1] * bd, dir[2] * bd]));
      this.backCamera.lookAt(0, 0, 0);
      this.backCamera.updateProjectionMatrix();
    }
  }

  /** Distance at which a sphere around the cube (and its back stickers) fits the narrower field of view, with a margin. */
  private fitDistance(aspect: number, withHints: boolean): number {
    const reach = withHints ? 1 + 0.5 + this.skin.hints.distance + 0.45 : 0;
    const radius = Math.max(1.5 * Math.sqrt(3), reach) * 1.06;
    const vfov = (this.cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    return radius / Math.sin(Math.min(vfov, hfov) / 2);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.size = { w, h };
    this.applyCamera();
    this.requestRender();
  }

  // ─── animation loop (on demand) ───

  requestRender(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number): void {
    this.frameRequested = false;
    if (this.disposed) return;
    let again = false;

    // Backlog (e.g. several moves arrived within one frame): apply all but the newest instantly
    // and animate only that one, so the picture never trails the real cube.
    while (!this.active && this.queue.length > 1) {
      const skipped = this.queue.shift()!;
      this.step(skipped.move);
      skipped.resolve();
    }
    if (!this.active && this.queue.length) {
      const next = this.queue.shift()!;
      this.active = { ...next, start: now };
    }
    if (this.active) {
      const p = this.active.ms > 0 ? (now - this.active.start) / this.active.ms : 1;
      if (p >= 1) {
        this.completeActive();
      } else {
        this.partial = { move: this.active.move, progress: easeInOut(p) };
      }
      again = this.active !== null || this.queue.length > 0;
    }

    if (this.orientationSmoothing > 0 && !this.root.quaternion.equals(this.targetOrientation)) {
      this.root.quaternion.slerp(this.targetOrientation, 1 - this.orientationSmoothing);
      if (this.root.quaternion.angleTo(this.targetOrientation) < 1e-4) this.root.quaternion.copy(this.targetOrientation);
      else again = true;
    }

    this.paint();
    this.draw();
    if (again) this.requestRender();
  }

  private step(move: Move): void {
    this.spins = advanceSpins(this.spins, this.state, move);
    this.state = applyMove(this.state, move);
  }

  private draw(): void {
    const { main, back } = viewports(this.backView, this.size.w, this.size.h);
    if (!back) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.size.w, this.size.h);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(main.x, main.y, main.w, main.h);
    this.renderer.setScissor(main.x, main.y, main.w, main.h);
    this.renderer.render(this.scene, this.camera);
    const shown = this.hintMeshes.map((m) => m?.visible ?? false);
    this.hintMeshes.forEach((m) => m && (m.visible = false));
    this.renderer.setViewport(back.x, back.y, back.w, back.h);
    this.renderer.setScissor(back.x, back.y, back.w, back.h);
    // An inset draws over the main view: clear only depth, so it doesn't punch a hole in the main cube.
    const inset = this.backView === "top-right";
    if (inset) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
    }
    this.renderer.render(this.scene, this.backCamera);
    this.renderer.autoClear = true;
    this.hintMeshes.forEach((m, i) => m && (m.visible = shown[i]));
  }

  private completeActive(): void {
    if (!this.active) return;
    this.step(this.active.move);
    this.partial = null;
    const done = this.active.resolve;
    this.active = null;
    done();
  }

  private finishAll(apply: boolean): void {
    const pending = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = null;
    this.queue = [];
    for (const p of pending) {
      if (apply) this.step(p.move);
      p.resolve();
    }
  }

  // ─── camera drag ───

  private enableDrag(): void {
    let last: { x: number; y: number } | null = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      last = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      this.setCamera({ longitude: this.cam.longitude - dx * 0.5, latitude: Math.max(-85, Math.min(85, this.cam.latitude + dy * 0.5)) });
    });
    const end = () => (last = null);
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Show a replay position: `start` plus the first `applied` moves, with move
 * `active.index` part-way — plug in `positionAt` / `ReplayClock` from
 * @cubecore/timeline without this package depending on it.
 */
export function showPosition(
  renderer: CubeRenderer,
  start: State,
  moves: readonly Move[],
  position: { applied: number; active?: { index: number; progress: number } },
  startSpins: CenterSpins = solvedSpins(),
): void {
  let s = start;
  let spins = startSpins;
  for (let i = 0; i < position.applied; i++) {
    spins = advanceSpins(spins, s, moves[i]);
    s = applyMove(s, moves[i]);
  }
  const active = position.active ? moves[position.active.index] : null;
  renderer.showPartial(s, active, position.active?.progress ?? 0, spins);
}
