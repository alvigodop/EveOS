import { capabilityManifest } from "../eve/eve-capabilities.js";
import { refinementIntentManifest } from "../refinement/refinement-intent.js";

export const WORLD_PORTAL_VERSION = "0.20.0";
export const AGENT_SKILL_ID = "world-portal-refinement";
export const AGENT_SKILL_VERSION = 1;
export const AGENT_PLAN_PROTOCOL = "world-portal-agent-plan";
export const AGENT_PLAN_PROTOCOL_VERSION = 1;
export const LEGACY_EVE_PLAN_PROTOCOL = "world-portal-eve-plan";

const STATIC_FILES = Object.freeze([
  "SKILL.md", "PLAN-AUTHORING.md", "WORLD-MODEL.md", "EVIDENCE-RULES.md",
  "MISSION-WORKFLOW.md", "SAFETY.md", "GLOSSARY.md",
  "schemas/agent-plan.schema.json", "schemas/eve-briefing.schema.json",
  "schemas/skill-manifest.schema.json", "examples/create-mission.json",
  "examples/generate-candidates.json", "examples/refine-heightmap.json",
  "examples/orogen-loop.json", "examples/repair-export.json",
  "examples/repair-canonical-visual.json",
]);

export const AGENT_DIAGNOSTIC_CHECKLIST = Object.freeze([
  "Does a refinement mission exist?",
  "Is the canonical visual actually a visual layer?",
  "Is the canonical mask present and binary?",
  "Does elevation exist outside accepted land?",
  "Do canonical mask and heightmap support match?",
  "Do baseline dimensions and projection agree?",
  "Are there newer candidates, and is one selected?",
  "Is an agent execution paused for review?",
  "Are there anomalous Orogen runs?",
  "Which layers have useful coastline, elevation, visual, and climate trust?",
  "Did the previous export use the requested candidate pair?",
  "Is the requested result conservative, expressive, or mixed?",
]);

export const CAPABILITY_INTENT_MAP = Object.freeze([
  { intent: "preserve coastline character", capabilities: ["evidence.buildFeatureMask", "evidence.buildNextPass", "evidence.buildCandidates"], parameters: ["coastlineExpansion", "companionIslandDistance", "minimumIntentionalIslandArea", "evidenceSupport"] },
  { intent: "remove remote noise", capabilities: ["evidence.buildFeatureMask", "refinement.mergeMasks", "refinement.generateConsensusMask"], parameters: ["minimumIntentionalIslandArea", "evidenceSupport", "tinyThreshold"] },
  { intent: "preserve nearby islands", capabilities: ["evidence.buildFeatureMask", "evidence.buildCandidates"], parameters: ["companionIslandDistance", "minimumIntentionalIslandArea", "evidenceSupport"] },
  { intent: "increase relief", capabilities: ["evidence.assimilateHeightmaps", "refinement.fuseHeightmaps"], parameters: ["evidenceInfluence", "detailStrength", "contrast"] },
  { intent: "recover ridges", capabilities: ["evidence.assimilateHeightmaps", "evidence.buildNextPass"], parameters: ["detailStrength", "ridgeRetention", "smoothing"] },
  { intent: "retain valleys", capabilities: ["evidence.assimilateHeightmaps", "evidence.buildNextPass"], parameters: ["valleyRetention", "smoothing", "contrast"] },
  { intent: "reduce clipping", capabilities: ["refinement.compareHeightmaps", "evidence.assimilateHeightmaps"], parameters: ["evidenceInfluence", "contrast"] },
  { intent: "protect ocean", capabilities: ["evidence.clipHeightmapToCanonicalMask", "orogen.finalizeInput"], parameters: ["coastlineLock", "strictBinaryMask", "requireMatchingLandSupport"] },
  { intent: "conservative Orogen input", capabilities: ["evidence.buildCandidates", "orogen.finalizeInput", "orogen.exportInputBundle"], parameters: ["style", "coastFloor"] },
  { intent: "expressive Orogen input", capabilities: ["evidence.buildCandidates", "evidence.buildNextPass", "orogen.finalizeInput"], parameters: ["style", "ridgeRetention", "valleyRetention", "coastlineExpansion"] },
  { intent: "compare Orogen passes", capabilities: ["refinement.compareMasks", "refinement.compareHeightmaps", "refinement.compareCandidates"], parameters: [] },
]);

function versionParts(value) {
  return String(value || "0").split(".").map((part) => Number.parseInt(part, 10) || 0).slice(0, 3);
}

function versionAtLeast(current, minimum) {
  const a = versionParts(current); const b = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0);
  }
  return true;
}

