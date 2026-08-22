import { semanticSelectorManifest } from "./eve-semantic-selectors.js";
import { refinementIntentManifest } from "../refinement/refinement-intent.js";

export const AGENT_PROTOCOL_VERSION = 1;
export const EVE_PROTOCOL_VERSION = AGENT_PROTOCOL_VERSION;
export const AGENT_PLAN_PROTOCOL = "world-portal-agent-plan";
export const LEGACY_EVE_PLAN_PROTOCOL = "world-portal-eve-plan";

const bool = { type: "boolean" };
const string = { type: "string" };
const object = { type: "object" };
const number = (min, max) => ({ type: "number", range: [min, max] });
const integer = (min, max) => ({ type: "integer", range: [min, max] });
const enumeration = (...values) => ({ type: "enum", values });

const forgeParameters = {
  normalizationMode: enumeration("stretch", "crop", "pad"),
  outputResolution: enumeration("2048x1024", "4096x2048", "8192x4096"),
  oceanReferenceColor: { type: "rgb", range: [0, 255] },
  oceanTolerance: number(0, 220), connectedOcean: bool, edgeSeeds: bool, invertMask: bool,
  islandRemovalThreshold: integer(0, 1_000_000), keepLargestLandmass: bool,
  holeFillingThreshold: integer(0, 1_000_000), coastSmoothing: integer(0, 3),
  coastHeight: integer(1, 64), inlandElevation: number(0, 230), coastalFalloff: number(0.2, 3),
  terrainRoughness: number(0, 100), noiseScale: number(2, 128), seed: integer(-2147483648, 2147483647),
};

const finalizationParameters = {
  maskLayerId: string, heightmapLayerId: string,
  outputWidth: integer(2, 65536), outputHeight: integer(1, 32768),
  coastFloor: integer(1, 255), maskThreshold: integer(0, 255),
  strictBinaryMask: bool, requireMatchingLandSupport: bool, confirmBeforeDownload: bool,
};

const refinementParameters = {
  mode: enumeration("union", "intersection", "prefer-a", "prefer-b"),
  tinyThreshold: integer(0, 1_000_000), votes: integer(1, 20),
  sourceWeight: number(0, 1), orogenWeight: number(0, 1),
  interiorDetailRecovery: number(0, 2), smoothing: integer(0, 4), contrast: number(0.5, 2),
  medianPasses: bool, lockCanonicalCoastline: bool, landInfluence: number(0, 1), name: string,
};

const evidenceTrustParameters = {
  status: enumeration("canonical-safe", "provisional", "anomalous-useful", "rejected", "archived"),
  coastline: number(0, 1), height: number(0, 1), climate: number(0, 1), visual: number(0, 1),
  trust: object, notes: string,
};

const evidenceParameters = {
  style: enumeration("clean", "hybrid", "feature", "feature-preserving", "custom"), intent: object,
  coastlineExpansion: integer(0, 256), nearbyIslandDistance: integer(0, 1024),
  companionIslandDistance: integer(0, 1024), minimumIslandArea: integer(1, 1_000_000),
  minimumIntentionalIslandArea: integer(1, 1_000_000), evidenceSupport: number(0.05, 1),
  canonicalInfluence: number(0, 1), evidenceInfluence: number(0, 1), detailStrength: number(0, 2),
  ridgeRetention: number(0, 2), valleyRetention: number(0, 2), smoothing: integer(0, 4),
  contrast: number(0.5, 2), coastFloor: integer(1, 255), coastlineLock: bool,
};

const missionParameters = {
  missionId: string, name: string, missionType: string, idempotencyKey: string,
  accuracyProfile: enumeration("fast", "balanced", "high", "forensic"),
  scope: object, baseline: object, stage: string, status: string, reason: string,
  sessionId: string, candidateSetId: string, candidateId: string, visualLayerId: string,
  styles: { type: "array" }, intent: object, dryRun: bool, repairPrerequisites: bool,
  regenerateCandidates: bool, export: bool, apply: bool,
  outputWidth: integer(2, 65536), outputHeight: integer(1, 32768), coastFloor: integer(1, 255),
  canonicalMaskLayerId: string, canonicalHeightmapLayerId: string,
  maskEvidenceLayerIds: { type: "array" }, heightEvidenceLayerIds: { type: "array" },
  maskEvidenceWeights: { type: "array" }, heightEvidenceWeights: { type: "array" },
};

