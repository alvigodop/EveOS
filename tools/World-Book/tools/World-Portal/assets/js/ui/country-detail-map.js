import { drawHexTerrain } from "./country-detail-hex.js";

function mapBounds(data) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of data.polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function createProjection(data, width, height) {
  const bounds = mapBounds(data);
  const padding = Math.max(34, Math.min(width, height) * 0.065);
  const spanX = Math.max(bounds.maxX - bounds.minX, 0.001);
  const spanY = Math.max(bounds.maxY - bounds.minY, 0.001);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const usedWidth = spanX * scale;
  const usedHeight = spanY * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;
  return {
    point([longitude, latitude]) {
      return [
        offsetX + (longitude - bounds.minX) * scale,
        offsetY + (bounds.maxY - latitude) * scale,
      ];
    },
    coordinate([x, y]) {
      return [
        bounds.minX + (x - offsetX) / scale,
        bounds.maxY - (y - offsetY) / scale,
      ];
    },
    pixelBounds: {
      left: offsetX, top: offsetY,
      right: offsetX + usedWidth, bottom: offsetY + usedHeight,
    },
  };
}

function traceRing(context, ring, project) {
  ring.forEach((coordinate, index) => {
    const [x, y] = project(coordinate);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function buildPath(data, project) {
  const path = new Path2D();
  for (const polygon of data.polygons) {
    for (const ring of polygon) {
      ring.forEach((coordinate, index) => {
        const [x, y] = project(coordinate);
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    }
  }
  return path;
}

function drawLines(context, lines, project, color, width) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const line of lines) {
    context.beginPath();
    line.forEach((coordinate, index) => {
      const [x, y] = project(coordinate);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  context.restore();
}

function drawPolygons(context, polygons, project, fill, stroke) {
  context.save();
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = 1;
  for (const polygon of polygons) {
    context.beginPath();
    for (const ring of polygon) traceRing(context, ring, project);
    context.fill("evenodd");
    context.stroke();
  }
  context.restore();
}

function niceScale(maximum) {
  const target = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
  for (const step of [5, 2, 1]) {
    if (step * magnitude <= target) return step * magnitude;
  }
  return magnitude;
}

function drawMeasurements(context, data, pixelBounds) {
  const stats = data.stats;
  const scaleKm = niceScale(stats.eastWestSpanKm);
  const scalePixels = (pixelBounds.right - pixelBounds.left) * scaleKm / Math.max(stats.eastWestSpanKm, 1);
  const y = pixelBounds.bottom + 24;
  context.save();
  context.strokeStyle = "rgba(235,247,255,0.9)";
  context.fillStyle = "rgba(235,247,255,0.92)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(pixelBounds.left, y);
  context.lineTo(pixelBounds.left + scalePixels, y);
  context.moveTo(pixelBounds.left, y - 5);
  context.lineTo(pixelBounds.left, y + 5);
  context.moveTo(pixelBounds.left + scalePixels, y - 5);
  context.lineTo(pixelBounds.left + scalePixels, y + 5);
  context.stroke();
  context.font = "700 12px system-ui";
  context.fillText(`${scaleKm.toLocaleString()} km`, pixelBounds.left, y + 18);
  context.fillText(`N–S ${stats.northSouthSpanKm.toLocaleString()} km`, pixelBounds.right - 132, pixelBounds.top - 10);
  context.restore();
}

export function createCountryDetailMap(canvas, state) {
  const context = canvas.getContext("2d");
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 1024;
  sampleCanvas.height = 512;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const texture = new Image();
  let texturePixels = null;
  let revision = 0;

  texture.addEventListener("load", () => {
    sampleContext.drawImage(texture, 0, 0, sampleCanvas.width, sampleCanvas.height);
    texturePixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    revision += 1;
  });
  texture.src = "assets/textures/earth-blue-marble.png";

  function sampleTexture(longitude, latitude) {
    if (!texturePixels) return null;
    const wrapped = ((longitude + 180) % 360 + 360) % 360;
    const x = Math.min(sampleCanvas.width - 1, Math.floor(wrapped / 360 * sampleCanvas.width));
    const y = Math.min(sampleCanvas.height - 1, Math.max(0, Math.floor((90 - latitude) / 180 * sampleCanvas.height)));
    const index = (y * sampleCanvas.width + x) * 4;
    return [texturePixels[index], texturePixels[index + 1], texturePixels[index + 2]];
  }

  function render(data, options) {
    const rectangle = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rectangle.width * ratio));
    const height = Math.max(260, Math.round(rectangle.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cssWidth = width / ratio;
    const cssHeight = height / ratio;
    const projection = createProjection(data, cssWidth, cssHeight);
    const shapePath = buildPath(data, projection.point);

    const gradient = context.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, "#071b3c");
    gradient.addColorStop(1, "#020b1b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, cssWidth, cssHeight);

    context.fillStyle = "#343d2c";
    context.fill(shapePath, "evenodd");
    if (options.hexVisible && (state.hexStrength ?? 1) > 0.01) {
      drawHexTerrain(
        context, shapePath, projection.pixelBounds, state,
        (x, y) => sampleTexture(...projection.coordinate([x, y])),
      );
    }
    if (options.lakesVisible) {
      drawPolygons(context, data.lakes, projection.point, "rgba(55,170,236,0.88)", "rgba(169,229,255,0.8)");
    }
    if (options.riversVisible) {
      drawLines(context, data.rivers, projection.point, "rgba(76,195,255,0.92)", 1.45);
    }
    context.strokeStyle = "rgba(220,241,255,0.95)";
    context.lineWidth = 1.8;
    context.stroke(shapePath);
    drawMeasurements(context, data, projection.pixelBounds);
  }

  return {
    render,
    get revision() { return revision; },
  };
}
