import { checksumBlob, grayToPngBlob, rgbaToGray } from "../refinement/image-layer-utils.js";
import { finalizeOrogenPixels, validateOrogenPixels } from "./orogen-finalization-core.js";

async function decodeLayer(layer, width, height, smoothing) {
  if (!layer?.blob) throw new Error(`Layer ${layer?.id || "unknown"} has no image data.`);
  const bitmap = await createImageBitmap(layer.blob);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = smoothing;
  context.imageSmoothingQuality = smoothing ? "high" : "low";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return rgbaToGray(context.getImageData(0, 0, width, height).data);
}

async function decodePng(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    width: canvas.width,
    height: canvas.height,
    gray: rgbaToGray(context.getImageData(0, 0, canvas.width, canvas.height).data),
  };
}

function requestedSize(maskLayer, heightmapLayer, options) {
  const width = Number(options.outputWidth || maskLayer.width || heightmapLayer.width || 4096);
  const height = Number(options.outputHeight || maskLayer.height || heightmapLayer.height || width / 2);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 1) {
    throw new Error("Output width and height must be positive integers.");
  }
  if (width !== height * 2) throw new Error("Requested Orogen output must use an exact 2:1 resolution.");
  return { width, height };
}

export async function finalizeOrogenInput(maskLayer, heightmapLayer, options = {}) {
  if (!maskLayer || !heightmapLayer) throw new Error("A mask layer and heightmap layer are required.");
  if ((maskLayer.projection || "equirectangular") !== (heightmapLayer.projection || "equirectangular")) {
    throw new Error("Mask and heightmap projections do not match.");
  }
  if ((maskLayer.projection || "equirectangular") !== "equirectangular") {
    throw new Error("Orogen input finalization currently requires equirectangular layers.");
  }
  const { width, height } = requestedSize(maskLayer, heightmapLayer, options);
  const [maskSource, heightSource] = await Promise.all([
    decodeLayer(maskLayer, width, height, false),
    decodeLayer(heightmapLayer, width, height, true),
  ]);
  const finalized = finalizeOrogenPixels(maskSource, heightSource, width, height, options);
  const validation = validateOrogenPixels(finalized.mask, finalized.heightmap, width, height, {
    requestedWidth: width,
    requestedHeight: height,
    requireMatchingLandSupport: finalized.settings.requireMatchingLandSupport,
  });
  if (!validation.valid) throw new Error(`Orogen input finalization failed: ${validation.errors.join(" ")}`);
  const [maskBlob, heightmapBlob] = await Promise.all([
    grayToPngBlob(finalized.mask, width, height, true),
    grayToPngBlob(finalized.heightmap, width, height, false),
  ]);
  const [decodedMask, decodedHeightmap, maskChecksum, heightmapChecksum] = await Promise.all([
    decodePng(maskBlob),
    decodePng(heightmapBlob),
    checksumBlob(maskBlob),
    checksumBlob(heightmapBlob),
  ]);
  const decodedValidation = validateOrogenPixels(
    decodedMask.gray,
    decodedHeightmap.gray,
    decodedMask.width,
    decodedMask.height,
    {
      requestedWidth: width,
      requestedHeight: height,
      requireMatchingLandSupport: finalized.settings.requireMatchingLandSupport,
    },
  );
  if (decodedHeightmap.width !== width || decodedHeightmap.height !== height) {
    decodedValidation.valid = false;
    decodedValidation.errors.push("The encoded heightmap decoded at an unexpected resolution.");
  }
  if (!decodedValidation.valid) {
    throw new Error(`Encoded Orogen files failed verification: ${decodedValidation.errors.join(" ")}`);
  }
  return {
    width,
    height,
    mask: finalized.mask,
    heightmap: finalized.heightmap,
    maskBlob,
    heightmapBlob,
    maskChecksum,
    heightmapChecksum,
    settings: finalized.settings,
    corrections: finalized.corrections,
    validation: decodedValidation,
    selectedSourceLayerIds: { maskLayerId: maskLayer.id, heightmapLayerId: heightmapLayer.id },
  };
}
