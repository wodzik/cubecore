import { defineCubePlayer } from "./player";

export * from "./model";
export * from "./player";
export { ICONS, STYLES } from "./styles";

// Importing the package registers <cube-player>; call defineCubePlayer("my-tag") for another name.
if (typeof customElements !== "undefined") defineCubePlayer();
