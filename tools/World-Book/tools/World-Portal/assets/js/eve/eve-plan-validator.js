import {
  AGENT_PLAN_PROTOCOL, EVE_CAPABILITIES, EVE_PROTOCOL_VERSION, LEGACY_EVE_PLAN_PROTOCOL,
} from "./eve-capabilities.js";
import { isResultReference } from "./eve-plan-results.js";
import { resolvePlanSelectors } from "./eve-semantic-selectors.js";
import { ensureLayerAssets } from "../world/world-layer-store.js";
import { getActiveRefinementMission } from "../mission/refinement-mission-store.js";
import { REFINEMENT_INTENT_RANGES } from "../refinement/refinement-intent.js";

const RISK_ORDER = { low: 1, medium: 2, high: 3 };
const RESULT_TOKEN = /^\$result\.([^.]+)\.([a-zA-Z0-9_]+)$/;
const FORGE_ALIASES = {
  normalizationMode: ["normalizationMode"], outputResolution: ["outputResolution", "resolution"],
  oceanReferenceColor: ["oceanReferenceColor", "oceanColor", "mask.oceanColor"],
  oceanTolerance: ["oceanTolerance", "tolerance", "mask.tolerance"],
  connectedOcean: ["connectedOcean", "connectedOnly", "mask.connectedOnly"],
  edgeSeeds: ["edgeSeeds", "mask.edgeSeeds"], invertMask: ["invertMask", "mask.invertMask"],
  islandRemovalThreshold: ["islandRemovalThreshold", "minimumIslandArea", "cleanup.minimumIslandArea"],
  keepLargestLandmass: ["keepLargestLandmass", "cleanup.keepLargestLandmass"],
  holeFillingThreshold: ["holeFillingThreshold", "maximumHoleArea", "cleanup.maximumHoleArea"],
  coastSmoothing: ["coastSmoothing", "smoothPasses", "cleanup.smoothPasses"],
  coastHeight: ["coastHeight", "coastFloor", "elevation.coastHeight"],
  inlandElevation: ["inlandElevation", "inlandStrength", "elevation.inlandStrength"],
  coastalFalloff: ["coastalFalloff", "falloffExponent", "elevation.falloffExponent"],
  terrainRoughness: ["terrainRoughness", "roughness", "elevation.roughness"],
  noiseScale: ["noiseScale", "elevation.noiseScale"], seed: ["seed", "elevation.seed"],
};

function collectLayerReferences(value, references = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectLayerReferences(item, references));
  else if (value && typeof value === "object") {
    if (typeof value.fromCommand === "string" && typeof value.field === "string") return references;
    for (const [key, item] of Object.entries(value)) {
      if (/layerid$/i.test(key) && typeof item === "string" && !isResultReference(item)) references.add(item);
      else if (/layerids$/i.test(key) && Array.isArray(item)) {
        item.filter((id) => typeof id === "string" && !isResultReference(id)).forEach((id) => references.add(id));
      } else collectLayerReferences(item, references);
    }
  }
  return references;
}

function collectResultReferences(value, output = []) {
  if (typeof value === "string") {
    const match = value.match(RESULT_TOKEN);
    if (match) output.push({ commandId: match[1], field: match[2], raw: value });
  } else if (Array.isArray(value)) value.forEach((item) => collectResultReferences(item, output));
  else if (value && typeof value === "object") {
    if (typeof value.fromCommand === "string" && typeof value.field === "string") {
      output.push({ commandId: value.fromCommand, field: value.field, raw: JSON.stringify(value) });
    } else Object.values(value).forEach((item) => collectResultReferences(item, output));
  }
  return output;
}

const UNSAFE_KEY = /(?:script|sourcecode|shell|executable|commandline|html|filesystempath|actionurl)$/i;
const UNSAFE_VALUES = [
  { reason: "executable-like content", pattern: /(?:<script|javascript:|data:text\/html|powershell|cmd\.exe|\/bin\/(?:ba)?sh|\b(?:bash|sh|node|python)\s+-[ce]\b|\brm\s+-|\bdel\s+\/|\bcurl\s+|\bwget\s+)/i },
  // \b keeps the drive-letter branch from matching the "s:/" inside "https://".
  { reason: "a filesystem path", pattern: /(?:file:\/\/|\.\.\/|\b[a-z]:[\\/]|\/(?:home|mnt|etc|tmp|usr|var)\/)/i },
  { reason: "a network action target", pattern: /https?:\/\//i },
];

// Descriptive string parameters carried by the capability manifest. They are
// stored as provenance and rendered through textContent, never interpreted.
const PROSE_KEYS = new Set(["notes", "reason", "name", "description"]);

// Only the executable surface (command inputs/parameters) is scanned. Free-text
// plan fields — title, summary, notes, reason, expectedResult — are rendered
// through textContent only and must stay free prose so an agent can cite a
// source or describe a path without the whole plan being rejected.
function findUnsafeValue(value, path, key = "") {
  if (typeof value === "function") return { path, reason: "a function value" };
  if (key && UNSAFE_KEY.test(key)) return { path, reason: "a disallowed field name" };
  if (typeof value === "string") {
    if (PROSE_KEYS.has(key)) return null;
    const match = UNSAFE_VALUES.find(({ pattern }) => pattern.test(value));
    return match ? { path, reason: match.reason } : null;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findUnsafeValue(item, `${path}[${index}]`, key);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value)) {
      const found = findUnsafeValue(item, `${path}.${childKey}`, childKey);
      if (found) return found;
    }
  }
  return null;
}

