import { createRefinementPass, getCanonicalLayer, getLayer, layerDomain } from "../world/world-layer-store.js";
import {
  ASSIMILATION_PRESETS, evidenceProfile, presetOptions, setEvidenceProfile, trustedEvidence,
} from "./evidence-profile.js";

const number = (control, fallback) => Number.isFinite(Number(control?.value)) ? Number(control.value) : fallback;

export function createEvidenceAssimilationController(options) {
  const {
    portal, view, engine, commands, autosave, runTask, setCandidate, setStatus,
    getActiveSessionId, refreshLab, renderComparison,
  } = options;
  const record = () => portal.getActiveRecord();
  const layer = (id) => getLayer(record(), id);

  function selectedEvidenceLayer() {
    return layer(view.compareB.value) || layer(view.compareA.value);
  }

  function applyPreset(id = view.evidenceStyle.value) {
    const preset = presetOptions(id);
    view.evidenceStyle.value = preset.id;
    view.evidenceCoastlineExpansion.value = preset.coastlineExpansion;
    view.evidenceIslandDistance.value = preset.nearbyIslandDistance;
    view.evidenceIslandArea.value = preset.minimumIslandArea;
    view.evidenceSupport.value = preset.evidenceSupport;
    view.evidenceHeightInfluence.value = preset.evidenceInfluence;
    view.evidenceDetailStrength.value = preset.detailStrength;
    view.evidenceRidgeRetention.value = preset.ridgeRetention;
    view.evidenceSmoothing.value = preset.smoothing;
    view.evidenceContrast.value = preset.contrast;
    view.evidencePresetNote.textContent = preset.description;
    return preset;
  }

  function settings() {
    return presetOptions(view.evidenceStyle.value, {
      coastlineExpansion: number(view.evidenceCoastlineExpansion, 8),
      nearbyIslandDistance: number(view.evidenceIslandDistance, 48),
      minimumIslandArea: number(view.evidenceIslandArea, 20),
      evidenceSupport: number(view.evidenceSupport, 0.45),
      evidenceInfluence: number(view.evidenceHeightInfluence, 0.58),
      detailStrength: number(view.evidenceDetailStrength, 0.75),
      ridgeRetention: number(view.evidenceRidgeRetention, 0.85),
      valleyRetention: number(view.evidenceValleyRetention, 0.65),
      smoothing: number(view.evidenceSmoothing, 1),
      contrast: number(view.evidenceContrast, 1.06),
      coastFloor: 18,
    });
  }

  function profileEntries(domain, excludeIds = []) {
    const scope = view.evidenceScope.value;
    if (scope === "layer-b") {
      const selected = layer(view.compareB.value);
      if (!selected || layerDomain(selected.type) !== domain || excludeIds.includes(selected.id)) return [];
      const profile = evidenceProfile(selected);
      const key = domain === "mask" ? "coastline" : domain === "heightmap" ? "height" : domain;
      return ["rejected", "archived"].includes(profile.status) || !profile.trust?.[key]
        ? [] : [{ layer: selected, profile, weight: profile.trust[key] }];
    }
    const sessionId = scope === "session" ? getActiveSessionId() || null : null;
    if (scope === "session" && !sessionId) return [];
    return trustedEvidence(record(), domain, {
      sessionId, excludeIds, minimumTrust: 0.03,
    });
  }

  function updateProfileControls() {
    const selected = selectedEvidenceLayer();
    if (!selected) return;
    const profile = evidenceProfile(selected);
    view.evidenceStatus.value = profile.status;
    view.evidenceCoastlineTrust.value = profile.trust.coastline;
    view.evidenceHeightTrust.value = profile.trust.height;
    view.evidenceVisualTrust.value = profile.trust.visual;
    view.evidenceClimateTrust.value = profile.trust.climate;
  }

  async function saveProfile() {
    const selected = selectedEvidenceLayer();
    if (!selected) throw new Error("Choose an evidence layer in Layer B or Layer A.");
    setEvidenceProfile(selected, {
      status: view.evidenceStatus.value,
      trust: {
        coastline: number(view.evidenceCoastlineTrust, 0),
        height: number(view.evidenceHeightTrust, 0),
        visual: number(view.evidenceVisualTrust, 0),
        climate: number(view.evidenceClimateTrust, 0),
      },
      source: "user",
    });
    await autosave.flush("Evidence trust updated");
    setStatus(`${selected.name} evidence trust saved.`);
    refreshLab();
  }

  async function buildMaskCandidate() {
    const canonical = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    if (!canonical) throw new Error("Choose or create a canonical coastline mask.");
    const evidence = profileEntries("mask", [canonical.id]);
    if (!evidence.length && view.evidenceStyle.value !== "clean") throw new Error("No trusted coastline evidence is available in the selected scope.");
    const result = await engine.buildFeatureMask(canonical, evidence, settings());
    setCandidate(result, `${portal.getActiveWorld().name} ${view.evidenceStyle.value} character mask`, [canonical.id, ...evidence.map((item) => item.layer.id)], "evidence-feature-mask");
    return result;
  }

  async function buildHeightCandidate() {
    const source = getCanonicalLayer(record(), "heightmap");
    const mask = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    if (!source || !mask) throw new Error("Canonical mask and heightmap are required.");
    const evidence = profileEntries("heightmap", [source.id]);
    if (!evidence.length && view.evidenceStyle.value !== "clean") throw new Error("No trusted height evidence is available in the selected scope.");
    const result = await engine.assimilateHeightEvidence(source, evidence, mask, settings());
    setCandidate(result, `${portal.getActiveWorld().name} evidence-assimilated heightmap`, [source.id, mask.id, ...evidence.map((item) => item.layer.id)], "evidence-height-assimilation");
    return result;
  }

  async function clipSelectedHeightmap() {
    const height = layer(view.compareB.value) || layer(view.compareA.value);
    const mask = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    if (!height || layerDomain(height.type) !== "heightmap") throw new Error("Choose an Orogen heightmap in Layer B or Layer A.");
    if (!mask) throw new Error("Choose a canonical coastline mask.");
    const result = await engine.clipHeightmapToMask(height, mask, { coastFloor: 18 });
    setCandidate(result, `${height.name} clipped to canonical land`, [height.id, mask.id], "clip-height-evidence");
    return result;
  }

  async function extractClimateMetadata() {
    const selected = selectedEvidenceLayer();
    if (!selected || !["climate", "biome", "classified-regions"].includes(selected.type)) {
      throw new Error("Choose a climate, biome, or classified layer.");
    }
    const mask = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    selected.metadata = {
      ...(selected.metadata || {}),
      climateEvidence: await engine.extractClimateMetadata(selected, mask),
    };
    selected.updatedAt = new Date().toISOString();
    await autosave.flush("Climate palette evidence extracted");
    setStatus(`${selected.name} now carries land-scoped palette and latitude-band evidence.`);
    refreshLab();
  }

  async function buildEnvironmentalZones() {
    const selected = selectedEvidenceLayer();
    if (!selected || !["climate", "biome", "classified-regions"].includes(selected.type)) {
      throw new Error("Choose a climate, biome, or classified layer.");
    }
    const mask = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    const result = await engine.buildEnvironmentalZones(selected, mask, { zoneCount: 10 });
    setCandidate(result, `${selected.name} provisional environmental zones`, [selected.id, ...(mask ? [mask.id] : [])], "environmental-zone-extraction");
    return result;
  }

  async function buildLandOnlyVisual() {
    const source = getCanonicalLayer(record(), "visual");
    const selected = selectedEvidenceLayer();
    const mask = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    if (!source || !mask) throw new Error("Canonical visual map and coastline mask are required.");
    if (!selected || layerDomain(selected.type) !== "visual") throw new Error("Choose a satellite, terrain, or visual evidence layer.");
    const profile = evidenceProfile(selected);
    const result = await commands.synthesizeVisual({
      sourceVisualLayerId: source.id, derivedVisualLayerId: selected.id, canonicalMaskLayerId: mask.id,
      landInfluence: Math.max(0, Math.min(1, Number(profile.trust.visual || 0.75))),
      sessionId: getActiveSessionId() || null,
      name: `${portal.getActiveWorld().name} land-only evidence synthesis`,
    });
    setStatus(`Land-only visual synthesis saved as ${result.generatedVisualLayerId}; the original ocean remains unchanged.`);
    refreshLab();
    return result;
  }

  async function buildNextPass() {
    const canonicalMask = layer(view.coastlineMask.value) || getCanonicalLayer(record(), "mask");
    const canonicalHeight = getCanonicalLayer(record(), "heightmap");
    if (!canonicalMask || !canonicalHeight) throw new Error("Canonical mask and heightmap are required.");
    const maskEvidence = profileEntries("mask", [canonicalMask.id]);
    const heightEvidence = profileEntries("heightmap", [canonicalHeight.id]);
    const result = await commands.buildEvidenceNextPass({
      canonicalMaskLayerId: canonicalMask.id,
      canonicalHeightmapLayerId: canonicalHeight.id,
      maskEvidenceLayerIds: maskEvidence.map((item) => item.layer.id),
      maskEvidenceWeights: maskEvidence.map((item) => item.weight),
      heightEvidenceLayerIds: heightEvidence.map((item) => item.layer.id),
      heightEvidenceWeights: heightEvidence.map((item) => item.weight),
      settings: settings(), sessionId: getActiveSessionId() || null,
    });
    refreshLab();
    view.compareA.value = result.generatedMaskLayerId;
    view.compareB.value = result.generatedHeightmapLayerId;
    view.coastlineMask.value = result.generatedMaskLayerId;
    await renderComparison();
    setStatus(`Refined next-pass pair created as ${result.refinementPassId}. Review before canonical promotion or export.`);
    return result;
  }

  view.evidenceStyle.addEventListener("change", () => applyPreset(view.evidenceStyle.value));
  view.saveEvidenceProfile.addEventListener("click", () => runTask("Saving evidence trust…", saveProfile));
  view.buildFeatureMask.addEventListener("click", () => runTask("Recovering coastline character…", buildMaskCandidate));
  view.buildEvidenceHeightmap.addEventListener("click", () => runTask("Assimilating interior terrain evidence…", buildHeightCandidate));
  view.clipEvidenceHeightmap.addEventListener("click", () => runTask("Clipping height evidence to canonical land…", clipSelectedHeightmap));
  view.extractClimateEvidence.addEventListener("click", () => runTask("Extracting climate palette evidence…", extractClimateMetadata));
  view.buildEnvironmentalZones.addEventListener("click", () => runTask("Building provisional environmental zones…", buildEnvironmentalZones));
  view.buildLandOnlyVisual.addEventListener("click", () => runTask("Synthesizing land-only visual evidence…", buildLandOnlyVisual));
  view.buildEvidenceNextPass.addEventListener("click", () => runTask("Building canonical-plus-evidence next pass…", buildNextPass));
  for (const control of [view.compareA, view.compareB]) control.addEventListener("change", updateProfileControls);
  applyPreset("hybrid");
  updateProfileControls();

  return {
    refresh: updateProfileControls,
    getContextState() {
      return {
        style: view.evidenceStyle.value, scope: view.evidenceScope.value,
        settings: settings(), selectedEvidenceLayerId: selectedEvidenceLayer()?.id || null,
      };
    },
    buildNextPass,
  };
}
