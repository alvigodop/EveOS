import { ensureLayerAssets, getLayer, upsertLayer } from "../world/world-layer-store.js";
import { downloadBlob, slugify } from "../refinement/image-layer-utils.js";
import { finalizeOrogenInput } from "./orogen-input-finalizer.js";
import { resolveOrogenSource } from "./orogen-source-resolver.js";
import {
  completeExportAudit, failExportAudit, startExportAudit,
} from "./orogen-export-audit.js";

const OROGEN_REPOSITORY = "https://github.com/raguilar011095/planet_heightmap_generation";
const FINALIZER_VERSION = "1.1.0";

function layerFromFinal(record, result, kind, parentLayerIds) {
  const isMask = kind === "mask";
  const blob = isMask ? result.maskBlob : result.heightmapBlob;
  const checksum = isMask ? result.maskChecksum : result.heightmapChecksum;
  const createdAt = new Date().toISOString();
  return upsertLayer(record, {
    id: `${record.id}-orogen-final-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    blob,
    name: `${record.name} finalized Orogen ${isMask ? "mask" : "heightmap"}`,
    type: isMask ? "repaired-mask" : "composite-heightmap",
    category: "derived",
    sourceTool: "World Portal Orogen Finalizer",
    sourceVersion: FINALIZER_VERSION,
    width: result.width,
    height: result.height,
    parentLayerIds,
    status: "generated",
    checksum,
    analysis: result.validation,
    metadata: {
      finalizedOrogenInput: true,
      finalizationSettings: result.settings,
      selectedSourceLayerIds: result.selectedSourceLayerIds,
      selection: result.selection,
      corrections: result.corrections,
      createdAt,
    },
  });
}

function selectionLines(result) {
  const selection = result.selection || {};
  const resolved = selection.resolved || {};
  return [
    `Source: ${resolved.type || "unknown"}`,
    selection.missionId ? `Mission: ${selection.missionName || selection.missionId}` : null,
    selection.missionPassId ? `Mission pass: ${selection.missionPassId}` : null,
    selection.candidateId ? `Candidate: ${selection.candidateLabel || selection.candidateStyle || selection.candidateId}` : null,
    selection.candidateId ? `Candidate ID: ${selection.candidateId}` : null,
    `Mask source: ${resolved.mask?.layerId || result.selectedSourceLayerIds?.maskLayerId}`,
    `Heightmap source: ${resolved.heightmap?.layerId || result.selectedSourceLayerIds?.heightmapLayerId}`,
    `Source land pixels: ${Number(resolved.mask?.landPixelCount || 0).toLocaleString()}`,
    `Source components: ${Number(resolved.mask?.componentCount || 0).toLocaleString()}`,
  ].filter(Boolean);
}

function validationText(result) {
  const report = result.validation;
  return [
    "Final Orogen input validation",
    ...selectionLines(result),
    `${report.width} × ${report.height} · exact 2:1`,
    `Final mask land pixels: ${report.maskLandPixels.toLocaleString()}`,
    `Heightmap nonzero pixels: ${report.heightmapNonzeroPixels.toLocaleString()}`,
    `Support agreement: ${report.supportAgreement ? "exact" : "failed"}`,
    `Mask-only pixels: ${report.maskOnlyPixels}`,
    `Heightmap-only pixels: ${report.heightmapOnlyPixels}`,
    `Ocean elevation pixels: ${report.oceanElevationPixels}`,
    `Land elevation: ${report.minimumLandElevation}–${report.maximumLandElevation}`,
    `Requested coast floor: ${result.selection?.requestedCoastFloor ?? result.settings.coastFloor}`,
    `Applied coast floor: ${result.settings.coastFloor}`,
    `Validation: ${report.valid ? "Orogen Ready" : "FAILED"}`,
  ].join("\n");
}

function buildManifest(record, result, outputLayers, filenames, audit) {
  const selection = result.selection || {};
  const resolved = selection.resolved || {};
  return {
    format: "world-portal-orogen-input",
    version: 3,
    exportedAt: new Date().toISOString(),
    world: { id: record.id, name: record.name },
    sourceRepository: OROGEN_REPOSITORY,
    finalizer: { name: "World Portal Orogen Finalizer", version: FINALIZER_VERSION },
    missionId: selection.missionId || null,
    missionPassId: selection.missionPassId || null,
    selectedCandidateId: selection.candidateId || null,
    selectedCandidateStyle: selection.candidateStyle || null,
    selectedCandidateLabel: selection.candidateLabel || null,
    sourceResolution: {
      requested: selection.requested || null,
      resolved: selection.resolved || null,
      sourceMatch: selection.sourceMatch !== false,
    },
    selectedSourceLayerIds: result.selectedSourceLayerIds,
    candidateSourceMaskId: selection.candidateSource?.maskLayerId || resolved.mask?.layerId || null,
    candidateSourceHeightmapId: selection.candidateSource?.heightmapLayerId || resolved.heightmap?.layerId || null,
    sourceLandPixelCount: Number(resolved.mask?.landPixelCount || 0),
    sourceComponentCount: Number(resolved.mask?.componentCount || 0),
    finalLandPixelCount: result.validation.maskLandPixels,
    generatedOutputLayerIds: {
      maskLayerId: outputLayers.mask.id,
      heightmapLayerId: outputLayers.heightmap.id,
    },
    files: {
      mask: {
        filename: filenames.mask,
        width: result.width,
        height: result.height,
        landPixelCount: result.validation.maskLandPixels,
        sha256: result.maskChecksum,
      },
      heightmap: {
        filename: filenames.heightmap,
        width: result.width,
        height: result.height,
        nonzeroPixelCount: result.validation.heightmapNonzeroPixels,
        sha256: result.heightmapChecksum,
      },
    },
    supportAgreement: {
      exact: result.validation.supportAgreement,
      maskOnlyPixels: result.validation.maskOnlyPixels,
      heightmapOnlyPixels: result.validation.heightmapOnlyPixels,
    },
    requestedCoastFloor: selection.requestedCoastFloor ?? result.settings.coastFloor,
    appliedCoastFloor: result.settings.coastFloor,
    coastFloor: result.settings.coastFloor,
    finalizationSettings: result.settings,
    corrections: result.corrections,
    validation: result.validation,
    exportAuditId: audit?.id || null,
    note: "Checksums are calculated from the exact PNG byte arrays downloaded with this manifest.",
  };
}

function compactSelection(selection) {
  return {
    sourceType: selection.sourceType,
    missionId: selection.mission?.id || null,
    missionName: selection.mission?.name || null,
    missionPassId: selection.pass?.id || null,
    candidateId: selection.candidate?.id || null,
    candidateStyle: selection.candidate?.style || null,
    candidateLabel: selection.candidate?.label || null,
    candidateSource: selection.candidate ? {
      maskLayerId: selection.candidate.maskLayerId,
      heightmapLayerId: selection.candidate.heightmapLayerId,
      landPixelCount: Number(selection.candidate.summary?.landPixels || 0),
      componentCount: Number(selection.candidate.summary?.componentCount || 0),
    } : null,
    requestedCoastFloor: selection.requestedCoastFloor,
    requested: selection.requested,
    resolved: selection.resolved,
    sourceMatch: selection.requested?.mask?.layerId === selection.resolved?.mask?.layerId
      && selection.requested?.heightmap?.layerId === selection.resolved?.heightmap?.layerId,
  };
}

export function createOrogenInputService({ portal, autosave, setStatus }) {
  async function finalize(options = {}, { persist = true, includeBuffers = false } = {}) {
    const record = portal.getActiveRecord();
    const assertCurrent = typeof options.assertCurrent === "function" ? options.assertCurrent : () => {};
    const selected = resolveOrogenSource(record, options);
    const finalOptions = {
      ...options,
      coastFloor: options.coastFloor ?? selected.requestedCoastFloor,
    };
    const result = await finalizeOrogenInput(selected.mask, selected.heightmap, finalOptions);
    assertCurrent();
    result.selection = compactSelection(selected);
    if (!persist) return includeBuffers ? { ...result, sourceLayers: selected } : {
      width: result.width,
      height: result.height,
      settings: result.settings,
      corrections: result.corrections,
      validation: result.validation,
      maskChecksum: result.maskChecksum,
      heightmapChecksum: result.heightmapChecksum,
      selectedSourceLayerIds: result.selectedSourceLayerIds,
      selection: result.selection,
    };
    const maskLayer = layerFromFinal(record, result, "mask", [selected.mask.id, selected.heightmap.id]);
    const heightmapLayer = layerFromFinal(record, result, "heightmap", [maskLayer.id, selected.heightmap.id]);
    const assets = ensureLayerAssets(record);
    assets.orogen = {
      ...(assets.orogen || {}),
      latestFinalizedMaskLayerId: maskLayer.id,
      latestFinalizedHeightmapLayerId: heightmapLayer.id,
      lastFinalization: {
        at: new Date().toISOString(),
        sourceLayerIds: result.selectedSourceLayerIds,
        outputLayerIds: { maskLayerId: maskLayer.id, heightmapLayerId: heightmapLayer.id },
        selection: result.selection,
        settings: result.settings,
        validation: result.validation,
      },
    };
    if (autosave) await autosave.flush("Orogen input finalized");
    assertCurrent();
    const compact = {
      width: result.width,
      height: result.height,
      settings: result.settings,
      corrections: result.corrections,
      validation: result.validation,
      maskChecksum: result.maskChecksum,
      heightmapChecksum: result.heightmapChecksum,
      selectedSourceLayerIds: result.selectedSourceLayerIds,
      selection: result.selection,
      finalMaskLayerId: maskLayer.id,
      finalHeightmapLayerId: heightmapLayer.id,
      generatedLayerIds: [maskLayer.id, heightmapLayer.id],
    };
    return includeBuffers ? { ...result, ...compact, sourceLayers: selected } : compact;
  }

  async function exportBundle(options = {}) {
    const record = portal.getActiveRecord();
    let selection;
    let audit;
    try {
      selection = resolveOrogenSource(record, options);
      audit = startExportAudit(record, selection, options);
      if (!audit.sourceMatch && selection.sourceType !== "explicit-layer-ids") {
        throw new Error("Requested mission candidate and resolved exporter sources do not match.");
      }
      const result = await finalize({
        ...options,
        maskLayerId: selection.mask.id,
        heightmapLayerId: selection.heightmap.id,
        coastFloor: options.coastFloor ?? selection.requestedCoastFloor,
      }, { persist: true, includeBuffers: true });
      const report = validationText(result);
      setStatus?.(report);
      if (options.confirmBeforeDownload !== false && !window.confirm(`${report}\n\nDownload these finalized files?`)) {
        throw new Error("Finalized Orogen input download cancelled by user.");
      }
      const prefix = slugify(portal.getActiveWorld().name);
      const filenames = {
        mask: `${prefix}-final-land-mask-${result.width}x${result.height}.png`,
        heightmap: `${prefix}-final-heightmap-${result.width}x${result.height}.png`,
        manifest: `${prefix}-orogen-input-manifest.json`,
      };
      const outputLayers = {
        mask: getLayer(record, result.finalMaskLayerId),
        heightmap: getLayer(record, result.finalHeightmapLayerId),
      };
      const manifest = buildManifest(record, result, outputLayers, filenames, audit);
      completeExportAudit(audit, result, manifest);
      const finalManifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      downloadBlob(result.maskBlob, filenames.mask);
      window.setTimeout(() => downloadBlob(result.heightmapBlob, filenames.heightmap), 180);
      window.setTimeout(() => downloadBlob(finalManifestBlob, filenames.manifest), 360);
      await autosave?.flush("Orogen export audit saved");
      setStatus?.(`${report}\nDownloads prepared from the selected source pair and re-decoded PNG bytes.`);
      return {
        ...manifest,
        finalMaskLayerId: result.finalMaskLayerId,
        finalHeightmapLayerId: result.finalHeightmapLayerId,
      };
    } catch (error) {
      failExportAudit(audit, error);
      if (audit) await autosave?.flush("Blocked Orogen export audited");
      throw error;
    }
  }

  return {
    finalize,
    exportBundle,
    resolveSelectedLayers: (options) => resolveOrogenSource(portal.getActiveRecord(), options),
  };
}
