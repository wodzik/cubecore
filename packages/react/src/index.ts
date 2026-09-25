/**
 * React bindings — thin wrappers around the cubecore elements plus hooks for
 * a smart cube and the solver worker. No styling opinions: the elements'
 * CSS variables and ::part() work as usual (className / style pass through).
 *
 *   <CubePlayer alg="R U R' U'" progress segmentLabels onEnded={…} ref={player} />
 *   const cube = useSmartCube();   // cube.connect() / cube.simulate(); cube.state, cube.session
 *   <CubePlayer live={cube.session} autoSkin />
 *   <CubeScramble scramble={moves} source={cube.session} editable onComplete={start} />
 *   <CubeAlgPractice alg="R U R' U R U2 R'" source={cube.session} reveal="done" onComplete={…} />
 *
 * Works with React 18 and 19: attributes are passed as attributes (booleans
 * only when true), objects are set as properties from effects, events are
 * listened to on the element.
 */

import {
  type CSSProperties,
  type ReactNode,
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Mask, Method, Move, State } from "@cubecore/core";
import type {
  BldMessages,
  CubeBld as CubeBldElement,
  CubeAlg as CubeAlgElement,
  CubeAlgPractice as CubeAlgPracticeElement,
  CubePlayer as CubePlayerElement,
  CubeScramble as CubeScrambleElement,
  ArrowTarget,
  LiveSource,
  MoveSource,
  PracticeMessages,
  ScrambleMessages,
} from "@cubecore/element";
import type { SmartCubeSession } from "@cubecore/bluetooth";
import type { Skin } from "@cubecore/skin";
import type { SolverClient } from "@cubecore/solve";
import type { Recording, Segment } from "@cubecore/timeline";
import "@cubecore/element"; // registers the elements (in the browser)

type Handler<T = void> = (detail: T) => void;

/** Listen to element events from an effect; handlers may change every render. */
function useEvents(ref: { current: HTMLElement | null }, handlers: Record<string, Handler<never> | undefined>): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const names = Object.keys(latest.current);
    const listeners = names.map((name) => {
      const l = (e: Event) => latest.current[name]?.((e as CustomEvent).detail as never);
      el.addEventListener(name, l);
      return [name, l] as const;
    });
    return () => listeners.forEach(([name, l]) => el.removeEventListener(name, l));
  }, [ref]);
}

const flag = (on: boolean | undefined) => (on ? "" : undefined);

// ─── <CubePlayer> ───

export interface CubePlayerProps {
  alg?: string;
  setup?: string;
  anchor?: "start" | "end";
  tempo?: number;
  skin?: Skin | string;
  theme?: "light" | "dark" | "auto";
  visualization?: "3d" | "net" | "top" | "iso";
  backView?: "none" | "side-by-side" | "top-right";
  controls?: "default" | "none";
  progress?: boolean;
  markers?: boolean;
  segmentLabels?: boolean;
  tooltips?: boolean;
  maxPause?: number;
  recording?: Recording | null;
  method?: Method | null;
  segments?: Segment[] | null;
  mask?: Mask | null;
  formatSegment?: (s: Segment) => string;
  /** Follow a smart cube live (a SmartCubeSession). */
  live?: LiveSource | null;
  /** With `live`: use the cube's suggested skin. */
  autoSkin?: boolean;
  onTimeUpdate?: Handler<{ time: number; duration: number; applied: number }>;
  onPlay?: Handler;
  onPause?: Handler;
  onEnded?: Handler;
  onSegmentChange?: Handler<{ index: number; segment: Segment }>;
  onError?: Handler<{ message: string }>;
  id?: string;
  className?: string;
  style?: CSSProperties;
  /** e.g. your own controls with slot="controls". */
  children?: ReactNode;
}

export const CubePlayer = forwardRef<CubePlayerElement | null, CubePlayerProps>(function CubePlayer(p, ref) {
  const el = useRef<CubePlayerElement | null>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (el.current) el.current.recording = p.recording ?? null;
  }, [p.recording]);
  useEffect(() => {
    if (el.current) el.current.method = p.method ?? null;
  }, [p.method]);
  useEffect(() => {
    if (el.current && p.segments !== undefined) el.current.segments = p.segments;
  }, [p.segments]);
  useEffect(() => {
    if (el.current) el.current.mask = p.mask ?? null;
  }, [p.mask]);
  useEffect(() => {
    if (el.current && p.skin && typeof p.skin !== "string") el.current.skin = p.skin;
  }, [p.skin]);
  useEffect(() => {
    if (el.current && p.formatSegment) el.current.formatSegment = p.formatSegment;
  }, [p.formatSegment]);
  useEffect(() => {
    if (!el.current || !p.live) return;
    return el.current.attach(p.live, { autoSkin: p.autoSkin });
  }, [p.live, p.autoSkin]);
  useEvents(el, { timeupdate: p.onTimeUpdate, play: p.onPlay, pause: p.onPause, ended: p.onEnded, segmentchange: p.onSegmentChange, error: p.onError } as Record<string, Handler<never> | undefined>);
  return createElement(
    "cube-player",
    {
      ref: el,
      alg: p.alg,
      setup: p.setup,
      anchor: p.anchor,
      tempo: p.tempo,
      skin: typeof p.skin === "string" ? p.skin : undefined,
      theme: p.theme,
      visualization: p.visualization,
      "back-view": p.backView,
      controls: p.controls,
      progress: flag(p.progress),
      markers: flag(p.markers),
      "segment-labels": flag(p.segmentLabels),
      tooltips: p.tooltips === false ? "off" : undefined,
      "max-pause": p.maxPause,
      id: p.id,
      className: p.className,
      style: p.style,
    },
    p.children,
  );
});

