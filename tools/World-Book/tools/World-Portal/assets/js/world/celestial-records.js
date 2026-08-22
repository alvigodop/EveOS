const KINDS = new Set(["moon", "asteroid", "ice", "gas", "ring"]);

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function color(value, fallback) {
  const source = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(source) ? source : fallback;
}

function slugify(value) {
  return String(value || "body").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "body";
}

export function createDefaultCelestialBodies() {
  return [{
    id: "moon",
    name: "Moon",
    kind: "moon",
    radius: 0.22,
    orbitRadius: 2.2,
    orbitSpeed: 0.32,
    inclination: 5.1,
    phase: 0,
    bobAmplitude: 0.07,
    color: "#e8edf5",
    visible: true,
  }];
}

export function normalizeCelestialBody(source, index = 0) {
  const kind = KINDS.has(source?.kind) ? source.kind : "moon";
  const fallbackColor = {
    moon: "#e8edf5", asteroid: "#9b8b78", ice: "#bcecff",
    gas: "#d7ad7b", ring: "#c9b78c",
  }[kind];
  const name = String(source?.name || `${kind} ${index + 1}`).trim();
  return {
    id: String(source?.id || `${slugify(name)}-${index + 1}`),
    name,
    kind,
    radius: clamp(source?.radius, 0.02, 0.8, kind === "ring" ? 0.025 : 0.16),
    orbitRadius: clamp(source?.orbitRadius, 1.5, 6.5, kind === "ring" ? 1.75 : 2.2),
    orbitSpeed: clamp(source?.orbitSpeed, -2, 2, kind === "ring" ? 0 : 0.25),
    inclination: clamp(source?.inclination, -90, 90, kind === "ring" ? 18 : 8),
    phase: clamp(source?.phase, -360, 360, index * 62),
    bobAmplitude: clamp(source?.bobAmplitude, 0, 0.4, kind === "ring" ? 0 : 0.04),
    color: color(source?.color, fallbackColor),
    visible: source?.visible !== false,
  };
}

export function normalizeCelestialBodies(source, withDefault = true) {
  const list = Array.isArray(source) ? source : [];
  const normalized = list.map(normalizeCelestialBody);
  return normalized.length || !withDefault ? normalized : createDefaultCelestialBodies();
}

export function createCelestialBody(kind = "moon", index = 0) {
  return normalizeCelestialBody({
    id: `${kind}-${Date.now().toString(36)}`,
    name: `${kind === "ring" ? "Orbital ring" : kind[0].toUpperCase() + kind.slice(1)} ${index + 1}`,
    kind,
    phase: index * 47,
  }, index);
}
