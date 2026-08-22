import { downloadBlob, slugify } from "./image-layer-utils.js";
import { layerDomain } from "../world/world-layer-store.js";
import { buildLayerReport, formatBytes, serializeLayer } from "../eve/layer-report.js";

const percent = (value, digits = 1) => Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
const fixed = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : "n/a";

function geo(point) {
  if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return "n/a";
  return `${Math.abs(point.latitude).toFixed(1)}°${point.latitude < 0 ? "S" : "N"}, ${Math.abs(point.longitude).toFixed(1)}°${point.longitude < 0 ? "W" : "E"}`;
}

function containerLabel(layer) {
  const metadata = layer.metadata?.imageContainer || layer.analysis?.file?.imageContainer;
  if (!metadata) return layer.mimeType || layer.fileFormat || "unknown";
  if (metadata.format === "PNG") return `PNG · ${metadata.header?.bitDepth ?? "?"}-bit ${metadata.header?.colorModel || ""}`;
  if (metadata.format === "JPEG") return `JPEG · ${metadata.frame?.precision ?? "?"}-bit · ${metadata.iccProfilePresent ? "ICC" : "no ICC"}`;
  if (metadata.format === "WebP") return `WebP · ${metadata.extended?.alpha ? "alpha" : "opaque"}`;
  return metadata.format || layer.mimeType || "unknown";
}

function card(title, value, detail = "") {
  const element = document.createElement("div"); element.className = "orogen-analysis-card";
  const heading = document.createElement("span"); heading.textContent = title;
  const strong = document.createElement("strong"); strong.textContent = value;
  const small = document.createElement("small"); small.textContent = detail;
  element.append(heading, strong, small);
  return element;
}

function maskCards(layer, data) {
  const depth = data.coastDepth || {};
  const extent = data.geographicExtent || {};
  return [
    card("Land coverage", percent(data.landCoverage, 3), `${percent(data.sphericalLandCoverage, 3)} area-corrected on sphere`),
    card("Landmasses", String(data.landmassCount ?? "n/a"), `${data.tinyIslandCount ?? 0} tiny · effective count ${fixed(data.effectiveLandmassCount)}`),
    card("Largest landmass", Number(data.largestLandmass || 0).toLocaleString(), `${percent(data.largestLandmassShare)} of land · top 3 ${percent(data.topThreeLandmassShare)}`),
    card("Fragmentation", fixed(data.fragmentationIndex, 4), `${percent(data.tinyIslandShare, 3)} tiny share · ${fixed(data.patchDensityPerMegapixel, 1)} patches/Mpx`),
    card("Geographic center", geo(data.centroid), `${data.dominantLatitudeBand || "unknown"} · ${data.dominantHemisphere || "unknown"}`),
    card("Latitude distribution", `${percent(data.latitudeShares?.tropical)} tropical`, `${percent(data.latitudeShares?.midLatitude)} mid-latitude · ${percent(data.latitudeShares?.polar)} polar`),
    card("Longitude span", `${fixed(extent.longitude?.spanDegrees, 1)}°`, extent.longitude?.crossesAntimeridian ? "Crosses antimeridian" : `${extent.seamRows || 0} seam-connected rows`),
    card("Coastline complexity", fixed(data.coastlineComplexity), `${Number(data.coastlineEdges || 0).toLocaleString()} edges · density ${fixed(data.edgeDensity, 4)}`),
    card("Interior/core land", percent(data.coreLandShare), `${percent(data.coreDepthShares?.atLeast8)} at least 8 px inland · P90 depth ${fixed(depth.p90Pixels, 0)} px`),
    card("File and provenance", formatBytes(layer.byteSize), `${containerLabel(layer)} · ${layer.checksum?.slice(0, 12) || "no hash"}`),
  ];
}

