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
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CUBIES, FACELETS, type Mask, type Move, type State, colorAt, maskStateAt, solvedState, applyMove } from "@cubecore/core";
import { layerTurn, defaultDuration } from "./layers";
import { SKINS, type Skin, stickerColor } from "./skin";

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

const Z = new Vector3(0, 0, 1);

export class CubeRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private root = new Group(); // gyroscope orientation applies here
  private cubieGroups: Group[] = [];
  private stickerMeshes: Mesh[] = []; // by facelet position
  private hintMeshes: Mesh[] = [];
  private materials = new Map<string, MeshBasicMaterial>();
  private skin: Skin;
  private cam: CameraOptions;
  private state: State = solvedState();
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

  /** Show a state immediately (cancels running and queued animations). */
  setState(state: State): void {
    this.finishAll(false);
    this.state = new Uint8Array(state);
    this.partial = null;
    this.requestRender();
  }

  /** Show `state` with `move` part-way (0..1) — for scrubbing / time-accurate replay. */
  showPartial(state: State, move: Move | null, progress = 0): void {
    this.finishAll(false);
    this.state = new Uint8Array(state);
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
    this.canvas.remove();
  }

  // ─── scene ───

  private material(color: string, hint: boolean, opacity = 1): MeshBasicMaterial {
    const key = `${color}|${hint}|${opacity}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshBasicMaterial({
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
    this.cubieGroups = [];
    this.stickerMeshes = [];
    this.hintMeshes = [];
    const s = this.skin;
    const size = s.cubieSize;
    const bodyGeo = new RoundedBoxGeometry(size, size, size, 3, s.cubieRadius * size);
    const bodyMat = new MeshStandardMaterial({ color: new Color(s.body), roughness: 0.85, metalness: 0 });
    const stickerGeo = roundedSquare(s.stickers.size * size, s.stickers.radius * s.stickers.size * size);

    for (const cubie of CUBIES) {
      const g = new Group();
      const body = new Mesh(bodyGeo, bodyMat);
      body.position.set(...cubie.pos);
      g.add(body);
      for (const fi of cubie.facelets) {
        const f = FACELETS[fi];
        const n = new Vector3(...f.normal);
        const mesh = new Mesh(stickerGeo, this.material("#000000", false));
        mesh.position.set(...f.pos).addScaledVector(n, size / 2 + 0.003);
        mesh.quaternion.setFromUnitVectors(Z, n);
        g.add(mesh);
        this.stickerMeshes[fi] = mesh;
        if (s.hints.enabled) {
          const hint = new Mesh(stickerGeo, this.material("#000000", true));
          hint.position.set(...f.pos).addScaledVector(n, 0.5 + s.hints.distance);
          hint.quaternion.setFromUnitVectors(Z, n);
          g.add(hint);
          this.hintMeshes[fi] = hint;
        }
      }
      this.root.add(g);
      this.cubieGroups.push(g);
    }
    this.renderer.setClearColor(s.background ? new Color(s.background) : new Color(0x000000), s.background ? 1 : 0);
  }

  private paint(): void {
    for (let i = 0; i < this.stickerMeshes.length; i++) {
      const st = this.mask ? maskStateAt(this.mask, this.state, i) : "regular";
      const color = stickerColor(this.skin, colorAt(this.state, i), st);
      const mesh = this.stickerMeshes[i];
      mesh.visible = color !== null;
      if (color) mesh.material = this.material(color, false);
      const hint = this.hintMeshes[i];
      if (hint) {
        hint.visible = color !== null;
        if (color) hint.material = this.material(color, true, st === "regular" || st === "dim" ? this.skin.hints.opacity : this.skin.hints.ignoredOpacity);
      }
    }
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
    const d = this.cam.distance === "auto" ? this.fitDistance() : this.cam.distance;
    this.camera.fov = this.cam.fov;
    this.camera.position.set(d * Math.cos(lat) * Math.sin(lon), d * Math.sin(lat), d * Math.cos(lat) * Math.cos(lon));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Distance at which a sphere around the cube (and its back stickers) fits the narrower field of view, with a margin. */
  private fitDistance(): number {
    const reach = this.skin.hints.enabled ? 1 + 0.5 + this.skin.hints.distance + 0.45 : 0;
    const radius = Math.max(1.5 * Math.sqrt(3), reach) * 1.06;
    const vfov = (this.cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (this.camera?.aspect ?? 1));
    return radius / Math.sin(Math.min(vfov, hfov) / 2);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
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
      this.state = applyMove(this.state, skipped.move);
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
    this.renderer.render(this.scene, this.camera);
    if (again) this.requestRender();
  }

  private completeActive(): void {
    if (!this.active) return;
    this.state = applyMove(this.state, this.active.move);
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
      if (apply) this.state = applyMove(this.state, p.move);
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

function roundedSquare(side: number, radius: number): BufferGeometry {
  const h = side / 2, r = Math.min(radius, h);
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new ShapeGeometry(s, 6);
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
): void {
  let s = start;
  for (let i = 0; i < position.applied; i++) s = applyMove(s, moves[i]);
  const active = position.active ? moves[position.active.index] : null;
  renderer.showPartial(s, active, position.active?.progress ?? 0);
}