function capability(description, options = {}) {
  return { risk: "low", confirmation: false, description, ...options };
}

export const EVE_CAPABILITIES = Object.freeze({
  "heightmapForge.setParameters": capability("Set validated Heightmap Forge controls without generating output.", { parameters: forgeParameters, output: "Updated converter settings" }),
  "heightmapForge.regenerateMask": capability("Generate and persist a full-resolution Heightmap Forge mask layer.", { output: "generatedLayerId and generatedMaskLayerId" }),
  "heightmapForge.regenerateElevation": capability("Generate and persist a full-resolution Heightmap Forge heightmap layer.", { output: "generatedLayerId and generatedHeightmapLayerId" }),

  "evidence.setLayerTrust": capability("Set role-specific trust for an evidence layer.", { requiredInputs: ["layerId"], parameters: evidenceTrustParameters, output: "Updated evidence profile" }),
  "evidence.buildFeatureMask": capability("Recover supported coastline character and nearby islands.", { requiredInputs: ["canonicalMaskLayerId"], parameters: evidenceParameters, output: "generatedMaskLayerId" }),
  "evidence.assimilateHeightmaps": capability("Recover Orogen elevation detail inside a trusted coastline.", { requiredInputs: ["canonicalHeightmapLayerId", "maskLayerId"], parameters: evidenceParameters, output: "generatedHeightmapLayerId" }),
  "evidence.clipHeightmapToCanonicalMask": capability("Clip elevation evidence to an accepted mask.", { requiredInputs: ["heightmapLayerId", "maskLayerId"], parameters: evidenceParameters, output: "generatedHeightmapLayerId" }),
  "evidence.extractClimateMetadata": capability("Measure land-scoped climate color evidence without inventing class names.", { requiredInputs: ["layerId"] }),
  "evidence.buildEnvironmentalZones": capability("Create provisional land-scoped color zones.", { requiredInputs: ["layerId"], parameters: { zoneCount: integer(2, 24) } }),
  "evidence.buildNextPass": capability("Build a reversible evidence-assimilated mask and heightmap pair.", { requiredInputs: ["canonicalMaskLayerId", "canonicalHeightmapLayerId"], parameters: evidenceParameters }),
  "evidence.buildCandidates": capability("Build Clean, Hybrid, and Feature-Preserving mission candidates.", { parameters: missionParameters, output: "candidate IDs and persistent layer pairs" }),

  "refinement.selectLayers": capability("Select comparison layers and an optional canonical coastline."),
  "refinement.compareMasks": capability("Compare two mask layers."),
  "refinement.compareHeightmaps": capability("Compare two heightmap layers."),
  "refinement.mergeMasks": capability("Generate a repaired mask from selected masks.", { requiredInputs: ["layerAId", "layerBId"], parameters: refinementParameters }),
  "refinement.generateConsensusMask": capability("Generate a majority-vote mask from several masks.", { parameters: refinementParameters }),
  "refinement.fuseHeightmaps": capability("Fuse elevation sources while optionally locking coastline.", { parameters: refinementParameters }),
  "refinement.synthesizeVisualMap": capability("Blend derived land into a source visual while preserving its ocean.", { requiredInputs: ["sourceVisualLayerId", "derivedVisualLayerId", "canonicalMaskLayerId"], parameters: refinementParameters }),
  "refinement.createPass": capability("Create a refinement lineage record."),
  "refinement.compareCandidates": capability("Compare generated mission candidates.", { parameters: missionParameters }),
  "refinement.selectCandidate": capability("Select a candidate without promoting it.", { requiredInputs: ["candidateId"], parameters: missionParameters }),
  "refinement.promoteCandidate": capability("Promote a selected candidate after confirmation.", { risk: "high", confirmation: true, requiredInputs: ["candidateId"], parameters: missionParameters }),

  "layers.markProvisional": capability("Mark a noncanonical layer provisional.", { requiredInputs: ["layerId"] }),
  "layers.promoteCanonical": capability("Promote a layer after explicit confirmation.", { risk: "high", confirmation: true, requiredInputs: ["layerId"] }),
  "layers.promoteGeneratedOutput": capability("Promote a generated output after explicit confirmation.", { risk: "high", confirmation: true, requiredInputs: ["layerId"] }),
  "layers.setCanonicalVisual": capability("Set the canonical visual layer after confirmation.", { risk: "high", confirmation: true, requiredInputs: ["layerId"] }),
  "layers.setCanonicalMask": capability("Set the canonical mask layer after confirmation.", { risk: "high", confirmation: true, requiredInputs: ["layerId"] }),
  "layers.setCanonicalHeightmap": capability("Set the canonical heightmap after confirmation.", { risk: "high", confirmation: true, requiredInputs: ["layerId"] }),

  "mission.ensure": capability("Recover the active mission or create it once idempotently.", { parameters: missionParameters }),
  "mission.create": capability("Create a generic scoped refinement mission.", { parameters: missionParameters }),
  "mission.attachBaseline": capability("Attach visual, mask, and heightmap baseline layers.", { parameters: missionParameters }),
  "mission.setActive": capability("Set the active refinement mission.", { requiredInputs: ["missionId"], parameters: missionParameters }),
  "mission.setAccuracyProfile": capability("Set mission accuracy and curation strictness.", { parameters: missionParameters }),
  "mission.startPass": capability("Start a new mission pass.", { parameters: missionParameters }),
  "mission.attachOrogenSession": capability("Attach an imported Orogen session to the mission pass.", { requiredInputs: ["sessionId"], parameters: missionParameters }),
  "mission.setStage": capability("Set a validated mission stage.", { parameters: missionParameters }),
  "mission.advance": capability("Advance to the next mission stage.", { parameters: missionParameters }),
  "mission.saveCheckpoint": capability("Save a reversible mission checkpoint.", { parameters: missionParameters }),
  "mission.returnToPreviousAcceptedPass": capability("Restore a prior accepted mission checkpoint.", { risk: "high", confirmation: true, parameters: missionParameters }),
  "mission.completePass": capability("Complete the active mission pass.", { parameters: missionParameters }),
  "mission.repairPrerequisites": capability("Inspect or apply proposed canonical and baseline repairs.", { risk: "high", confirmation: true, parameters: missionParameters }),
  "mission.prepareNextOrogenInput": capability("Orchestrate mission creation, candidate review, finalization, and export.", { parameters: missionParameters, output: "mission, candidate, final layer, and export references" }),

  "orogen.finalizeInput": capability("Finalize a strict support-matched mask and heightmap pair.", { parameters: finalizationParameters }),
  "orogen.exportInputBundle": capability("Export explicitly selected or current canonical Orogen inputs.", { parameters: finalizationParameters }),
  "world.saveCheckpoint": capability("Flush the active world and assets to IndexedDB.", { parameters: { reason: string } }),
});

