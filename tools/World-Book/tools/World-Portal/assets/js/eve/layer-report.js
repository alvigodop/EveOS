import { ensureLayerAssets, getCanonicalLayer, layerDomain } from "../world/world-layer-store.js";
import { getActiveRefinementMission, missionStageLabel, nextMissionAction } from "../mission/refinement-mission-store.js";
import { evidenceProfile } from "../refinement/evidence-profile.js";

const percent = (value, digits = 2) => Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
const number = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : "n/a";

export function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function geoPoint(point) {
  if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return "unknown";
  const longitude = `${Math.abs(point.longitude).toFixed(2)}°${point.longitude < 0 ? "W" : "E"}`;
  const latitude = `${Math.abs(point.latitude).toFixed(2)}°${point.latitude < 0 ? "S" : "N"}`;
  return `${latitude}, ${longitude}`;
}

function listAnomalies(analysis) {
  const flags = analysis?.anomalyFlags || [];
  return flags.length ? flags.join(", ") : "none detected";
}

function maskLines(data) {
  const extent = data.geographicExtent || {};
  const longitude = extent.longitude || {};
  const depth = data.coastDepth || {};
  const components = data.largestComponents || [];
  const lines = [
    `Pixel land coverage: ${percent(data.landCoverage, 4)}`,
    `Spherical area-corrected land coverage: ${percent(data.sphericalLandCoverage, 4)}`,
    `Connected landmasses: ${data.landmassCount ?? "n/a"}`,
    `Largest landmass: ${(data.largestLandmass || 0).toLocaleString()} pixels (${percent(data.largestLandmassShare)})`,
    `Top-three landmass share: ${percent(data.topThreeLandmassShare)}`,
    `Effective landmass count: ${number(data.effectiveLandmassCount)}`,
    `Fragmentation index: ${number(data.fragmentationIndex, 4)}`,
    `Tiny components: ${data.tinyIslandCount ?? 0}; tiny-pixel share ${percent(data.tinyIslandShare, 4)}`,
    `Mean / median / P90 component size: ${number(data.meanLandmassSize, 0)} / ${number(data.medianLandmassSize, 0)} / ${number(data.landmassSizeP90, 0)} pixels`,
    `Component-size variation: ${number(data.landmassSizeVariation, 3)}`,
    `Patch density: ${number(data.patchDensityPerMegapixel, 2)} connected components per megapixel`,
    `Area-weighted centroid: ${geoPoint(data.centroid)}`,
    `Dominant latitude band: ${data.dominantLatitudeBand || "unknown"}`,
    `Latitude shares: tropical ${percent(data.latitudeShares?.tropical)}, mid-latitude ${percent(data.latitudeShares?.midLatitude)}, polar ${percent(data.latitudeShares?.polar)}`,
    `Hemisphere shares: north ${percent(data.hemisphereShares?.north)}, south ${percent(data.hemisphereShares?.south)}, east ${percent(data.hemisphereShares?.east)}, west ${percent(data.hemisphereShares?.west)}`,
    `Latitude extent: ${number(extent.south)}° to ${number(extent.north)}°`,
    `Longitude span: ${number(longitude.spanDegrees)}°${longitude.crossesAntimeridian ? "; crosses antimeridian" : ""}`,
    `Latitude span: ${number(extent.latitudeSpanDegrees)}°${extent.touchesNorthPole || extent.touchesSouthPole ? "; touches a pole" : ""}`,
    `Seam-connected rows: ${extent.seamRows ?? 0}`,
    `Coastline edges: ${(data.coastlineEdges || 0).toLocaleString()}`,
    `Coastline complexity: ${number(data.coastlineComplexity, 3)}`,
    `Edge density: ${number(data.edgeDensity, 4)} boundary edges per land pixel`,
    `Coastal-pixel / immediate core share: ${percent(data.coastalPixelShare)} / ${percent(data.coreLandShare)}`,
    `Deep core shares: >=2 px ${percent(data.coreDepthShares?.atLeast2)}, >=4 px ${percent(data.coreDepthShares?.atLeast4)}, >=8 px ${percent(data.coreDepthShares?.atLeast8)}, >=16 px ${percent(data.coreDepthShares?.atLeast16)}`,
    `Coast depth: mean ${number(depth.meanPixels)} px, median ${number(depth.medianPixels, 0)} px, P90 ${number(depth.p90Pixels, 0)} px, max ${number(depth.maximumPixels, 0)} px`,
    `Anomaly flags: ${listAnomalies(data)}`,
  ];
  if (components.length) {
    lines.push("Largest components:");
    components.slice(0, 8).forEach((component, index) => {
      lines.push(`  ${index + 1}. ${(component.pixelCount || 0).toLocaleString()} px; ${percent(component.shareOfLand)} of land; centroid ${geoPoint(component.centroid)}; compactness ${number(component.compactness, 3)}${component.crossesAntimeridian ? "; seam-crossing" : ""}`);
    });
  }
  return lines;
}

