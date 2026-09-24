import { defineCubePlayer } from "./player";
import { defineCubeScramble } from "./scramble";
import { defineCubeAlg } from "./alg";

export * from "./model";
export * from "./player";
export * from "./scramble";
export * from "./alg";
export { ICONS, STYLES } from "./styles";

// Importing the package registers <cube-player>, <cube-scramble> and <cube-alg>; define*("my-tag") for other names.
if (typeof customElements !== "undefined") {
  defineCubePlayer();
  defineCubeScramble();
  defineCubeAlg();
}
