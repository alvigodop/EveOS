import { presetOptions } from "./evidence-profile.js";

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export const REFINEMENT_INTENT_RANGES = Object.freeze({
  preserveCoastlineCharacter: [0, 1],
  ridgeRetention: [0, 2],
  valleyRetention: [0, 2],
  smoothing: [0, 4],
  coastlineExpansion: [0, 256],
  companionIslandDistance: [0, 1024],
  minimumIntentionalIslandArea: [1, 1_000_000],
  evidenceSupport: [0.05, 1],
  canonicalInfluence: [0, 1],
  evidenceInfluence: [0, 1],
  detailStrength: [0, 2],
  contrast: [0.5, 2],
  coastFloor: [1, 255],
});

function styleId(style) {
  if (style === "feature-preserving") return "feature";
  return ["clean", "hybrid", "feature", "custom"].includes(style) ? style : "hybrid";
}

export function resolveRefinementIntent(request = {}) {
  const style = styleId(request.style || "hybrid");
  const base = presetOptions(style === "custom" ? "hybrid" : style);
  const intent = request.intent || {};
  const character = clamp(intent.preserveCoastlineCharacter, 0, 1, style === "feature" ? 1 : style === "clean" ? 0 : 0.65);
  const preserveIslands = intent.preserveNearbyIslands !== false;
  const removeRemoteNoise = intent.removeRemoteNoise !== false;
  const settings = {
    ...base,
    style: style === "feature" ? "feature" : style,
    coastlineExpansion: Math.round(clamp(
      request.coastlineExpansion ?? intent.coastlineExpansion,
      0, 256, Math.round(base.coastlineExpansion * (0.55 + character * 0.75)),
    )),
    nearbyIslandDistance: preserveIslands
      ? Math.round(clamp(request.nearbyIslandDistance ?? intent.companionIslandDistance, 0, 1024, base.nearbyIslandDistance))
      : 0,
    minimumIslandArea: Math.round(clamp(
      request.minimumIslandArea ?? intent.minimumIntentionalIslandArea,
      1, 1_000_000, removeRemoteNoise ? base.minimumIslandArea : Math.max(1, Math.round(base.minimumIslandArea / 2)),
    )),
    evidenceSupport: clamp(request.evidenceSupport, 0.05, 1, base.evidenceSupport),
    canonicalInfluence: clamp(request.canonicalInfluence, 0, 1, style === "clean" ? 0.9 : style === "feature" ? 0.35 : 0.6),
    evidenceInfluence: clamp(request.evidenceInfluence, 0, 1, base.evidenceInfluence),
    detailStrength: clamp(request.detailStrength, 0, 2, base.detailStrength),
    ridgeRetention: clamp(request.ridgeRetention ?? intent.ridgeRetention, 0, 2, base.ridgeRetention),
    valleyRetention: clamp(request.valleyRetention ?? intent.valleyRetention, 0, 2, base.valleyRetention ?? 0.65),
    smoothing: Math.round(clamp(request.smoothing ?? intent.smoothing, 0, 4, intent.minimizeSmoothing ? 0 : base.smoothing)),
    contrast: clamp(request.contrast, 0.5, 2, base.contrast),
    coastFloor: Math.round(clamp(request.coastFloor, 1, 255, 18)),
    lockCanonicalCoastline: request.lockCanonicalCoastline ?? intent.lockCanonicalCoastline ?? style === "clean",
    allowSupportedCoastlineExpansion: request.allowSupportedCoastlineExpansion
      ?? intent.allowSupportedCoastlineExpansion ?? style !== "clean",
    protectOriginalOceanTexture: request.protectOriginalOceanTexture
      ?? intent.protectOriginalOceanTexture ?? true,
  };
  if (!settings.allowSupportedCoastlineExpansion) settings.coastlineExpansion = 0;
  return {
    style: settings.style,
    intent: {
      preserveNearbyIslands: preserveIslands,
      removeRemoteNoise,
      preserveCoastlineCharacter: character,
      preserveSharpCoastlineBends: intent.preserveSharpCoastlineBends !== false,
      preserveProtrusions: intent.preserveProtrusions !== false,
      retainRidgeContrast: intent.retainRidgeContrast !== false,
      retainValleyDepth: intent.retainValleyDepth !== false,
      protectOriginalOceanTexture: settings.protectOriginalOceanTexture,
    },
    settings,
  };
}

export function refinementIntentManifest() {
  return {
    styles: ["clean", "hybrid", "feature-preserving", "custom"],
    ranges: REFINEMENT_INTENT_RANGES,
    booleans: [
      "preserveNearbyIslands", "removeRemoteNoise", "preserveSharpCoastlineBends",
      "preserveProtrusions", "retainRidgeContrast", "retainValleyDepth",
      "minimizeSmoothing", "lockCanonicalCoastline", "allowSupportedCoastlineExpansion",
      "protectOriginalOceanTexture",
    ],
    rule: "High-level intent is translated into deterministic, range-validated Evidence Assimilation settings before execution.",
  };
}
