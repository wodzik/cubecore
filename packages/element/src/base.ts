/** HTMLElement where there is one; a stand-in elsewhere (SSR, Node, tests) so importing the package doesn't throw. */
export const ElementBase: typeof HTMLElement = typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);