function heightLines(data) {
  const percentiles = data.elevationPercentiles || {};
  const coverage = data.terrainCoverage || {};
  const local = data.localRelief || {};
  const highlands = data.highlandRegions || {};
  return [
    `Non-zero elevation coverage: ${percent(data.landCoverage, 4)}`,
    `Spherical area-corrected coverage: ${percent(data.sphericalLandCoverage, 4)}`,
    `Elevation range: ${data.minimumLand ?? 0}–${data.maximumElevation ?? 0}; relief ${data.relief ?? 0}`,
    `Mean elevation: ${number(data.averageLandElevation)}; area-weighted mean ${number(data.areaWeightedMeanElevation)}`,
    `Elevation standard deviation: ${number(data.elevationStdDev)}`,
    `P90−P10 terrain contrast: ${number(data.terrainContrastP90P10, 0)}`,
    `Hypsometric integral: ${number(data.hypsometricIntegral, 4)}`,
    `Elevation entropy: ${number(data.elevationEntropy, 3)} bits`,
    `Percentiles: P05 ${percentiles.p05 ?? 0}, P10 ${percentiles.p10 ?? 0}, P25 ${percentiles.p25 ?? 0}, P50 ${percentiles.p50 ?? 0}, P75 ${percentiles.p75 ?? 0}, P90 ${percentiles.p90 ?? 0}, P95 ${percentiles.p95 ?? 0}, P99 ${percentiles.p99 ?? 0}`,
    `Terrain bands: lowlands ${percent(coverage.lowlands)}, hills ${percent(coverage.hills)}, mountains ${percent(coverage.mountains)}, peaks ${percent(coverage.peaks)}`,
    `Terrain roughness: ${number(data.terrainRoughness)}; slope proxy P90 ${number(data.slopeProxy?.p90, 0)}, P99 ${number(data.slopeProxy?.p99, 0)}`,
    `Local relief: ridges ${percent(local.ridgeShare)}, valleys ${percent(local.valleyShare)}, flatter terrain ${percent(local.flatShare)}`,
    `Peak candidates: ${(local.peakCandidateCount || 0).toLocaleString()}; highest point ${geoPoint(data.highestPoint)}`,
    `Highland regions: ${highlands.count ?? 0}; largest highland share ${percent(highlands.largestShare)}`,
    `Near-black land risk: ${(data.nearBlackLand?.values1to8 || 0).toLocaleString()} pixels (${percent(data.nearBlackLand?.share1to8, 4)})`,
    `Clipped peak share: ${percent(data.clippedPeakShare, 4)}`,
    `Elevation center: ${geoPoint(data.elevationCenter)}`,
    `Mean elevation by latitude: tropical ${number(data.latitudinalMeanElevation?.tropical)}, mid-latitude ${number(data.latitudinalMeanElevation?.midLatitude)}, polar ${number(data.latitudinalMeanElevation?.polar)}`,
    `Anomaly flags: ${listAnomalies(data)}`,
  ];
}