// ─── <CubeScramble> ───

export interface CubeScrambleProps {
  scramble: string | readonly Move[];
  /** Follow a smart cube (a SmartCubeSession). */
  source?: MoveSource | null;
  /** Arrows on a player's 3D cube for the next turn (with `player`). */
  arrows?: boolean;
  /** The <CubePlayer> ref the arrows go to. */
  player?: { current: ArrowTarget | null };
  /** "box" (ribbon along the faces, default) or "circle" (an arc). Colours: --cc-arrow, --cc-arrow-undo, --cc-arrow-wrong-way. */
  arrowShape?: "box" | "circle";
  /** Show an input to paste or type your own scramble (fires onChange). */
  editable?: boolean;
  messages?: Partial<ScrambleMessages>;
  onProgress?: Handler<unknown>;
  onComplete?: Handler<unknown>;
  onChange?: Handler<{ moves: Move[]; text: string }>;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export const CubeScramble = forwardRef<CubeScrambleElement | null, CubeScrambleProps>(function CubeScramble(p, ref) {
  const el = useRef<CubeScrambleElement | null>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (!el.current || !p.source) return;
    return el.current.attach(p.source);
  }, [p.source]);
  useEffect(() => {
    if (el.current) el.current.scramble = p.scramble;
  }, [p.scramble]);
  useEffect(() => {
    if (el.current && p.messages) el.current.messages = p.messages;
  }, [p.messages]);
  useEffect(() => {
    if (el.current) el.current.player = p.player?.current ?? null;
  });
  useEvents(el, { progress: p.onProgress, complete: p.onComplete, change: p.onChange } as Record<string, Handler<never> | undefined>);
  return createElement("cube-scramble", { ref: el, editable: p.editable ? "" : undefined, arrows: p.arrows ? "" : undefined, "arrow-shape": p.arrowShape, id: p.id, className: p.className, style: p.style });
});

// ─── <CubeAlgPractice> ───

export interface CubeAlgPracticeProps {
  alg: string | readonly Move[];
  /** Follow a smart cube (a SmartCubeSession); tracking starts from its current state. */
  source?: MoveSource | null;
  /** Arrows on a player's 3D cube for the next turn (with `player`). */
  arrows?: boolean;
  /** The <CubePlayer> ref the arrows go to. */
  player?: { current: ArrowTarget | null };
  /** "box" (ribbon along the faces, default) or "circle" (an arc). Colours: --cc-arrow, --cc-arrow-undo, --cc-arrow-wrong-way. */
  arrowShape?: "box" | "circle";
  /** "all" every move shown, "done" dots until done (default), "none" dots only. */
  reveal?: "all" | "done" | "none";
  /** Show the next move after a slip (default true). */
  hintOnMistake?: boolean;
  /** "none" hides the built-in Hint / Show / Restart buttons. */
  controls?: "none";
  /** Hide the whole built-in view (build your own from onProgress). */
  headless?: boolean;
  messages?: Partial<PracticeMessages>;
  onProgress?: Handler<unknown>;
  onMistake?: Handler<unknown>;
  onComplete?: Handler<unknown>;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export const CubeAlgPractice = forwardRef<CubeAlgPracticeElement | null, CubeAlgPracticeProps>(function CubeAlgPractice(p, ref) {
  const el = useRef<CubeAlgPracticeElement | null>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (!el.current || !p.source) return;
    return el.current.attach(p.source);
  }, [p.source]);
  useEffect(() => {
    if (el.current) el.current.alg = p.alg;
  }, [p.alg]);
  useEffect(() => {
    if (el.current && p.messages) el.current.messages = p.messages;
  }, [p.messages]);
  useEffect(() => {
    if (el.current) el.current.player = p.player?.current ?? null;
  });
  useEvents(el, { progress: p.onProgress, mistake: p.onMistake, complete: p.onComplete } as Record<string, Handler<never> | undefined>);
  return createElement(
    "cube-alg-practice",
    {
      ref: el,
      reveal: p.reveal,
      arrows: p.arrows ? "" : undefined,
      "arrow-shape": p.arrowShape,
      "hint-on-mistake": p.hintOnMistake === false ? "off" : undefined,
      controls: p.controls,
      headless: p.headless ? "" : undefined,
      id: p.id,
      className: p.className,
      style: p.style,
    },
    p.children,
  );
});

