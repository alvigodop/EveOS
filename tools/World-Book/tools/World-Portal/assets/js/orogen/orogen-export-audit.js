import { ensureLayerAssets } from "../world/world-layer-store.js";

function uniqueId() {
  return `orogen-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ensureExportAudits(record) {
  const assets = ensureLayerAssets(record);
  if (!assets.orogen || typeof assets.orogen !== "object") assets.orogen = {};
  if (!Array.isArray(assets.orogen.exportAudits)) assets.orogen.exportAudits = [];
  return assets.orogen.exportAudits;
}

export function startExportAudit(record, selection, options = {}) {
  const audit = {
    id: uniqueId(),
    createdAt: new Date().toISOString(),
    status: "pending",
    requestedSource: selection?.requested || null,
    resolvedSource: selection?.resolved || null,
    sourceMatch: selection?.requested?.mask?.layerId === selection?.resolved?.mask?.layerId
      && selection?.requested?.heightmap?.layerId === selection?.resolved?.heightmap?.layerId,
    requestedSettings: {
      outputWidth: options.outputWidth || null,
      outputHeight: options.outputHeight || null,
      coastFloor: options.coastFloor ?? selection?.requestedCoastFloor ?? null,
      strictBinaryMask: options.strictBinaryMask !== false,
      requireMatchingLandSupport: options.requireMatchingLandSupport !== false,
    },
    finalization: null,
    error: null,
  };
  const audits = ensureExportAudits(record);
  audits.push(audit);
  audits.splice(0, Math.max(0, audits.length - 40));
  return audit;
}

export function completeExportAudit(audit, result, manifest = null) {
  Object.assign(audit, {
    status: "completed",
    completedAt: new Date().toISOString(),
    finalization: {
      width: result.width,
      height: result.height,
      sourceLayerIds: result.selectedSourceLayerIds,
      finalLayerIds: {
        maskLayerId: result.finalMaskLayerId || null,
        heightmapLayerId: result.finalHeightmapLayerId || null,
      },
      sourceLandPixelCount: result.selection?.resolved?.mask?.landPixelCount || 0,
      sourceComponentCount: result.selection?.resolved?.mask?.componentCount || 0,
      finalLandPixelCount: result.validation?.maskLandPixels || 0,
      requestedCoastFloor: result.selection?.requestedCoastFloor ?? result.settings?.coastFloor ?? null,
      appliedCoastFloor: result.settings?.coastFloor ?? null,
      validation: result.validation || null,
      checksums: {
        mask: result.maskChecksum || null,
        heightmap: result.heightmapChecksum || null,
      },
    },
    manifestSummary: manifest ? {
      version: manifest.version,
      files: manifest.files,
      selectedCandidateId: manifest.selectedCandidateId || null,
    } : null,
  });
  return audit;
}

export function failExportAudit(audit, error) {
  if (!audit) return null;
  audit.status = "blocked";
  audit.completedAt = new Date().toISOString();
  audit.error = error?.message || String(error);
  return audit;
}

export function latestExportAudit(record) {
  return ensureExportAudits(record).at(-1) || null;
}