function visualLines(data) {
  const colors = (data.dominantColors || []).map((item) => `${item.hex} ${percent(item.share)}`).join(", ");
  return [
    `Aspect ratio: ${number(data.aspectRatio, 4)} (${data.equirectangularStatus || "unknown"})`,
    `Transparency: ${percent(data.transparencyShare, 4)}`,
    `Grayscale-like pixels: ${percent(data.grayscaleShare)}`,
    `Near-black / near-white pixels: ${percent(data.nearBlackShare)} / ${percent(data.brightShare)}`,
    `Exact black / exact white pixels: ${percent(data.exactBlackShare)} / ${percent(data.exactWhiteShare)}`,
    `Luminance: mean ${number(data.luminance?.mean)}, std dev ${number(data.luminance?.stdDev)}, P05 ${data.luminance?.p05 ?? "n/a"}, P50 ${data.luminance?.p50 ?? "n/a"}, P95 ${data.luminance?.p95 ?? "n/a"}`,
    `Average saturation: ${number(data.averageSaturation, 4)}`,
    `Channel means: R ${number(data.channelStats?.red?.mean)}, G ${number(data.channelStats?.green?.mean)}, B ${number(data.channelStats?.blue?.mean)}`,
    `Quantized colors: ${(data.quantizedColorCount || 0).toLocaleString()}; color entropy ${number(data.colorEntropy, 3)} bits`,
    `Top-five palette concentration: ${percent(data.paletteConcentration)}`,
    `Dominant palette: ${colors || "unavailable"}`,
    `Texture complexity: ${number(data.textureComplexity)}; edge P90 ${number(data.edgeP90, 0)}`,
    `Analysis hints: ${(data.analysisHints || []).join(", ") || "none"}`,
    data.note ? `Interpretation note: ${data.note}` : null,
  ].filter(Boolean);
}

function containerLines(layer) {
  const metadata = layer.metadata?.imageContainer || layer.analysis?.file?.imageContainer;
  if (!metadata) return ["Embedded image container metadata: not inspected or unavailable"];
  const lines = [`Container: ${metadata.format || "unknown"}; signature ${metadata.signatureValid ? "valid" : "unverified"}`];
  if (metadata.format === "PNG") {
    const header = metadata.header || {};
    lines.push(`PNG encoding: ${header.bitDepth ?? "?"}-bit ${header.colorModel || "unknown"}; interlaced ${header.interlaced ? "yes" : "no"}; alpha ${metadata.hasAlpha ? "yes" : "no"}`);
    lines.push(`PNG color metadata: ${metadata.hasColorProfile ? "profile present" : "no profile chunk"}${metadata.gamma ? `; gamma ${number(metadata.gamma, 5)}` : ""}`);
    lines.push(`PNG chunks: ${Object.entries(metadata.chunkCounts || {}).map(([type, count]) => `${type}×${count}`).join(", ") || "unavailable"}`);
    if (metadata.text && Object.keys(metadata.text).length) lines.push(`PNG text fields: ${Object.entries(metadata.text).map(([key, value]) => `${key}=${String(value).slice(0, 160)}`).join("; ")}`);
  } else if (metadata.format === "JPEG") {
    const frame = metadata.frame || {}; const jfif = metadata.jfif || {}; const exif = metadata.exif || {};
    lines.push(`JPEG encoding: ${frame.precision ?? "?"}-bit; ${frame.components ?? "?"} components; progressive ${frame.progressive ? "yes" : "no"}`);
    if (metadata.jfif) lines.push(`JFIF: version ${jfif.version || "unknown"}; density ${jfif.xDensity || "?"} × ${jfif.yDensity || "?"} ${jfif.densityUnit || ""}`);
    lines.push(`JPEG profiles: ICC ${metadata.iccProfilePresent ? "present" : "absent"}; XMP ${metadata.xmpPresent ? "present" : "absent"}; EXIF ${metadata.exif ? "present" : "absent"}`);
    const exifValues = ["software", "dateTime", "dateTimeOriginal", "make", "model", "orientation"].filter((key) => exif[key] !== undefined).map((key) => `${key}=${exif[key]}`);
    if (exifValues.length) lines.push(`EXIF summary: ${exifValues.join("; ")}`);
  } else if (metadata.format === "WebP") {
    lines.push(`WebP chunks: ${(metadata.chunks || []).join(", ") || "unavailable"}`);
    if (metadata.extended) lines.push(`WebP flags: alpha ${metadata.extended.alpha ? "yes" : "no"}; ICC ${metadata.extended.icc ? "yes" : "no"}; EXIF ${metadata.extended.exif ? "yes" : "no"}; XMP ${metadata.extended.xmp ? "yes" : "no"}`);
  }
  if (metadata.privacy?.gpsMetadataPresent) lines.push("Privacy note: a GPS metadata block exists, but World Portal did not extract coordinates.");
  return lines;
}


