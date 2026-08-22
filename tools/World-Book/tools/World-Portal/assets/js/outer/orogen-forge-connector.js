import { OROGEN_HEIGHTMAP_EVENT } from "../heightmap/orogen-adapter.js";

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The Forge heightmap could not be encoded as PNG."));
    }, "image/png");
  });
}

export async function forgeHeightmapToPng(payload) {
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  const grayscale = payload?.grayscale instanceof Uint8Array
    ? payload.grayscale
    : new Uint8Array(payload?.grayscale || []);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width !== height * 2 || grayscale.length !== width * height) {
    throw new Error("Forge → Orogen requires a complete 2:1 grayscale heightmap.");
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; source < grayscale.length; source += 1, target += 4) {
    const value = grayscale[source];
    pixels[target] = value;
    pixels[target + 1] = value;
    pixels[target + 2] = value;
    pixels[target + 3] = 255;
  }
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d", { alpha: false }).putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvasBlob(canvas);
}

export function installOrogenForgeConnector({ getActiveWorld, getWorldGeneration = () => 0, onReceive, onError } = {}) {
  const previous = window.WorldOrogenAdapter;
  let operation = 0;

  async function sendHeightmap(payload) {
    const current = getActiveWorld?.();
    const worldGeneration = getWorldGeneration();
    const worldId = String(payload?.worldId || "");
    if (!current?.id || worldId !== String(current.id)) {
      throw new Error("Forge heightmap world identity does not match the active world.");
    }
    const request = ++operation;
    const blob = await forgeHeightmapToPng(payload);
    const latest = getActiveWorld?.();
    if (request !== operation || String(latest?.id || "") !== worldId
      || getWorldGeneration() !== worldGeneration) {
      throw new Error("The active world changed while the Forge heightmap was being prepared.");
    }
    const result = await onReceive?.({
      ...payload,
      grayscale: new Uint8Array(payload.grayscale),
      blob,
      worldId,
      worldName: String(payload.worldName || latest.name || worldId),
    });
    return { connected: true, method: "world-portal-outer-port", ...(result || {}) };
  }

  const facade = { ...(previous || {}), sendHeightmap };
  window.WorldOrogenAdapter = facade;
  const eventHandler = (event) => sendHeightmap(event.detail).catch((error) => onError?.(error));
  window.addEventListener(OROGEN_HEIGHTMAP_EVENT, eventHandler);

  return {
    sendHeightmap,
    destroy() {
      operation += 1;
      window.removeEventListener(OROGEN_HEIGHTMAP_EVENT, eventHandler);
      if (window.WorldOrogenAdapter === facade) window.WorldOrogenAdapter = previous;
    },
  };
}