// ─── <CubeBld> ───

export interface CubeBldProps {
  /** Follow a smart cube: memo of it as it is now, then its execution letter by letter. */
  source?: MoveSource | null;
  /** "ruwix" (default) or "speffz". */
  scheme?: "ruwix" | "speffz";
  /** How the cube is held, as rotations (e.g. "x2 y'" = yellow top, orange front). */
  rotation?: string;
  /** Letters still to do: "all" shown (default), "done" hidden until done, "none" hidden. */
  reveal?: "all" | "done" | "none";
  headless?: boolean;
  messages?: Partial<BldMessages>;
  onProgress?: Handler<unknown>;
  onLetter?: Handler<unknown>;
  onWrong?: Handler<unknown>;
  onComplete?: Handler<unknown>;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export const CubeBld = forwardRef<CubeBldElement | null, CubeBldProps>(function CubeBld(p, ref) {
  const el = useRef<CubeBldElement | null>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (!el.current || !p.source) return;
    return el.current.attach(p.source);
  }, [p.source]);
  useEffect(() => {
    if (el.current && p.messages) el.current.messages = p.messages;
  }, [p.messages]);
  useEvents(el, { progress: p.onProgress, letter: p.onLetter, wrong: p.onWrong, complete: p.onComplete } as Record<string, Handler<never> | undefined>);
  return createElement(
    "cube-bld",
    { ref: el, scheme: p.scheme, rotation: p.rotation, reveal: p.reveal, headless: p.headless ? "" : undefined, id: p.id, className: p.className, style: p.style },
    p.children,
  );
});

// ─── <CubeAlg> ───

export interface CubeAlgProps {
  /** Id of a <cube-player>, or pass `player`. */
  for?: string;
  player?: { current: CubePlayerElement | null };
  alg?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export const CubeAlg = forwardRef<CubeAlgElement | null, CubeAlgProps>(function CubeAlg(p, ref) {
  const el = useRef<CubeAlgElement | null>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (el.current && p.player?.current) el.current.attach(p.player.current);
  });
  return createElement("cube-alg", { ref: el, for: p.for, alg: p.alg, id: p.id, className: p.className, style: p.style });
});

// ─── hooks ───

export interface SmartCube {
  session: SmartCubeSession | null;
  state: State | null;
  battery: number | null;
  connected: boolean;
  error: string | null;
  /** Ask the browser for a cube (call from a click). */
  connect(): Promise<void>;
  /** A simulated cube (same events) — for development without hardware. */
  simulate(): Promise<void>;
  disconnect(): Promise<void>;
}

/** A smart cube as React state: the session, its state after every move, battery, connection. */
export function useSmartCube(): SmartCube {
  const [session, setSession] = useState<SmartCubeSession | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setState(session.state);
    setBattery(session.battery);
    const offs = [
      session.on("state", (e) => setState(e.state)),
      session.on("battery", (b) => setBattery(b)),
      session.on("disconnect", () => setSession(null)),
    ];
    return () => offs.forEach((off) => off());
  }, [session]);
  useEffect(() => () => void session?.disconnect(), [session]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const { SmartCubeSession } = await import("@cubecore/bluetooth");
      setSession(await SmartCubeSession.connect({ enableAddressSearch: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const simulate = useCallback(async () => {
    const { SimulatedCube, SmartCubeSession } = await import("@cubecore/bluetooth");
    setSession(new SmartCubeSession(new SimulatedCube()));
  }, []);
  const disconnect = useCallback(async () => {
    await session?.disconnect();
    setSession(null);
  }, [session]);

  return { session, state, battery, connected: !!session, error, connect, simulate, disconnect };
}

/** The solver worker for this component's lifetime (null until created, e.g. during SSR). */
export function useSolverWorker(url?: string | URL): SolverClient | null {
  const [client, setClient] = useState<SolverClient | null>(null);
  useEffect(() => {
    let c: SolverClient | null = null;
    let cancelled = false;
    import("@cubecore/solve").then(({ createSolverWorker }) => {
      if (cancelled) return;
      c = createSolverWorker(url);
      setClient(c);
    });
    return () => {
      cancelled = true;
      c?.terminate();
    };
  }, [String(url ?? "")]);
  return client;
}
