function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

export function finalizeOrogenPixels(maskSource, heightSource, width, height, options = {}) {
  const expected = width * height;
  if (maskSource.length !== expected || heightSource.length !== expected) {
    throw new Error("Finalization buffers do not match the requested dimensions.");
  }
  const coastFloor = Math.max(1, Math.min(255, Math.round(options.coastFloor ?? 8)));
  const maskThreshold = Math.max(0, Math.min(255, Math.round(options.maskThreshold ?? 127)));
  const mask = new Uint8Array(expected);
  const heightmap = new Uint8Array(expected);
  let landPixels = 0;
  let raisedToFloor = 0;
  let removedOutsideMask = 0;
  for (let index = 0; index < expected; index += 1) {
    const land = maskSource[index] > maskThreshold;
    mask[index] = land ? 255 : 0;
    if (!land) {
      if (heightSource[index] > 0) removedOutsideMask += 1;
      heightmap[index] = 0;
      continue;
    }
    landPixels += 1;
    const sourceHeight = clampByte(heightSource[index]);
    if (sourceHeight < coastFloor) raisedToFloor += 1;
    heightmap[index] = Math.max(coastFloor, sourceHeight);
  }
  return {
    mask,
    heightmap,
    settings: {
      coastFloor,
      maskThreshold,
      strictBinaryMask: true,
      requireMatchingLandSupport: options.requireMatchingLandSupport !== false,
    },
    corrections: { raisedToFloor, removedOutsideMask, landPixels },
  };
}

export function validateOrogenPixels(mask, heightmap, width, height, options = {}) {
  const expected = width * height;
  const requestedWidth = Number(options.requestedWidth || width);
  const requestedHeight = Number(options.requestedHeight || height);
  const errors = [];
  if (mask.length !== expected || heightmap.length !== expected) errors.push("Pixel buffers have invalid lengths.");
  if (width !== requestedWidth || height !== requestedHeight) errors.push("Final dimensions do not match the requested resolution.");
  if (width !== height * 2) errors.push("Final dimensions are not exact 2:1 equirectangular dimensions.");
  let maskLandPixels = 0;
  let heightLandPixels = 0;
  let maskOnlyPixels = 0;
  let heightOnlyPixels = 0;
  let nonBinaryMaskPixels = 0;
  let oceanElevationPixels = 0;
  let zeroHeightLandPixels = 0;
  let minimumLandElevation = 255;
  let maximumLandElevation = 0;
  for (let index = 0; index < Math.min(mask.length, heightmap.length); index += 1) {
    const maskValue = mask[index];
    const heightValue = heightmap[index];
    if (maskValue !== 0 && maskValue !== 255) nonBinaryMaskPixels += 1;
    const maskLand = maskValue === 255;
    const heightLand = heightValue > 0;
    if (maskLand) {
      maskLandPixels += 1;
      minimumLandElevation = Math.min(minimumLandElevation, heightValue);
      maximumLandElevation = Math.max(maximumLandElevation, heightValue);
      if (!heightLand) zeroHeightLandPixels += 1;
    } else if (heightValue !== 0) oceanElevationPixels += 1;
    if (heightLand) heightLandPixels += 1;
    if (maskLand && !heightLand) maskOnlyPixels += 1;
    if (!maskLand && heightLand) heightOnlyPixels += 1;
  }
  if (nonBinaryMaskPixels) errors.push("The final mask contains values other than 0 and 255.");
  if (oceanElevationPixels) errors.push("The final heightmap contains elevation outside the mask.");
  if (zeroHeightLandPixels) errors.push("Accepted mask land contains zero-height pixels.");
  if (options.requireMatchingLandSupport !== false && (maskOnlyPixels || heightOnlyPixels)) {
    errors.push("Mask and heightmap land support do not match exactly.");
  }
  return {
    valid: errors.length === 0,
    errors,
    width,
    height,
    aspectRatio: height ? width / height : 0,
    maskLandPixels,
    heightmapNonzeroPixels: heightLandPixels,
    supportAgreement: maskOnlyPixels === 0 && heightOnlyPixels === 0,
    maskOnlyPixels,
    heightmapOnlyPixels: heightOnlyPixels,
    nonBinaryMaskPixels,
    oceanElevationPixels,
    zeroHeightLandPixels,
    minimumLandElevation: maskLandPixels ? minimumLandElevation : 0,
    maximumLandElevation,
  };
}
