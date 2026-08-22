export const OROGEN_HEIGHTMAP_EVENT = "world-portal:orogen-heightmap-ready";

export async function sendHeightmapToOrogen(payload) {
  const bridge = window.WorldOrogenAdapter?.sendHeightmap
    ?? window.WorldOrogen?.importHeightmap;
  if (typeof bridge === "function") {
    const result = await bridge({
      ...payload,
      grayscale: new Uint8Array(payload.grayscale),
    });
    return {
      method: "direct-adapter",
      ...(result && typeof result === "object" ? result : {}),
      connected: true,
    };
  }

  window.dispatchEvent(new CustomEvent(OROGEN_HEIGHTMAP_EVENT, {
    detail: {
      ...payload,
      grayscale: new Uint8Array(payload.grayscale),
    },
  }));
  return {
    connected: false,
    method: "event-boundary",
    message: "Heightmap is ready, but the optional World Orogen connector is not installed.",
  };
}
