import { defineCubePlayer } from "./player";
import { defineCubeScramble } from "./scramble";
import { defineCubeAlg } from "./alg";
import { defineCubeAlgPractice } from "./practice";

export * from "./model";
export * from "./player";
export * from "./scramble";
export * from "./alg";
export * from "./practice";
export * from "./sequence";
export { ICONS, STYLES } from "./styles";

// Importing the package registers <cube-player>, <cube-scramble>, <cube-alg-practice> and <cube-alg>; define*("my-tag") for other names.
if (typeof customElements !== "undefined") {
  defineCubePlayer();
  defineCubeScramble();
  defineCubeAlg();
  defineCubeAlgPractice();
}