function findUnsafeCommandValue(commands) {
  for (const command of Array.isArray(commands) ? commands : []) {
    if (!command || typeof command !== "object") continue;
    const label = typeof command.id === "string" && command.id ? command.id : "command";
    for (const field of ["inputs", "parameters"]) {
      const found = findUnsafeValue(command[field], `${label}.${field}`, field);
      if (found) return found;
    }
  }
  return null;
}

function pathValues(value, prefix = "", output = new Map()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item) && !("fromCommand" in item)) pathValues(item, path, output);
    else output.set(path, item);
  }
  return output;
}

function validateRule(name, value, rule, errors, commandId) {
  if (isResultReference(value) || (value && typeof value === "object" && value.fromCommand)) return;
  const fail = (message) => errors.push(`${commandId}: ${name} ${message}`);
  if (rule.type === "string" && typeof value !== "string") fail("must be a string.");
  if (rule.type === "boolean" && typeof value !== "boolean") fail("must be boolean.");
  if (rule.type === "number" && !Number.isFinite(value)) fail("must be numeric.");
  if (rule.type === "integer" && !Number.isInteger(value)) fail("must be an integer.");
  if (rule.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) fail("must be an object.");
  if (rule.type === "array" && !Array.isArray(value)) fail("must be an array.");
  if (rule.type === "enum" && !rule.values.includes(value)) fail(`must be one of ${rule.values.join(", ")}.`);
  if (rule.type === "rgb" && (!Array.isArray(value) || value.length !== 3 || value.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255))) {
    fail("must be an RGB array with three integers from 0 to 255.");
  }
  if (rule.range && Number.isFinite(value) && (value < rule.range[0] || value > rule.range[1])) {
    fail(`must be between ${rule.range[0]} and ${rule.range[1]}.`);
  }
}

function validateForgeParameters(command, metadata, errors) {
  const values = pathValues(command.parameters || {});
  const acceptedPaths = new Set(Object.values(FORGE_ALIASES).flat());
  for (const path of values.keys()) if (!acceptedPaths.has(path)) errors.push(`${command.id}: unknown Heightmap Forge parameter ${path}.`);
  for (const [canonical, aliases] of Object.entries(FORGE_ALIASES)) {
    const path = aliases.find((candidate) => values.has(candidate));
    if (path) validateRule(canonical, values.get(path), metadata.parameters[canonical], errors, command.id);
  }
}

function validateIntent(command, errors) {
  const intent = command.parameters?.intent;
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return;
  const booleans = new Set([
    "preserveNearbyIslands", "removeRemoteNoise", "preserveSharpCoastlineBends", "preserveProtrusions",
    "retainRidgeContrast", "retainValleyDepth", "minimizeSmoothing", "lockCanonicalCoastline",
    "allowSupportedCoastlineExpansion", "protectOriginalOceanTexture",
  ]);
  for (const [key, value] of Object.entries(intent)) {
    if (booleans.has(key) && typeof value !== "boolean") errors.push(`${command.id}: intent.${key} must be boolean.`);
    else if (REFINEMENT_INTENT_RANGES[key]) {
      const [min, max] = REFINEMENT_INTENT_RANGES[key];
      if (!Number.isFinite(value) || value < min || value > max) errors.push(`${command.id}: intent.${key} must be between ${min} and ${max}.`);
    } else if (!booleans.has(key)) errors.push(`${command.id}: unknown refinement intent field ${key}.`);
  }
}

function validateFlatParameters(command, metadata, errors) {
  const parameters = command.parameters || {};
  for (const key of Object.keys(parameters)) if (!metadata.parameters[key]) errors.push(`${command.id}: unknown parameter ${key}.`);
  for (const [key, value] of Object.entries(parameters)) if (metadata.parameters[key]) validateRule(key, value, metadata.parameters[key], errors, command.id);
  validateIntent(command, errors);
  const width = parameters.outputWidth;
  const height = parameters.outputHeight;
  if (Number.isInteger(width) && Number.isInteger(height) && width !== height * 2) errors.push(`${command.id}: outputWidth must equal outputHeight × 2.`);
  if (parameters.scope?.subjectType && !["planet", "continent", "island", "region", "custom-map"].includes(parameters.scope.subjectType)) {
    errors.push(`${command.id}: scope.subjectType is unsupported.`);
  }
}

