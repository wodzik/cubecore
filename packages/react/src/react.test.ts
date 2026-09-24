import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CubeAlg, CubeAlgPractice, CubePlayer, CubeScramble } from "./index";

describe("React bindings (server render)", () => {
  it("attributes reach the element: flags only when on, tooltips off, dashed names", () => {
    const html = renderToString(createElement(CubePlayer, { alg: "R U R' U'", anchor: "end", progress: true, markers: false, segmentLabels: true, tooltips: false, backView: "top-right", maxPause: 1500, skin: "ganI4", className: "cube" }));
    expect(html).toContain('<cube-player');
    expect(html).toContain('alg="R U R&#x27; U&#x27;"');
    expect(html).toContain('anchor="end"');
    expect(html).toContain('progress=""');
    expect(html).not.toContain("markers");
    expect(html).toContain('segment-labels=""');
    expect(html).toContain('tooltips="off"');
    expect(html).toContain('back-view="top-right"');
    expect(html).toContain('max-pause="1500"');
    expect(html).toContain('skin="ganI4"');
    expect(html).toMatch(/class(Name)?="cube"/);
  });

  it("scramble and alg elements render too", () => {
    expect(renderToString(createElement(CubeScramble, { scramble: "R U" }))).toContain("<cube-scramble");
    expect(renderToString(createElement(CubeAlg, { for: "p" }))).toContain('<cube-alg for="p"');
    expect(renderToString(createElement(CubeScramble, { scramble: "R U", editable: true }))).toContain('editable=""');
    const practice = renderToString(createElement(CubeAlgPractice, { alg: "R U R'", reveal: "none", hintOnMistake: false, controls: "none" }));
    expect(practice).toContain('<cube-alg-practice reveal="none" hint-on-mistake="off" controls="none"');
  });
});
