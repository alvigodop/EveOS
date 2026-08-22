export async function readImageBlob(blob, targetWidth = 0, targetHeight = 0) {
  if (!(blob instanceof Blob)) throw new Error("Layer image data is unavailable.");
  const bitmap = await createImageBitmap(blob);
  const width = targetWidth || bitmap.width;
  const height = targetHeight || bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, rgba: context.getImageData(0, 0, width, height).data, canvas };
}

export function rgbaToGray(rgba) {
  const gray = new Uint8Array(rgba.length / 4);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = Math.round(
      rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114,
    );
  }
  return gray;
}

export function grayToImageData(gray, width, height, binary = false) {
  const image = new ImageData(width, height);
  for (let index = 0; index < gray.length; index += 1) {
    const value = binary ? (gray[index] ? 255 : 0) : gray[index];
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  return image;
}

export function drawImageData(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
}

export function drawBlob(canvas, blob) {
  return readImageBlob(blob).then((image) => {
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image.canvas, 0, 0);
    return image;
  });
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding failed.")), type);
  });
}

export function grayToPngBlob(gray, width, height, binary = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(grayToImageData(gray, width, height, binary), 0, 0);
  return canvasToBlob(canvas);
}

export function rgbaToPngBlob(rgba, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvasToBlob(canvas);
}

export async function checksumBlob(blob) {
  if (!crypto?.subtle) return null;
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function slugify(value) {
  return String(value || "world").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "world";
}