function validateRequiredInputs(command, metadata, errors) {
  for (const key of metadata.requiredInputs || []) {
    const value = command.inputs?.[key] ?? command.parameters?.[key];
    const valid = typeof value === "string" || (value && typeof value.fromCommand === "string");
    if (!valid) errors.push(`${command.id}: missing required input ${key}.`);
  }
}

function derivedRisk(commands) {
  return (commands || []).reduce((highest, command) => {
    const risk = EVE_CAPABILITIES[command.capability]?.risk || "high";
    return RISK_ORDER[risk] > RISK_ORDER[highest] ? risk : highest;
  }, "low");
}

export function validateEvePlan(plan, { record, contextHash = null } = {}) {
  const errors = [];
  const warnings = [];
  let resolvedPlan = plan;
  let selectorResolutions = [];
  if (!plan || typeof plan !== "object") errors.push("Plan must be a JSON object.");
  if (![AGENT_PLAN_PROTOCOL, LEGACY_EVE_PLAN_PROTOCOL].includes(plan?.protocol)) errors.push("Unsupported plan protocol. Use world-portal-agent-plan or the legacy world-portal-eve-plan alias.");
  if (plan?.version !== EVE_PROTOCOL_VERSION) errors.push(`Plan version must be ${EVE_PROTOCOL_VERSION}.`);
  if (record && plan?.worldId !== record.id) errors.push("Plan targets a different world.");
  if (contextHash && plan?.basedOnContextHash !== contextHash) warnings.push("Plan was created from a different or older world context.");
  if (!Array.isArray(plan?.commands) || !plan.commands.length) errors.push("Plan contains no commands.");
  const unsafe = findUnsafeCommandValue(plan?.commands);
  if (unsafe) errors.push(`${unsafe.path} contains ${unsafe.reason}. Command inputs and parameters must not carry executable content, filesystem paths, or network targets.`);
  if (record && errors.length === 0) {
    try {
      const resolution = resolvePlanSelectors(plan, { record, mission: getActiveRefinementMission(record) });
      resolvedPlan = resolution.resolvedPlan;
      selectorResolutions = resolution.resolutions;
    } catch (error) { errors.push(`Semantic selector: ${error?.message || error}`); }
  }
  const layerIds = new Set(record ? ensureLayerAssets(record).layers.map((layer) => layer.id) : []);
  const commands = resolvedPlan?.commands || [];
  const commandPositions = new Map();
  for (const [index, command] of commands.entries()) {
    if (!command?.id || typeof command.id !== "string") errors.push("Every command requires a string ID.");
    else if (commandPositions.has(command.id)) errors.push(`Duplicate command ID: ${command.id}`);
    else commandPositions.set(command.id, index);
  }
  for (const [index, command] of commands.entries()) {
    const metadata = EVE_CAPABILITIES[command?.capability];
    if (!metadata) { errors.push(`Unsupported capability: ${command?.capability || "missing"}`); continue; }
    for (const layerId of collectLayerReferences({ inputs: command.inputs, parameters: command.parameters })) {
      if (!layerIds.has(layerId)) errors.push(`Command ${command.id} references missing layer ${layerId}.`);
    }
    for (const reference of collectResultReferences({ inputs: command.inputs, parameters: command.parameters })) {
      const sourceIndex = commandPositions.get(reference.commandId);
      if (sourceIndex === undefined) errors.push(`${command.id}: result reference targets unknown command ${reference.commandId}.`);
      else if (sourceIndex >= index) errors.push(`${command.id}: result reference ${reference.raw} must target an earlier command.`);
    }
    if (command.parameters !== undefined && (!command.parameters || typeof command.parameters !== "object" || Array.isArray(command.parameters))) errors.push(`Command ${command.id} parameters must be an object.`);
    validateRequiredInputs(command, metadata, errors);
    if (command.capability === "heightmapForge.setParameters") validateForgeParameters(command, metadata, errors);
    else if (metadata.parameters) validateFlatParameters(command, metadata, errors);
  }
  const riskLevel = derivedRisk(commands);
  if (plan?.riskLevel && RISK_ORDER[plan.riskLevel] && RISK_ORDER[plan.riskLevel] < RISK_ORDER[riskLevel]) warnings.push(`Plan declares ${plan.riskLevel} risk, but installed capabilities require ${riskLevel} risk.`);
  return {
    valid: errors.length === 0, errors, warnings, resolvedPlan, selectorResolutions,
    requiresConfirmation: commands.some((command) => command.confirmation === "required" || EVE_CAPABILITIES[command.capability]?.confirmation),
    riskLevel, commandCount: commands.length,
  };
}

export const validateAgentPlan = validateEvePlan;