function evidenceLines(layer) {
  const profile = evidenceProfile(layer);
  const trust = profile.trust || {};
  const lines = [
    `Evidence status: ${profile.status || "provisional"}`,
    `Evidence trust: coastline ${percent(trust.coastline)}, height ${percent(trust.height)}, visual ${percent(trust.visual)}, climate ${percent(trust.climate)}`,
    `Evidence reasons: ${(profile.reasons || []).join("; ") || "none recorded"}`,
  ];
  const assimilation = layer.analysis?.assimilation || layer.metadata?.evidenceAssimilation;
  if (assimilation) {
    lines.push(`Assimilation style: ${layer.metadata?.finalizationStyle || assimilation.style || "not recorded"}`);
    if (assimilation.addedPixels !== undefined) lines.push(`Recovered coastline/island pixels: ${(assimilation.addedPixels || 0).toLocaleString()}`);
    if (assimilation.preservedIslandCount !== undefined) lines.push(`Preserved nearby islands: ${assimilation.preservedIslandCount || 0}`);
    if (assimilation.evidenceCount !== undefined) lines.push(`Height evidence sources used: ${assimilation.evidenceCount || 0}`);
  }
  const climate = layer.metadata?.climateEvidence;
  if (climate) {
    lines.push(`Climate evidence scope: ${climate.scope}; included pixels ${(climate.includedPixels || 0).toLocaleString()}`);
    lines.push(`Dominant measured colors: ${(climate.palette || []).slice(0, 8).map((item) => `${item.color} ${percent(item.share)}`).join(", ") || "none"}`);
    lines.push(`Climate evidence caution: ${climate.caution}`);
  }
  const zones = layer.metadata?.environmentalZones || layer.analysis?.environmentalZones;
  if (zones) {
    lines.push(`Provisional environmental zones: ${zones.zoneCount || zones.zones?.length || 0}; scope ${zones.scope || "unknown"}`);
    lines.push(`Zone coverage: ${(zones.zones || []).slice(0, 10).map((item) => `${item.color} ${percent(item.share)}`).join(", ") || "none"}`);
    lines.push(`Environmental-zone caution: ${zones.caution}`);
  }
  return lines;
}

function comparisonLines(comparison, domain) {
  if (!comparison) return [];
  if (domain === "mask") return [
    `Mask IoU: ${percent(comparison.intersectionOverUnion)}`,
    `Dice coefficient: ${percent(comparison.diceCoefficient)}`,
    `Pixel agreement: ${percent(comparison.pixelAgreement)}`,
    `Spherical agreement: ${percent(comparison.sphericalAgreement)}`,
    `Spherical IoU: ${percent(comparison.sphericalIntersectionOverUnion)}`,
    `A-only / B-only pixels: ${(comparison.layerAOnlyPixels || 0).toLocaleString()} / ${(comparison.layerBOnlyPixels || 0).toLocaleString()}`,
  ];
  if (domain === "heightmap") return [
    `Shared land pixels: ${(comparison.sharedLandPixels || 0).toLocaleString()}`,
    `Shared land coverage of A / B: ${percent(comparison.sharedLandShareOfA)} / ${percent(comparison.sharedLandShareOfB)}`,
    `Mean absolute elevation error: ${number(comparison.meanAbsoluteError)}`,
    `Root mean square error: ${number(comparison.rootMeanSquareError)}`,
    `Mean B−A elevation bias: ${number(comparison.meanBiasBMinusA)}`,
    `Elevation correlation: ${number(comparison.correlation, 4)}`,
  ];
  return [
    `Compared pixels: ${(comparison.comparedPixels || 0).toLocaleString()}`,
    `Mean absolute luminance difference: ${number(comparison.meanAbsoluteLuminanceDifference)}`,
    `Root mean square luminance difference: ${number(comparison.rootMeanSquareLuminanceDifference)}`,
    `Luminance correlation: ${number(comparison.luminanceCorrelation, 4)}`,
    `Mean absolute RGB-channel difference: ${number(comparison.meanAbsoluteChannelDifference)}`,
    `Materially changed pixel share: ${percent(comparison.materiallyChangedPixelShare)}`,
  ];
}

