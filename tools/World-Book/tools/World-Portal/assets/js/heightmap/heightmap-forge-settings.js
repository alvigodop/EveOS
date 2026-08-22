export function hexToRgb(value) {
  const normalized = String(value || "#000000").replace("#", "");
  const parsed = Number.parseInt(normalized.padEnd(6, "0").slice(0, 6), 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

export function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => (
    Math.max(0, Math.min(255, value | 0)).toString(16).padStart(2, "0")
  )).join("")}`;
}

export function parseForgeResolution(value) {
  const [width, height] = String(value).split("x").map(Number);
  return { width: width || 4096, height: height || 2048 };
}

export function formatForgePercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

export function setForgeControlValue(control, value) {
  if (!control || value === undefined || value === null) return;
  if (control.type === "checkbox") control.checked = !!value;
  else control.value = String(value);
}
