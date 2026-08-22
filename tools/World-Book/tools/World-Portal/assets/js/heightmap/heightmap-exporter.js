export function canvasToPngBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export could not be created."));
    }, type);
  });
}

function grayscaleCanvas(values, width, height, binary = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  for (let index = 0; index < values.length; index += 1) {
    const value = binary ? (values[index] ? 255 : 0) : values[index];
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function drawGrayscalePreview(canvas, values, width, height, binary = false) {
  const source = grayscaleCanvas(values, width, height, binary);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
}

export async function heightmapToPngBlob(heightmap, width, height) {
  return canvasToPngBlob(grayscaleCanvas(heightmap, width, height, false));
}

export async function maskToPngBlob(mask, width, height) {
  return canvasToPngBlob(grayscaleCanvas(mask, width, height, true));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function slugify(value) {
  return String(value || "world")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "world";
}