export function agentSkillManifest() {
  const capabilities = capabilityManifest();
  return {
    format: "world-portal-agent-skill",
    version: AGENT_SKILL_VERSION,
    id: AGENT_SKILL_ID,
    name: "World Portal Agent Skill — Planetary Refinement",
    description: "Model-neutral instructions for analyzing World Portal evidence and creating safe declarative refinement plans.",
    minimumWorldPortalVersion: "0.20.0",
    worldPortalVersion: WORLD_PORTAL_VERSION,
    planProtocol: AGENT_PLAN_PROTOCOL,
    planProtocolVersion: AGENT_PLAN_PROTOCOL_VERSION,
    supportedLegacyProtocols: [LEGACY_EVE_PLAN_PROTOCOL],
    supportedBriefingVersions: [1],
    capabilityManifestVersion: capabilities.version,
    entrypoint: "SKILL.md",
    generatedFiles: ["capabilities.json", "parameter-ranges.json", "intent-map.json", "diagnostic-checklist.json", "CAPABILITIES.md"],
    schemas: {
      agentPlan: "schemas/agent-plan.schema.json",
      briefing: "schemas/eve-briefing.schema.json",
      skillManifest: "schemas/skill-manifest.schema.json",
    },
    examples: STATIC_FILES.filter((path) => path.startsWith("examples/")),
  };
}

export function agentSkillCompatibility(worldPortalVersion = WORLD_PORTAL_VERSION) {
  const manifest = agentSkillManifest();
  const capabilities = capabilityManifest();
  const compatible = versionAtLeast(worldPortalVersion, manifest.minimumWorldPortalVersion)
    && capabilities.version === manifest.capabilityManifestVersion;
  return {
    skillId: AGENT_SKILL_ID,
    skillVersion: AGENT_SKILL_VERSION,
    planProtocol: AGENT_PLAN_PROTOCOL,
    planProtocolVersion: AGENT_PLAN_PROTOCOL_VERSION,
    capabilityManifestVersion: capabilities.version,
    worldPortalVersion,
    minimumWorldPortalVersion: manifest.minimumWorldPortalVersion,
    compatible,
    status: compatible ? "compatible" : "refresh-required",
    message: compatible
      ? "Portable refinement skill matches the installed World Portal capability protocol."
      : "Installed agent skill is older or incompatible with the current World Portal capability protocol. Export a fresh skill package.",
  };
}

export function availableSkillsManifest() {
  return [{ id: AGENT_SKILL_ID, name: "Planetary Refinement", version: AGENT_SKILL_VERSION, active: true }];
}

export function parameterRangeManifest() {
  const manifest = capabilityManifest();
  return {
    format: "world-portal-agent-parameter-ranges",
    version: 1,
    generatedAt: new Date().toISOString(),
    commands: Object.fromEntries(manifest.commands.map((command) => [command.id, {
      risk: command.risk,
      confirmation: !!command.confirmation,
      requiredInputs: command.requiredInputs || [],
      parameters: command.parameters || {},
      output: command.output || null,
    }])),
    refinementIntent: refinementIntentManifest(),
  };
}

export function capabilityIntentManifest() {
  return {
    format: "world-portal-capability-intent-map",
    version: 1,
    rule: "Use this map as navigation only; capabilities.json and parameter-ranges.json remain authoritative.",
    intents: CAPABILITY_INTENT_MAP,
  };
}

export function modelStarterPrompt() {
  return "You are operating World Portal using its portable Planetary Refinement skill. First read agent-skill/SKILL.md, then eve-briefing.json. Treat capabilities.json and parameter-ranges.json as authoritative. Produce only a declarative world-portal-agent-plan compatible with the advertised schema. Do not invent unsupported capabilities or parameters. Respect canonical truth, role-specific evidence trust, confirmation boundaries, mission lineage, selected-candidate export integrity, and pending human decisions.";
}

export function compactAgentInstructions() {
  return [
    modelStarterPrompt(),
    "Before planning, run the diagnostic checklist and verify packageValidation.valid.",
    "Canonical visual/mask/heightmap are hard truth; Orogen outputs are role-specific evidence until promoted.",
    "An anomalous layer may still contribute to a restricted domain, such as clipped interior elevation detail.",
    "Use semantic selectors when they resolve uniquely. Generate alternatives and pause when aesthetic choice remains.",
    "Never silently promote a candidate or export canonical fallback when a selected candidate exists.",
    "World Portal validates and executes every command locally.",
  ].join("\n");
}

export async function loadStaticSkillFile(path) {
  if (!STATIC_FILES.includes(path) && path !== "skill-manifest.json") throw new Error(`Unknown agent skill file: ${path}`);
  const url = new URL(`../../../skills/world-portal-refinement/${path}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load agent skill file ${path} (${response.status}).`);
  return response.text();
}

export function staticSkillFiles() { return [...STATIC_FILES]; }
