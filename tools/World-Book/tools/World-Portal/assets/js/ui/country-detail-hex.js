function hash(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function traceHex(context, x, y, radius) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 3 * index - Math.PI / 6;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function terrainColor(sample, noise, latitude, cohesion, tintStrength) {
  if (!sample) {
    const red = 65 + noise * 28 + (1 - latitude) * 18;
    const green = 78 + noise * 24 + latitude * 8;
    const blue = 53 + noise * 16;
    return [red, green, blue].map(Math.round);
  }

  const average = (sample[0] + sample[1] + sample[2]) / 3;
  const cohesionBlend = Math.max(0.35, Math.min(0.96, cohesion));
  const stable = sample.map(
    (channel) => channel * cohesionBlend + average * (1 - cohesionBlend),
  );

  const dryness = Math.max(0, Math.min(1, (sample[0] - sample[1] * 0.92 + 34) / 110));
  const vegetation = [58, 94, 50];
  const dryland = [150, 126, 79];
  const atlas = vegetation.map(
    (channel, index) => channel * (1 - dryness) + dryland[index] * dryness,
  );

  // Keep the overlay consistent with the globe's Land tint strength control,
  // but limit its influence so the NASA texture still carries most detail.
  const tint = Math.max(0, Math.min(1, tintStrength)) * 0.62;
  return stable.map(
    (channel, index) => Math.round(channel * (1 - tint) + atlas[index] * tint),
  );
}

export function drawHexTerrain(context, countryPath, bounds, state, colorAt) {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const density = Math.max(18, Number(state.hexDensity || 54));
  const strength = Math.max(0, Math.min(1, state.hexStrength ?? 1));
  const radius = Math.max(4.5, Math.min(18, width / (density * 0.56)));
  const horizontal = Math.sqrt(3) * radius;
  const vertical = radius * 1.5;
  const borderAlpha = Math.max(0, Math.min(1, state.hexBorderStrength ?? 0.58));
  const cohesion = Math.max(0, Math.min(1, state.hexCohesion ?? 0.72));
  const edgeWidth = Math.max(0.02, Math.min(0.2, state.hexEdgeWidth ?? 0.085));
  const tintStrength = Math.max(0, Math.min(1, state.landTintStrength ?? 0.34));

  context.save();
  context.clip(countryPath, "evenodd");
  let row = 0;
  for (let y = bounds.top - radius; y < bounds.bottom + radius; y += vertical) {
    const offset = row % 2 ? horizontal / 2 : 0;
    let column = 0;
    for (let x = bounds.left - radius + offset; x < bounds.right + radius; x += horizontal) {
      if (!context.isPointInPath(countryPath, x, y, "evenodd")) {
        column += 1;
        continue;
      }
      const noise = hash(column + row * 17, row - column * 3);
      const latitude = 1 - (y - bounds.top) / Math.max(height, 1);
      const color = terrainColor(
        colorAt?.(x, y), noise, latitude, cohesion, tintStrength,
      );
      context.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.42 + strength * 0.58})`;
      traceHex(context, x, y, radius * 0.98);
      context.fill();
      if (borderAlpha > 0.01) {
        context.strokeStyle = `rgba(6,27,31,${(0.15 + borderAlpha * 0.48) * strength})`;
        context.lineWidth = Math.max(0.55, radius * edgeWidth);
        context.stroke();
      }
      column += 1;
    }
    row += 1;
  }
  context.restore();
}
