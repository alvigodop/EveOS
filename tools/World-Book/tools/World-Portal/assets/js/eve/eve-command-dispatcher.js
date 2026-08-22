import {
  getLayer, layerDomain, markLayerCanonical,
} from "../world/world-layer-store.js";
import { setEvidenceProfile } from "../refinement/evidence-profile.js";

function normalizeForgeParameters(parameters = {}) {
  const mask = { ...(parameters.mask || {}) };
  const cleanup = { ...(parameters.cleanup || {}) };
  const elevation = { ...(parameters.elevation || {}) };
  const assign = (target, key, ...aliases) => {
    const match = aliases.find((alias) => parameters[alias] !== undefined);
    if (match) target[key] = parameters[match];
  };
  assign(mask, "oceanColor", "oceanColor", "oceanReferenceColor");
  assign(mask, "tolerance", "oceanTolerance", "tolerance");
  assign(mask, "connectedOnly", "connectedOcean", "connectedOnly");
  assign(mask, "edgeSeeds", "edgeSeeds");
  assign(mask, "invertMask", "invertMask");
  assign(cleanup, "minimumIslandArea", "minimumIslandArea", "islandRemovalThreshold");
  assign(cleanup, "keepLargestLandmass", "keepLargestLandmass");
  assign(cleanup, "maximumHoleArea", "maximumHoleArea", "holeFillingThreshold");
  assign(cleanup, "smoothPasses", "smoothPasses", "coastSmoothing");
  assign(elevation, "coastHeight", "coastHeight", "coastFloor");
  assign(elevation, "inlandStrength", "inlandStrength", "inlandElevation");
  assign(elevation, "falloffExponent", "falloffExponent", "coastalFalloff");
  assign(elevation, "roughness", "roughness", "terrainRoughness");
  assign(elevation, "noiseScale", "noiseScale");
  assign(elevation, "seed", "seed");
  return {
    ...(parameters.normalizationMode !== undefined ? { normalizationMode: parameters.normalizationMode } : {}),
    ...(parameters.resolution !== undefined || parameters.outputResolution !== undefined
      ? { resolution: parameters.resolution || parameters.outputResolution } : {}),
    mask, cleanup, elevation,
  };
}

function requireLayer(record, id) {
  const layer = getLayer(record, id);
  if (!layer) throw new Error(`Layer ${id || "(missing)"} is unavailable.`);
  return layer;
}

async function promoteDomain({ record, sceneApi, portal }, layerId, domain) {
  const layer = requireLayer(record, layerId);
  if (layerDomain(layer.type) !== domain) throw new Error(`${layer.name} is not a ${domain} layer.`);
  markLayerCanonical(record, layer.id);
  if (domain === "visual" && layer.blob instanceof Blob) {
    record.surface.textureBlob = layer.blob;
    record.surface.textureName = layer.filename || layer.name;
    record.surface.width = layer.width;
    record.surface.height = layer.height;
    if (sceneApi) await sceneApi.setWorldSurface(portal.getActiveSurface());
  }
  return { layerId: layer.id, domain };
}