function heightCards(layer, data) {
  const p = data.elevationPercentiles || {}; const bands = data.terrainCoverage || {};
  const local = data.localRelief || {}; const high = data.highlandRegions || {};
  return [
    card("Elevation range", `${data.minimumLand ?? 0}–${data.maximumElevation ?? 0}`, `Relief ${data.relief ?? 0} · mean ${fixed(data.averageLandElevation)}`),
    card("Area-corrected coverage", percent(data.sphericalLandCoverage, 3), `${percent(data.landCoverage, 3)} raw pixels`),
    card("Elevation profile", `P50 ${p.p50 ?? "n/a"} · P90 ${p.p90 ?? "n/a"}`, `P25 ${p.p25 ?? "n/a"} · P75 ${p.p75 ?? "n/a"} · P99 ${p.p99 ?? "n/a"}`),
    card("Terrain spread", `σ ${fixed(data.elevationStdDev)}`, `P90−P10 ${fixed(data.terrainContrastP90P10, 0)} · hypsometric ${fixed(data.hypsometricIntegral, 4)}`),
    card("Terrain bands", `${percent(bands.lowlands)} lowlands`, `${percent(bands.hills)} hills · ${percent(bands.mountains)} mountains · ${percent(bands.peaks)} peaks`),
    card("Slope / roughness", fixed(data.terrainRoughness), `Slope proxy P90 ${fixed(data.slopeProxy?.p90, 0)} · P99 ${fixed(data.slopeProxy?.p99, 0)}`),
    card("Ridges and valleys", `${percent(local.ridgeShare)} / ${percent(local.valleyShare)}`, `${Number(local.peakCandidateCount || 0).toLocaleString()} peak candidates`),
    card("Highest point", geo(data.highestPoint), `Value ${data.highestPoint?.value ?? "n/a"}`),
    card("Highland regions", String(high.count ?? "n/a"), `${percent(high.largestShare)} in largest highland system`),
    card("Near-black land risk", percent(data.nearBlackLand?.share1to8, 3), `${Number(data.nearBlackLand?.values1to8 || 0).toLocaleString()} pixels at values 1–8`),
    card("File and provenance", formatBytes(layer.byteSize), `${containerLabel(layer)} · ${layer.checksum?.slice(0, 12) || "no hash"}`),
  ];
}

function visualCards(layer, data) {
  const palette = (data.dominantColors || []).slice(0, 4).map((color) => color.hex).join(" · ");
  return [
    card("Resolution", `${layer.width || "?"} × ${layer.height || "?"}`, `${fixed(data.aspectRatio, 4)} ratio · ${data.equirectangularStatus || "unknown"}`),
    card("Luminance", fixed(data.luminance?.mean), `P05 ${data.luminance?.p05 ?? "n/a"} · P50 ${data.luminance?.p50 ?? "n/a"} · P95 ${data.luminance?.p95 ?? "n/a"}`),
    card("Color complexity", `${Number(data.quantizedColorCount || 0).toLocaleString()} bins`, `${fixed(data.colorEntropy, 2)} bits entropy · top 5 ${percent(data.paletteConcentration)}`),
    card("Dominant palette", palette || "Unavailable", `${percent(data.grayscaleShare)} grayscale-like pixels`),
    card("Texture complexity", fixed(data.textureComplexity), `Edge P90 ${fixed(data.edgeP90, 0)} · saturation ${fixed(data.averageSaturation, 3)}`),
    card("Black / white coverage", `${percent(data.exactBlackShare)} / ${percent(data.exactWhiteShare)}`, `Exact values · ${percent(data.transparencyShare, 3)} transparent`),
    card("Analysis hints", (data.analysisHints || []).join(", ") || "None", data.note || "Raster structure only; no unknown palette meanings inferred"),
    card("File and provenance", formatBytes(layer.byteSize), `${containerLabel(layer)} · ${layer.checksum?.slice(0, 12) || "no hash"}`),
  ];
}

