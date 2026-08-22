function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function sourceBlob(surface) {
  const source = surface?.textureSource ?? surface?.textureBlob ?? surface?.textureUrl;
  if (source instanceof Blob) return source;
  if (!source) throw new Error("The active world does not have a visual map image.");
  const response = await fetch(source);
  if (!response.ok) throw new Error(`World map image unavailable (${response.status}).`);
  return response.blob();
}

function loadHtmlImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("World map image could not be decoded."));
    };
    image.src = url;
  });
}

export async function loadSurfaceImage(surface) {
  const blob = await sourceBlob(surface);
  const image = window.createImageBitmap
    ? await window.createImageBitmap(blob)
    : await loadHtmlImage(blob);
  return {
    image,
    width: image.width || image.naturalWidth,
    height: image.height || image.naturalHeight,
    type: blob.type || surface?.textureType || "image/png",
    name: surface?.textureName || "world-map.png",
    close() {
      image.close?.();
    },
  };
}

function drawCrop(context, image, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceAspect > targetAspect) {
    sw = sourceHeight * targetAspect;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetAspect;
    sy = (sourceHeight - sh) / 2;
  }
  context.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
}

function drawPad(context, image, sourceWidth, sourceHeight, targetWidth, targetHeight, padColor) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (targetWidth - width) / 2;
  const y = (targetHeight - height) / 2;
  context.fillStyle = padColor || "#000000";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, x, y, width, height);
}

export function normalizeImage(source, width, height, mode = "stretch", padColor = "#000000") {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (mode === "crop") {
    drawCrop(context, source.image, source.width, source.height, width, height);
  } else if (mode === "pad") {
    drawPad(context, source.image, source.width, source.height, width, height, padColor);
  } else {
    context.drawImage(source.image, 0, 0, width, height);
  }
  return {
    canvas,
    imageData: context.getImageData(0, 0, width, height),
    width,
    height,
    mode,
  };
}

export function aspectStatus(width, height) {
  const ratio = width / Math.max(height, 1);
  const exact = Math.abs(ratio - 2) < 0.0001;
  return {
    ratio,
    exact,
    message: exact ? "Exact 2:1 equirectangular source" : `Source ratio ${ratio.toFixed(3)}:1 — choose crop, stretch, or pad`,
  };
}
