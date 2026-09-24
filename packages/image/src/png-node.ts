/**
 * Server-side PNG (Node / Bun), via @resvg/resvg-js — an optional dependency:
 * install it only where you render PNGs on a server. Browsers use
 * `svgToPngBlob` instead.
 */

export async function svgToPng(svg: string, width?: number): Promise<Uint8Array> {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, width ? { fitTo: { mode: "width", value: width } } : undefined);
  return resvg.render().asPng();
}
