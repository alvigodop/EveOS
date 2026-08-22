import {
  ensureLayerAssets, getCanonicalLayer, getLayer,
} from "../world/world-layer-store.js";
import {
  activeMissionPass, getActiveRefinementMission, missionStageLabel, nextMissionAction,
} from "../mission/refinement-mission-store.js";
import { evidenceProfile } from "../refinement/evidence-profile.js";

function layerLine(label, layer) {
  if (!layer) return `${label}: not selected`;
  const size = layer.width && layer.height ? `${layer.width} × ${layer.height}` : "unknown size";
  return `${label}: ${layer.name}\n  ${layer.id} · ${size} · ${layer.status}`;
}

function latestGenerated(record, domain) {
  const assets = ensureLayerAssets(record);
  const id = domain === "mask"
    ? assets.heightmapForge?.latestGeneratedMaskLayerId
    : assets.heightmapForge?.latestGeneratedHeightmapLayerId;
  return getLayer(record, id);
}

export function buildBridgeState(record, { contextHash = null, pendingPlan = null, validation = null } = {}) {
  const assets = ensureLayerAssets(record);
  const mission = getActiveRefinementMission(record);
  const canonicalMask = getCanonicalLayer(record, "mask");
  const canonicalHeight = getCanonicalLayer(record, "heightmap");
  const canonicalVisual = getCanonicalLayer(record, "visual");
  const generatedMask = latestGenerated(record, "mask");
  const generatedHeight = latestGenerated(record, "heightmap");
  const finalization = assets.orogen?.lastFinalization || null;
  const latestSession = assets.analysisSessions.at(-1) || null;
  const latestPass = assets.refinementPasses.at(-1) || null;
  const latestExecution = assets.eveBridge?.executions?.at(-1) || null;
  const evidenceLayers = assets.layers.map((layer) => ({ layer, profile: evidenceProfile(layer) }))
    .filter(({ profile }) => !["rejected", "archived"].includes(profile.status));
  const anomalousEvidence = evidenceLayers.filter(({ profile }) => profile.status === "anomalous-useful");
  const trustedEvidenceCount = evidenceLayers.filter(({ profile }) => Math.max(...Object.values(profile.trust || {})) >= 0.25).length;
  const latestEvidencePass = [...assets.refinementPasses].reverse()
    .find((pass) => pass.settings?.operation === "evidence-assimilation") || null;
  const action = mission ? nextMissionAction(record, mission) : null;
  const lines = [
    `World: ${record.name} (${record.id})`,
    `Layers: ${assets.layers.length} · Orogen sessions: ${assets.analysisSessions.length} · refinement passes: ${assets.refinementPasses.length}`,
    "",
    layerLine("Canonical visual", canonicalVisual),
    layerLine("Canonical mask", canonicalMask),
    layerLine("Canonical heightmap", canonicalHeight),
  ];
  if (generatedMask && generatedMask.id !== canonicalMask?.id) lines.push("", layerLine("Newer generated mask", generatedMask));
  if (generatedHeight && generatedHeight.id !== canonicalHeight?.id) lines.push(layerLine("Newer generated heightmap", generatedHeight));
  lines.push("", `Context: ${contextHash || assets.eveBridge?.lastContextHash || "not exported"}`);
  if (assets.eveBridge?.lastContextProfile) {
    const profile = assets.eveBridge.lastContextProfile;
    lines.push(`Context curation: ${profile.accuracyProfile || "balanced"} · ${profile.curatedLayerCount || 0} curated layers · ${profile.previewCount || 0} previews · ${profile.reportCount || 0} reports · ${profile.fullAssetCount || 0} full-resolution assets`);
  }
  if (mission) {
    const pass = activeMissionPass(mission);
    const candidateSet = mission.candidateSets?.at(-1) || null;
    lines.push("", `Mission: ${mission.name}`, `State: ${missionStageLabel(mission.stage)}`, `Next action: ${action.label}`);
    if (pass) lines.push(`Active pass: ${pass.name} · ${pass.status}`);
    lines.push(`Mission scope: ${mission.scope?.subjectType || "planet"}${mission.scope?.subjectId ? ` · ${mission.scope.subjectId}` : ""}`);
    if (candidateSet) lines.push(`Review candidates: ${candidateSet.candidates.length} · selected ${mission.selectedCandidateId || "none"}`);
    if (mission.pendingDecision) lines.push(`Pending decision: ${mission.pendingDecision.prompt || mission.pendingDecision.type}`);
    if (mission.lastExport?.files) {
      const mask = mission.lastExport.files.mask;
      const height = mission.lastExport.files.heightmap;
      lines.push(`Last baseline export: ${mask?.width || "?"} × ${mask?.height || "?"} · support ${mission.lastExport.supportAgreement?.exact ? "matched" : "review required"}`);
      if (mask?.sha256 && height?.sha256) lines.push(`Export hashes: mask ${mask.sha256.slice(0, 12)}… · height ${height.sha256.slice(0, 12)}…`);
    }
    if (mission.latestComparison) {
      const comparison = mission.latestComparison;
      lines.push(`Latest returned run: ${comparison.passToken || "unknown"} · ${comparison.recognizedRoleCount || 0} recognized roles · ${comparison.dimensionMatch ? "dimensions matched" : "dimension review required"}`);
      if (comparison.maskComparison) lines.push(`Mask comparison: ${(comparison.maskComparison.intersectionOverUnion * 100).toFixed(2)}% IoU · ${(comparison.maskComparison.pixelAgreement * 100).toFixed(2)}% pixel agreement`);
      if (comparison.heightComparison) lines.push(`Height comparison: correlation ${Number(comparison.heightComparison.correlation || 0).toFixed(4)} · MAE ${Number(comparison.heightComparison.meanAbsoluteError || 0).toFixed(2)}`);
      if (comparison.anomalies?.length) lines.push(`Evidence warnings: ${comparison.anomalies.length} retained for agent review`);
    }
  } else {
    lines.push("", `Mission: not created · Agent plan may create one for ${record.builtin ? "an exported custom copy" : "this world"}.`);
  }
  if (assets.eveBridge?.pendingExecution) {
    const pending = assets.eveBridge.pendingExecution;
    lines.push("", `Paused Agent execution: ${pending.execution?.planTitle || pending.plan?.title || "Untitled"}`);
    lines.push(`Resume at command ${Number(pending.commandIndex || 0) + 1} · ${pending.pendingDecision?.prompt || pending.pendingDecision?.type || "review required"}`);
  }
  if (latestSession) lines.push("", `Latest Orogen session: ${latestSession.name}${latestSession.passToken ? ` · run ${latestSession.passToken}` : ""}`);
  if (latestPass) lines.push(`Latest refinement pass: ${latestPass.name} · ${latestPass.status}`);
  lines.push(`Evidence library: ${trustedEvidenceCount} trusted layers · ${anomalousEvidence.length} anomalous-but-useful`);
  if (latestEvidencePass) {
    const style = latestEvidencePass.settings?.style || "hybrid";
    lines.push(`Latest evidence assimilation: ${latestEvidencePass.name} · ${style} · ${latestEvidencePass.status}`);
  }
  if (finalization) {
    lines.push(`Latest finalization: ${finalization.validation?.valid ? "Orogen Ready" : "failed"} · ${finalization.validation?.width || "?"} × ${finalization.validation?.height || "?"}`);
  }
  if (pendingPlan) {
    const confirmations = pendingPlan.commands?.filter((command) => command.confirmation === "required").length || 0;
    lines.push("", `Pending Agent plan: ${pendingPlan.title || "Untitled"}`, `Validation: ${validation?.valid ? "valid" : "not valid"} · risk ${validation?.riskLevel || "unknown"} · ${pendingPlan.commands?.length || 0} commands · ${confirmations} confirmations`);
  } else if (latestExecution) lines.push("", `Latest Agent execution: ${latestExecution.planTitle} · ${latestExecution.status}`);
  const missing = [];
  if (!canonicalMask) missing.push("canonical mask");
  if (!canonicalHeight) missing.push("canonical heightmap");
  if (missing.length) lines.push("", `Blocked by: ${missing.join(" and ")}.`);
  return lines.join("\n");
}
