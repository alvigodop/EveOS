import * as THREE from "three";

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function drawWrappedEllipse(ctx, width, x, y, rx, ry, angle, alpha) {
  for (const offset of [-width, 0, width]) {
    const gradient = ctx.createRadialGradient(
      x + offset, y, 0,
      x + offset, y, rx
    );
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.45, `rgba(255,255,255,${alpha * 0.72})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x + offset, y, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createCloudTexture(width = 2048, height = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: true });
  const rng = random(0xC10D2026);

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  const layers = [
    { blur: 18, count: 190, rx: [70, 220], ry: [10, 38], alpha: [0.025, 0.075] },
    { blur: 8, count: 260, rx: [24, 100], ry: [5, 22], alpha: [0.018, 0.060] },
    { blur: 3, count: 130, rx: [12, 54], ry: [3, 14], alpha: [0.012, 0.045] },
  ];

  for (const layer of layers) {
    ctx.filter = `blur(${layer.blur}px)`;

    for (let index = 0; index < layer.count; index += 1) {
      const latitudeBias = Math.sin(rng() * Math.PI);
      const x = rng() * width;
      const y = height * (0.08 + latitudeBias * 0.84) + (rng() - 0.5) * 60;
      const rx = layer.rx[0] + rng() * (layer.rx[1] - layer.rx[0]);
      const ry = layer.ry[0] + rng() * (layer.ry[1] - layer.ry[0]);
      const alpha = layer.alpha[0] + rng() * (layer.alpha[1] - layer.alpha[0]);
      const angle = (rng() - 0.5) * 0.65;

      drawWrappedEllipse(ctx, width, x, y, rx, ry, angle, alpha);
    }
  }

  ctx.filter = "none";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
