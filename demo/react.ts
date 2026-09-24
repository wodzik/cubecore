import "./nav";
import { createElement as h, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CFOP } from "../packages/cfop/src/index";
import type { CubePlayer as CubePlayerElement } from "../packages/element/src/index";
import { CubeAlg, CubePlayer, CubeScramble, useSmartCube, useSolverWorker } from "../packages/react/src/index";
import type { Move } from "../packages/core/src/index";

function Guide() {
  const player = useRef<CubePlayerElement | null>(null);
  const [ended, setEnded] = useState(0);
  return h(
    "section",
    null,
    h("strong", null, "A guide"),
    h(CubePlayer, { ref: player, id: "guide", alg: "R U R' U . R U2 R' // Sune", anchor: "end", tempo: 2, skin: "ganI4", progress: true, onEnded: () => setEnded((n) => n + 1) }),
    h(CubeAlg, { player }),
    h("p", null, `ended ${ended}×`),
  );
}

function Live() {
  const cube = useSmartCube();
  const solver = useSolverWorker("/solver-worker.js"); // the demo server builds the worker (see serve.ts)
  const [scramble, setScramble] = useState<Move[]>([]);
  const [done, setDone] = useState(false);
  return h(
    "section",
    null,
    h("strong", null, "A smart cube"),
    h(
      "div",
      { style: { display: "flex", gap: 8 } },
      h("button", { onClick: cube.connect, disabled: cube.connected }, "Connect"),
      h("button", { id: "sim", onClick: cube.simulate, disabled: cube.connected }, "Simulated"),
      h(
        "button",
        {
          id: "newScramble",
          disabled: !cube.session || !solver,
          onClick: async () => {
            setDone(false);
            const r = await solver!.randomScramble({ from: cube.session!.state });
            setScramble(r.moves);
          },
        },
        "New scramble",
      ),
    ),
    h(CubePlayer, { live: cube.session, autoSkin: true, method: CFOP }),
    cube.session && scramble.length ? h(CubeScramble, { scramble, source: cube.session, onComplete: () => setDone(true) }) : null,
    h("p", { id: "liveInfo" }, cube.session ? `${cube.session.info.name} · battery ${cube.battery ?? "?"}%${done ? " · scrambled ✓" : ""}` : cube.error ?? "Not connected"),
  );
}

createRoot(document.getElementById("app")!).render(h("div", { style: { display: "contents" } }, h(Guide), h(Live)));