export function buildLayerReport(layer, options = {}) {
  if (!layer) return "No layer selected.";
  const analysis = layer.analysis || {};
  const domain = layerDomain(layer.type);
  const lines = [
    "WORLD PORTAL LAYER INTELLIGENCE REPORT",
    `World: ${options.worldName || layer.worldId || "unknown"}`,
    `Layer: ${layer.name}`,
    `Layer ID: ${layer.id}`,
    `Role: ${layer.type} (${domain})`,
    `Status: ${layer.status}${layer.isCanonical ? "; canonical" : ""}`,
    `Resolution: ${layer.width || "?"} × ${layer.height || "?"}; projection ${layer.projection || "unknown"}`,
    `File: ${layer.filename || "unnamed"}; ${layer.mimeType || layer.fileFormat || "unknown type"}; ${formatBytes(layer.byteSize)}`,
    `Checksum: ${layer.checksum || "not available"}`,
    `Imported / created: ${layer.createdAt || "unknown"}`,
    `Source: ${layer.sourceTool || "unknown"}${layer.sourceVersion ? ` ${layer.sourceVersion}` : ""}`,
    `Session / pass: ${layer.sessionId || "none"} / ${layer.passId || "none"}`,
    `Parent layers: ${(layer.parentLayerIds || []).join(", ") || "none"}`,
    `Role inference: ${layer.roleInference ? `${percent(layer.roleInference.confidence, 0)} — ${layer.roleInference.reason}` : "not recorded"}`,
    `Generation settings: ${layer.settingsIncomplete ? "incomplete" : "recorded"}`,
    ...containerLines(layer),
    "",
    "EVIDENCE TRUST AND ASSIMILATION",
    ...evidenceLines(layer),
    "",
    "PHYSICAL AND RASTER ANALYSIS",
  ];
  if (domain === "mask") lines.push(...maskLines(analysis));
  else if (domain === "heightmap") lines.push(...heightLines(analysis));
  else lines.push(...visualLines(analysis));
  if (analysis.contextProfile) {
    lines.push("", "MACHINE-READABLE CONTEXT PROFILE", ...Object.entries(analysis.contextProfile).map(([key, value]) => `- ${key}: ${value}`));
  }
  if (analysis.evidenceSummary?.length) {
    lines.push("", "DETERMINISTIC EVIDENCE SUMMARY", ...analysis.evidenceSummary.map((item) => `- ${item}`));
  }
  const compare = comparisonLines(options.comparison, domain);
  if (compare.length) lines.push("", `COMPARISON WITH ${options.comparisonLayerName || "LAYER B"}`, ...compare);
  if (layer.notes) lines.push("", "NOTES", layer.notes);
  lines.push("", "CONTEXT CAUTION", "These values are deterministic raster measurements. They describe physical evidence and image structure; they do not establish lore, political borders, biome names, or narrative canon without a supplied legend or user confirmation.");
  return lines.join("\n");
}

export function serializeLayer(layer) {
  const { blob, ...metadata } = layer;
  return { ...metadata, blobAvailable: blob instanceof Blob };
}

export function buildWorldReport(record) {
  const assets = ensureLayerAssets(record);
  const canonicalMask = getCanonicalLayer(record, "mask");
  const canonicalHeight = getCanonicalLayer(record, "heightmap");
  const canonicalVisual = getCanonicalLayer(record, "visual");
  const anomalyLayers = assets.layers.filter((layer) => layer.analysis?.anomalyFlags?.length || layer.analysis?.anomaly);
  const anomalousUseful = assets.layers.filter((layer) => evidenceProfile(layer).status === "anomalous-useful");
  const mission = getActiveRefinementMission(record);
  const missionAction = mission ? nextMissionAction(record, mission) : null;
  return [
    "WORLD PORTAL WORLD INTELLIGENCE SUMMARY",
    `World: ${record.name} (${record.id})`,
    `Layers: ${assets.layers.length}`,
    `Orogen analysis sessions: ${assets.analysisSessions.length}`,
    `Refinement passes: ${assets.refinementPasses.length}`,
    `Canonical visual: ${canonicalVisual?.name || "not selected"}`,
    `Canonical mask: ${canonicalMask?.name || "not selected"}`,
    `Canonical heightmap: ${canonicalHeight?.name || "not selected"}`,
    `Layers carrying anomaly flags: ${anomalyLayers.length}`,
    `Anomalous-but-useful evidence layers: ${anomalousUseful.length}`,
    `World package schema: ${record.schemaVersion || "unknown"}`,
    `Active mission: ${mission?.name || "none"}`,
    `Mission state: ${mission ? missionStageLabel(mission.stage) : "not created"}`,
    `Mission next action: ${missionAction?.label || "create a mission when ready"}`,
    `Mission accuracy: ${mission?.accuracyProfile || "balanced"}`,
    "",
    "The attached layer reports contain shape, area-corrected coverage, latitude distribution, fragmentation, coastline, terrain, palette, provenance, and pair-comparison measurements for chat analysis.",
  ].join("\n");
}
