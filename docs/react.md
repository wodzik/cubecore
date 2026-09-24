# React (`@cubecore/react`)

Thin wrappers around the elements, plus two hooks. No styling of their own:
use the elements' CSS variables and `::part()`; `className` / `style` / `id`
pass through. Works with React 18 and 19, and renders on the server (the
elements register in the browser only).

```tsx
import { CubePlayer, CubeAlg, CubeScramble, useSmartCube, useSolverWorker } from "@cubecore/react";

function Guide() {
  const player = useRef(null);
  return (
    <>
      <CubePlayer ref={player} alg="R U R' U . R U2 R' // Sune" anchor="end" skin="ganI4" progress onEnded={() => …} />
      <CubeAlg player={player} />
    </>
  );
}

function Solve() {
  const cube = useSmartCube();                    // connect() / simulate() / disconnect(); state, battery, session
  const solver = useSolverWorker();               // null until the worker exists
  const [scramble, setScramble] = useState([]);
  return (
    <>
      <button onClick={cube.connect}>Connect</button>
      <button onClick={async () => setScramble((await solver.randomScramble({ from: cube.session.state })).moves)}>Scramble</button>
      <CubeScramble scramble={scramble} source={cube.session} onComplete={startInspection} />
      <CubePlayer live={cube.session} autoSkin method={CFOP} />
    </>
  );
}
```

`<CubePlayer>` props mirror the element (see player.md): `alg`, `setup`,
`anchor`, `tempo`, `skin` (name or object), `theme`, `visualization`,
`backView`, `controls`, `progress`, `markers`, `segmentLabels`, `tooltips`,
`maxPause`, `recording`, `method`, `segments`, `mask`, `formatSegment`,
`live` (+ `autoSkin`), and `onTimeUpdate`, `onPlay`, `onPause`, `onEnded`,
`onSegmentChange`, `onError`. The `ref` is the element (play(), seek()…).
Children go in as they are — e.g. your own controls with `slot="controls"`.

`<CubeScramble>`: `scramble`, `source`, `editable`, `messages`, `onProgress`,
`onComplete`, `onChange` (pasted / typed: `{ moves, text }`).

`<CubeAlgPractice>`: `alg`, `source`, `reveal` (`"all" | "done" | "none"`),
`hintOnMistake`, `controls="none"`, `headless`, `messages`, `onProgress`,
`onMistake`, `onComplete`; children for the slots (see scrambles.md).
