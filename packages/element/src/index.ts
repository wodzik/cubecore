import { defineCubePlayer } from "./player";
import { defineCubeScramble } from "./scramble";

export * from "./model";
export * from "./player";
export * from "./scramble";
export { ICONS, STYLES } from "./styles";

// Importing the package registers <cube-player> and <cube-scramble>; define*("my-tag") for other names.
if (typeof customElements !== "undefined") {
  defineCubePlayer();
  defineCubeScramble();
}