function comparisonCards(comparison, domain, layerB) {
  if (!comparison || !layerB) return [];
  if (domain === "mask") return [
    card("A ↔ B mask agreement", percent(comparison.intersectionOverUnion), `IoU · Dice ${percent(comparison.diceCoefficient)} · pixel agreement ${percent(comparison.pixelAgreement)}`),
    card("Spherical agreement", percent(comparison.sphericalAgreement), `Area-corrected IoU ${percent(comparison.sphericalIntersectionOverUnion)}`),
    card("Disagreement pixels", `${Number(comparison.layerAOnlyPixels || 0).toLocaleString()} A-only`, `${Number(comparison.layerBOnlyPixels || 0).toLocaleString()} B-only · compared with ${layerB.name}`),
  ];
  if (domain === "heightmap") return [
    card("Elevation similarity", fixed(comparison.correlation, 4), `Correlation with ${layerB.name}`),
    card("Elevation error", `MAE ${fixed(comparison.meanAbsoluteError)}`, `RMSE ${fixed(comparison.rootMeanSquareError)} · B−A bias ${fixed(comparison.meanBiasBMinusA)}`),
    card("Shared land", Number(comparison.sharedLandPixels || 0).toLocaleString(), `${percent(comparison.sharedLandShareOfA)} of A · ${percent(comparison.sharedLandShareOfB)} of B`),
  ];
  return [
    card("Visual similarity", fixed(comparison.luminanceCorrelation, 4), `Luminance correlation with ${layerB.name}`),
    card("Visual difference", `MAE ${fixed(comparison.meanAbsoluteLuminanceDifference)}`, `RMSE ${fixed(comparison.rootMeanSquareLuminanceDifference)} · RGB MAE ${fixed(comparison.meanAbsoluteChannelDifference)}`),
    card("Materially changed", percent(comparison.materiallyChangedPixelShare), "Pixels with luminance difference of at least 10"),
  ];
}

export function createOrogenAnalysisPresenter({ view, engine, getWorldName, setStatus }) {
  let currentLayer = null; let currentComparison = null; let currentLayerB = null;

  async function render(layer, layerB = null) {
    currentLayer = layer; currentLayerB = layerB;
    currentComparison = await engine.compareAnalysis(layer, layerB);
    view.analysisGrid.replaceChildren();
    if (!layer) {
      view.analysisReport.textContent = "Choose a layer to generate its full physical and provenance report.";
      return;
    }
    const domain = layerDomain(layer.type); const data = layer.analysis || {};
    const cards = domain === "mask" ? maskCards(layer, data)
      : domain === "heightmap" ? heightCards(layer, data) : visualCards(layer, data);
    view.analysisGrid.append(...cards, ...comparisonCards(currentComparison, domain, layerB));
    view.analysisReport.textContent = buildLayerReport(layer, {
      worldName: getWorldName(), comparison: currentComparison, comparisonLayerName: layerB?.name,
    });
  }

  async function copyReport() {
    const text = view.analysisReport.textContent;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Full layer intelligence copied for Eve / chat.");
    } catch {
      downloadBlob(new Blob([text], { type: "text/plain" }), `${slugify(currentLayer?.name || "layer")}-intelligence.txt`);
      setStatus("Clipboard access was unavailable, so the report was downloaded instead.");
    }
  }

  function downloadReport() {
    if (!currentLayer) return setStatus("Choose a layer first.", true);
    const payload = {
      protocol: "world-portal-layer-intelligence",
      version: 1,
      exportedAt: new Date().toISOString(),
      worldName: getWorldName(),
      layer: serializeLayer(currentLayer),
      comparedWith: currentLayerB ? serializeLayer(currentLayerB) : null,
      comparison: currentComparison,
      plainTextReport: view.analysisReport.textContent,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slugify(currentLayer.name)}-intelligence.json`);
    setStatus("Layer intelligence JSON downloaded.");
  }

  view.copyAnalysis.addEventListener("click", copyReport);
  view.downloadAnalysis.addEventListener("click", downloadReport);
  return { render, getCurrent: () => ({ layer: currentLayer, layerB: currentLayerB, comparison: currentComparison }) };
}
