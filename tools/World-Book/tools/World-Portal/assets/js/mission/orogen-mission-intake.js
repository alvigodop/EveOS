import { inferLayerRole, inferPassToken, layerDomain } from "../world/world-layer-store.js";

const ROLE_ORDER = [
  "orogen-land-mask", "orogen-land-heightmap", "satellite", "climate",
  "biome", "terrain", "classified-regions", "custom",
];

function tokenFor(file, fallback) {
  return inferPassToken(file.name) || fallback;
}

export function groupOrogenResultFiles(files, { fallbackToken = "untagged" } = {}) {
  const groups = new Map();
  for (const file of files || []) {
    const token = tokenFor(file, fallbackToken);
    const role = inferLayerRole(file.name);
    if (!groups.has(token)) groups.set(token, { token, files: [], roles: new Map(), warnings: [] });
    const group = groups.get(token);
    group.files.push(file);
    if (!group.roles.has(role.type)) group.roles.set(role.type, []);
    group.roles.get(role.type).push({ file, inference: role });
  }
  return [...groups.values()].map((group) => {
    const recognized = ROLE_ORDER.filter((role) => group.roles.has(role));
    const duplicates = recognized.filter((role) => group.roles.get(role).length > 1);
    if (duplicates.length) group.warnings.push(`Multiple files were inferred as: ${duplicates.join(", ")}.`);
    const expected = ["orogen-land-mask", "orogen-land-heightmap", "satellite", "climate"];
    const missing = expected.filter((role) => !group.roles.has(role));
    return {
      ...group,
      recognizedRoles: recognized,
      missingRoles: missing,
      recognitionConfidence: group.files.length
        ? group.files.reduce((sum, file) => sum + inferLayerRole(file.name).confidence, 0) / group.files.length
        : 0,
    };
  });
}

export function missionRelevantLayers(record, mission, sessionLayers = []) {
  const ids = new Set([
    mission?.baseline?.visualLayerId,
    mission?.baseline?.maskLayerId,
    mission?.baseline?.heightmapLayerId,
    ...sessionLayers.map((layer) => layer.id),
  ].filter(Boolean));
  return (record.assets?.layers || []).filter((layer) => ids.has(layer.id));
}

export function chooseRunLayers(layers = []) {
  const byType = (type) => layers.find((layer) => layer.type === type) || null;
  const byDomain = (domain) => layers.find((layer) => layerDomain(layer.type) === domain) || null;
  return {
    mask: byType("orogen-land-mask") || byDomain("mask"),
    heightmap: byType("orogen-land-heightmap") || byDomain("heightmap"),
    satellite: byType("satellite"),
    climate: byType("climate"),
    biome: byType("biome"),
    terrain: byType("terrain"),
  };
}

function issueFromAnalysis(layer) {
  const flags = layer?.analysis?.anomalyFlags || [];
  const issue = layer?.analysis?.anomaly;
  return [...flags, ...(issue ? [issue] : [])].filter(Boolean);
}

export async function buildMissionComparison({ record, mission, session, engine }) {
  const allLayers = record.assets?.layers || [];
  const imported = allLayers.filter((layer) => layer.sessionId === session.id);
  const run = chooseRunLayers(imported);
  const baselineMask = allLayers.find((layer) => layer.id === mission.baseline.maskLayerId) || null;
  const baselineHeight = allLayers.find((layer) => layer.id === mission.baseline.heightmapLayerId) || null;
  const analyze = async (layer) => {
    if (!layer) return null;
    if (!layer.analysis || layer.analysisVersion !== "2.0.0") {
      layer.analysis = await engine.analyze(layer);
      layer.analysisVersion = "2.0.0";
    }
    return layer.analysis;
  };
  await Promise.all([baselineMask, baselineHeight, ...imported].map(analyze));
  const maskComparison = baselineMask && run.mask
    ? await engine.compareAnalysis(baselineMask, run.mask) : null;
  const heightComparison = baselineHeight && run.heightmap
    ? await engine.compareAnalysis(baselineHeight, run.heightmap) : null;
  const expectedWidth = mission.lastExport?.files?.mask?.width || baselineMask?.width || null;
  const expectedHeight = mission.lastExport?.files?.mask?.height || baselineMask?.height || null;
  const dimensionMatch = [run.mask, run.heightmap, run.satellite, run.climate]
    .filter(Boolean).every((layer) => (
      !expectedWidth || (layer.width === expectedWidth && layer.height === expectedHeight)
    ));
  const anomalies = imported.flatMap((layer) => issueFromAnalysis(layer).map((issue) => ({ layerId: layer.id, layerName: layer.name, issue })));
  const reliefChange = baselineHeight?.analysis && run.heightmap?.analysis ? {
    baselineRelief: baselineHeight.analysis.relief ?? null,
    returnedRelief: run.heightmap.analysis.relief ?? null,
    baselinePeak: baselineHeight.analysis.maximumElevation ?? null,
    returnedPeak: run.heightmap.analysis.maximumElevation ?? null,
    returnedNearBlackShare: run.heightmap.analysis.nearBlackLand?.share1to8 ?? null,
    returnedClippedShare: run.heightmap.analysis.clippedPeakShare ?? run.heightmap.analysis.exactWhiteShare ?? null,
  } : null;
  return {
    createdAt: new Date().toISOString(),
    sessionId: session.id,
    passToken: session.passToken || null,
    baseline: { maskLayerId: baselineMask?.id || null, heightmapLayerId: baselineHeight?.id || null },
    returned: Object.fromEntries(Object.entries(run).map(([key, layer]) => [key, layer?.id || null])),
    recognizedRoleCount: Object.values(run).filter(Boolean).length,
    expectedDimensions: expectedWidth && expectedHeight ? { width: expectedWidth, height: expectedHeight } : null,
    dimensionMatch,
    maskComparison,
    heightComparison,
    reliefChange,
    anomalies,
    readyForEve: !!(run.mask && run.heightmap),
  };
}

export function comparisonSummary(comparison) {
  if (!comparison) return "No Orogen comparison has been prepared.";
  const lines = [
    `${comparison.recognizedRoleCount} recognized output roles${comparison.passToken ? ` · run ${comparison.passToken}` : ""}.`,
    `Dimensions: ${comparison.dimensionMatch ? "match mission baseline" : "do not all match mission baseline"}${comparison.expectedDimensions ? ` (${comparison.expectedDimensions.width} × ${comparison.expectedDimensions.height})` : ""}.`,
  ];
  if (comparison.maskComparison) {
    lines.push(`Mask IoU: ${(comparison.maskComparison.intersectionOverUnion * 100).toFixed(2)}% · pixel agreement ${(comparison.maskComparison.pixelAgreement * 100).toFixed(2)}%.`);
  }
  if (comparison.heightComparison) {
    lines.push(`Height correlation: ${Number(comparison.heightComparison.correlation || 0).toFixed(4)} · MAE ${Number(comparison.heightComparison.meanAbsoluteError || 0).toFixed(2)}.`);
  }
  if (comparison.anomalies.length) lines.push(`${comparison.anomalies.length} anomaly warning${comparison.anomalies.length === 1 ? "" : "s"} retained as evidence.`);
  lines.push(comparison.readyForEve ? "Ready to prepare a curated Eve review package." : "A mask and land heightmap are both required for automatic review.");
  return lines.join("\n");
}
