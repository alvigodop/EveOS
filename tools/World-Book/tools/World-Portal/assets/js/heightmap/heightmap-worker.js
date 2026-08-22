import { buildLandMask, cleanLandMask, analyzeLandMask } from "./mask-processor.js";
import { generateElevation, analyzeHeightmap } from "./elevation-generator.js";

function progress(id, stage, fraction) {
  self.postMessage({ type: "progress", id, stage, fraction });
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type !== "process") return;
  const { id, rgba, width, height, settings = {} } = message;

  try {
    progress(id, "Detecting ocean", 0.12);
    const detected = buildLandMask(rgba, width, height, settings.mask || {});
    progress(id, "Cleaning land mask", 0.38);
    const mask = cleanLandMask(detected, width, height, settings.cleanup || {});
    progress(id, "Generating elevation", 0.62);
    const heightmap = generateElevation(mask, width, height, settings.elevation || {});
    progress(id, "Validating output", 0.90);
    const maskStats = analyzeLandMask(
      mask, width, height, settings.cleanup?.minimumIslandArea || 100,
    );
    const heightStats = analyzeHeightmap(heightmap, mask);
    const validation = {
      width,
      height,
      aspectRatio: width / Math.max(height, 1),
      ...maskStats,
      ...heightStats,
      orogenReady: width === height * 2 && heightStats.oceanPixelsAboveZero === 0,
    };
    self.postMessage(
      { type: "result", id, width, height, mask, heightmap, validation },
      [mask.buffer, heightmap.buffer],
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      message: error?.message || String(error),
      stack: error?.stack || "",
    });
  }
});
