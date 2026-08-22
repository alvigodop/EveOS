import { ensureLayerAssets, layerDomain } from "../world/world-layer-store.js";

export const EVIDENCE_STATUSES = Object.freeze([
  "canonical-safe", "provisional", "anomalous-useful", "rejected", "archived",
]);

export const ASSIMILATION_PRESETS = Object.freeze({
  clean: {
    id: "clean", label: "Clean / Canonical",
    description: "Keep the accepted coastline and terrain conservative; remove detached noise.",
    coastlineExpansion: 0, nearbyIslandDistance: 0, minimumIslandArea: 100,
    evidenceSupport: 0.75, evidenceInfluence: 0.2, detailStrength: 0.2,
    ridgeRetention: 0.35, smoothing: 2, contrast: 1,
  },
  hybrid: {
    id: "hybrid", label: "Hybrid / Balanced",
    description: "Remove remote noise while retaining supported coastline character and nearby islands.",
    coastlineExpansion: 8, nearbyIslandDistance: 48, minimumIslandArea: 20,
    evidenceSupport: 0.45, evidenceInfluence: 0.58, detailStrength: 0.75,
    ridgeRetention: 0.85, smoothing: 1, contrast: 1.06,
  },
  feature: {
    id: "feature", label: "Feature-Preserving",
    description: "Favor expressive coastline details, companion islands, ridges, and local relief.",
    coastlineExpansion: 16, nearbyIslandDistance: 96, minimumIslandArea: 10,
    evidenceSupport: 0.25, evidenceInfluence: 0.72, detailStrength: 1.2,
    ridgeRetention: 1.25, smoothing: 0, contrast: 1.1,
  },
});

const clamp01 = (value, fallback = 0) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : fallback));

function defaultTrust(layer) {
  const domain = layerDomain(layer?.type);
  const result = { coastline: 0, height: 0, climate: 0, visual: 0 };
  if (domain === "mask") result.coastline = layer?.isCanonical ? 1 : 0.75;
  if (domain === "heightmap") result.height = layer?.isCanonical ? 1 : 0.8;
  if (domain === "visual") result.visual = layer?.type === "visual-map" ? 0.9 : 0.82;
  if (layer?.type === "terrain") result.height = 0.3;
  if (layer?.type === "satellite") result.climate = 0.25;
  if (layer?.type === "climate" || layer?.type === "biome" || layer?.type === "classified-regions") {
    result.climate = 0.9; result.visual = 0.25;
  }
  return result;
}

function automaticPenalty(layer, trust) {
  const analysis = layer?.analysis || {};
  const next = { ...trust };
  const landCoverage = Number(analysis.landCoverage);
  if (layerDomain(layer?.type) === "mask" && Number.isFinite(landCoverage) && landCoverage > 0.35) {
    next.coastline = 0;
  }
  const clipped = Number(analysis.clippedPeakShare ?? analysis.exactWhiteShare ?? 0);
  if (layerDomain(layer?.type) === "heightmap" && clipped > 0.05) {
    next.height *= Math.max(0.03, 1 - clipped * 1.15);
  }
  const nearBlack = Number(analysis.nearBlackLand?.share1to8 ?? 0);
  if (layerDomain(layer?.type) === "heightmap" && nearBlack > 0.05) {
    next.height *= Math.max(0.35, 1 - nearBlack * 1.8);
  }
  return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, clamp01(value)]));
}

export function inferEvidenceProfile(layer) {
  const automaticTrust = automaticPenalty(layer, defaultTrust(layer));
  const coverage = Number(layer?.analysis?.landCoverage);
  const clipped = Number(layer?.analysis?.clippedPeakShare ?? 0);
  let status = layer?.isCanonical ? "canonical-safe" : "provisional";
  const reasons = [];
  if (layerDomain(layer?.type) === "mask" && Number.isFinite(coverage) && coverage > 0.35) {
    status = "anomalous-useful";
    reasons.push("Mask coverage is too large to trust as coastline evidence.");
  }
  if (layerDomain(layer?.type) === "heightmap" && clipped > 0.15) {
    status = "anomalous-useful";
    reasons.push("Peak clipping substantially reduces height trust.");
  }
  if (layer?.analysis?.anomalyFlags?.length) reasons.push(...layer.analysis.anomalyFlags);
  return {
    status,
    trust: automaticTrust,
    autoTrust: automaticTrust,
    reasons: [...new Set(reasons)],
    updatedAt: new Date().toISOString(),
    source: "automatic",
  };
}

export function evidenceProfile(layer) {
  const inferred = inferEvidenceProfile(layer);
  const stored = layer?.metadata?.evidenceProfile;
  if (!stored) return inferred;
  return {
    ...inferred, ...stored,
    trust: {
      ...inferred.trust,
      ...(stored.trust || {}),
    },
    autoTrust: inferred.autoTrust,
    reasons: [...new Set([...(inferred.reasons || []), ...(stored.reasons || [])])],
  };
}

export function setEvidenceProfile(layer, update = {}) {
  if (!layer) throw new Error("Choose a layer before editing evidence trust.");
  const current = evidenceProfile(layer);
  const trust = { ...current.trust };
  for (const key of ["coastline", "height", "climate", "visual"]) {
    if (update.trust?.[key] !== undefined) trust[key] = clamp01(update.trust[key]);
  }
  const status = EVIDENCE_STATUSES.includes(update.status) ? update.status : current.status;
  layer.metadata = {
    ...(layer.metadata || {}),
    evidenceProfile: {
      status,
      trust,
      reasons: [...new Set([...(current.reasons || []), ...(update.reasons || [])])],
      notes: String(update.notes ?? current.notes ?? ""),
      source: update.source || "user",
      updatedAt: new Date().toISOString(),
    },
  };
  layer.updatedAt = new Date().toISOString();
  return layer.metadata.evidenceProfile;
}

export function trustedEvidence(record, domain, options = {}) {
  const assets = ensureLayerAssets(record);
  const key = domain === "mask" ? "coastline" : domain === "heightmap" ? "height" : domain;
  const minimumTrust = clamp01(options.minimumTrust, 0.05);
  return assets.layers.filter((layer) => {
    if (layerDomain(layer.type) !== domain) return false;
    if (options.excludeIds?.includes(layer.id)) return false;
    if (options.sessionId && layer.sessionId !== options.sessionId) return false;
    const profile = evidenceProfile(layer);
    if (["rejected", "archived"].includes(profile.status)) return false;
    return Number(profile.trust?.[key] || 0) >= minimumTrust;
  }).map((layer) => ({ layer, profile: evidenceProfile(layer), weight: evidenceProfile(layer).trust[key] }));
}

export function presetOptions(id = "hybrid", overrides = {}) {
  const base = ASSIMILATION_PRESETS[id] || ASSIMILATION_PRESETS.hybrid;
  return { ...base, ...overrides, id: base.id };
}