export function createEveCommandDispatcher({
  portal, autosave, heightmapForge, orogenLab, missionOrchestrator, sceneApi,
}) {
  const record = () => portal.getActiveRecord();

  async function execute(capability, inputs = {}, parameters = {}, command = {}) {
    const options = { ...inputs, ...parameters };
    if (capability === "heightmapForge.setParameters") {
      await heightmapForge.open();
      return heightmapForge.applyParameters(normalizeForgeParameters(parameters), { regenerate: false });
    }
    if (capability === "heightmapForge.regenerateMask") {
      await heightmapForge.open();
      return heightmapForge.regenerateMask();
    }
    if (capability === "heightmapForge.regenerateElevation") {
      await heightmapForge.open();
      return heightmapForge.regenerateElevation();
    }
    if (capability === "evidence.setLayerTrust") {
      const layer = requireLayer(record(), inputs.layerId);
      return setEvidenceProfile(layer, {
        status: parameters.status,
        trust: parameters.trust || parameters,
        notes: parameters.notes,
        source: "eve-plan",
      });
    }
    if (capability === "evidence.buildFeatureMask") return orogenLab.commands.buildFeatureMask({ ...options, settings: parameters });
    if (capability === "evidence.assimilateHeightmaps") return orogenLab.commands.assimilateEvidenceHeightmaps({ ...options, settings: parameters });
    if (capability === "evidence.clipHeightmapToCanonicalMask") return orogenLab.commands.clipHeightmapEvidence(options);
    if (capability === "evidence.extractClimateMetadata") return orogenLab.commands.extractClimateMetadata(options);
    if (capability === "evidence.buildEnvironmentalZones") return orogenLab.commands.buildEnvironmentalZones(options);
    if (capability === "evidence.buildNextPass") return orogenLab.commands.buildEvidenceNextPass({ ...options, settings: parameters });
    if (capability === "evidence.buildCandidates") return missionOrchestrator.buildCandidates(options);

    if (["refinement.selectLayers", "refinement.compareMasks", "refinement.compareHeightmaps"].includes(capability)) {
      orogenLab.open();
      return orogenLab.selectLayers({
        layerAId: inputs.layerAId || inputs.sourceLayerId,
        layerBId: inputs.layerBId || inputs.comparisonLayerId,
        coastlineMaskLayerId: inputs.canonicalMaskLayerId,
      });
    }
    if (capability === "refinement.mergeMasks") return orogenLab.commands.mergeMasks(options);
    if (capability === "refinement.generateConsensusMask") return orogenLab.commands.consensusMasks(options);
    if (capability === "refinement.fuseHeightmaps") return orogenLab.commands.fuseHeightmaps(options);
    if (capability === "refinement.synthesizeVisualMap") return orogenLab.commands.synthesizeVisual(options);
    if (capability === "refinement.createPass") return orogenLab.commands.createPass(options);
    if (capability === "refinement.compareCandidates") return missionOrchestrator.compareCandidates(options);
    if (capability === "refinement.selectCandidate") return missionOrchestrator.selectCandidate(options);
    if (capability === "refinement.promoteCandidate") return missionOrchestrator.promoteCandidate(options);

    if (capability === "layers.markProvisional") {
      const layer = requireLayer(record(), inputs.layerId);
      if (layer.isCanonical) throw new Error("A canonical layer cannot be marked provisional until a replacement is promoted.");
      layer.status = "provisional";
      layer.updatedAt = new Date().toISOString();
      return { layerId: layer.id, status: layer.status };
    }
    if (["layers.promoteCanonical", "layers.promoteGeneratedOutput"].includes(capability)) {
      const layer = requireLayer(record(), inputs.layerId);
      if (capability === "layers.promoteGeneratedOutput" && layer.status !== "generated" && !layer.metadata?.generatedOutput) {
        throw new Error(`${layer.name} is not a generated output.`);
      }
      return promoteDomain({ record: record(), sceneApi, portal }, layer.id, layerDomain(layer.type));
    }
    if (capability === "layers.setCanonicalVisual") return promoteDomain({ record: record(), sceneApi, portal }, inputs.layerId, "visual");
    if (capability === "layers.setCanonicalMask") return promoteDomain({ record: record(), sceneApi, portal }, inputs.layerId, "mask");
    if (capability === "layers.setCanonicalHeightmap") return promoteDomain({ record: record(), sceneApi, portal }, inputs.layerId, "heightmap");

    const missionCommands = {
      "mission.ensure": "ensure",
      "mission.create": "create",
      "mission.attachBaseline": "attachBaseline",
      "mission.setActive": "setActive",
      "mission.setAccuracyProfile": "setAccuracy",
      "mission.startPass": "startPass",
      "mission.attachOrogenSession": "attachOrogenSession",
      "mission.setStage": "setStage",
      "mission.advance": "advance",
      "mission.saveCheckpoint": "saveCheckpoint",
      "mission.returnToPreviousAcceptedPass": "rollback",
      "mission.completePass": "completePass",
      "mission.repairPrerequisites": "repairPrerequisites",
      "mission.prepareNextOrogenInput": "prepareNextOrogenInput",
    };
    if (missionCommands[capability]) {
      const method = missionOrchestrator[missionCommands[capability]];
      return method({ ...options, planId: command.planId || command.idempotencyKey });
    }

    if (capability === "orogen.finalizeInput") return orogenLab.finalizeInput(options);
    if (capability === "orogen.exportInputBundle") return orogenLab.exportInputSet(options);
    if (capability === "world.saveCheckpoint") {
      await autosave.flush(parameters.reason || "Eve checkpoint saved");
      return { saved: true, at: new Date().toISOString() };
    }
    throw new Error(`Capability is not implemented in this World Portal version: ${capability}`);
  }

  return { execute };
}