export function capabilityManifest() {
  return {
    protocol: "world-portal-agent-capabilities",
    legacyProtocol: "world-portal-eve-capabilities",
    version: AGENT_PROTOCOL_VERSION,
    planProtocol: AGENT_PLAN_PROTOCOL,
    supportedPlanProtocols: [AGENT_PLAN_PROTOCOL, LEGACY_EVE_PLAN_PROTOCOL],
    commands: Object.entries(EVE_CAPABILITIES).map(([id, metadata]) => ({ id, ...metadata })),
    semanticSelectors: semanticSelectorManifest(),
    refinementIntent: refinementIntentManifest(),
    resultReferences: {
      string: "$result.<commandId>.<field>",
      object: { fromCommand: "commandId", field: "generatedLayerId" },
    },
    rules: [
      "Commands are declarative and allow-listed for any compatible agent identity.",
      "world-portal-agent-plan is canonical; world-portal-eve-plan remains a legacy-compatible alias.",
      "Semantic selectors resolve during validation and ambiguous selectors stop for review.",
      "Mission creation is idempotent when an idempotency key is supplied.",
      "Candidate selection does not imply canonical promotion.",
      "Plans may pause for review and resume from persisted command results.",
      "Original source layers are never overwritten.",
      "Canonical changes and rollback require human confirmation.",
    ],
  };
}
