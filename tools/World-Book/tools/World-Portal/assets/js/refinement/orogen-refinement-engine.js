import { createRefinementWorker } from "./refinement-worker-client.js";
import {
  grayToImageData, grayToPngBlob, readImageBlob, rgbaToGray, rgbaToPngBlob,
} from "./image-layer-utils.js";
import { layerDomain } from "../world/world-layer-store.js";

function thresholdFor(layer) {
  const domain = layerDomain(layer?.type);
  return domain === "mask" || domain === "heightmap" ? 0 : 127;
}

function imageDataFromRgba(rgba, width, height) {
  return new ImageData(new Uint8ClampedArray(rgba), width, height);
}

export function createOrogenRefinementEngine() {
  const worker = createRefinementWorker();
  const cache = new Map();

  async function load(layer, width = 0, height = 0) {
    if (!layer?.blob) throw new Error("The selected layer has no image data.");
    const key = `${layer.id}:${width || layer.width || 0}x${height || layer.height || 0}`;
    if (cache.has(key)) return cache.get(key);
    const image = await readImageBlob(layer.blob, width, height);
    const value = {
      width: image.width,
      height: image.height,
      rgba: new Uint8ClampedArray(image.rgba),
      gray: rgbaToGray(image.rgba),
    };
    cache.set(key, value);
    return value;
  }

  async function loadPair(layerA, layerB) {
    const first = await load(layerA);
    const second = await load(layerB, first.width, first.height);
    return { first, second, width: first.width, height: first.height };
  }

  async function analyze(layer, tinyThreshold = 100) {
    const image = await load(layer);
    const domain = layerDomain(layer.type);
    if (domain === "mask") {
      return worker.run("analyze-mask", {
        gray: image.gray, width: image.width, height: image.height,
        threshold: thresholdFor(layer), tinyThreshold,
      });
    }
    if (domain === "heightmap") {
      return worker.run("analyze-heightmap", {
        gray: image.gray, width: image.width, height: image.height,
      });
    }
    const analysis = await worker.run("analyze-visual", {
      rgba: image.rgba, width: image.width, height: image.height,
    });
    analysis.note = layer.type === "climate" || layer.type === "biome"
      ? "Palette measured without semantic interpretation because no legend was supplied."
      : "Visual raster intelligence";
    return analysis;
  }

  async function compareAnalysis(layerA, layerB) {
    if (!layerA || !layerB) return null;
    const domainA = layerDomain(layerA.type);
    const domainB = layerDomain(layerB.type);
    if (domainA !== domainB) return null;
    const { first, second, width, height } = await loadPair(layerA, layerB);
    if (domainA === "mask") {
      return worker.run("compare-masks-stats", {
        a: first.gray, b: second.gray, width, height,
        thresholdA: thresholdFor(layerA), thresholdB: thresholdFor(layerB),
      });
    }
    if (domainA === "heightmap") return worker.run("compare-heightmaps-stats", { a: first.gray, b: second.gray });
    return worker.run("compare-visuals-stats", { a: first.rgba, b: second.rgba });
  }

  async function renderCompare(canvas, layerA, layerB, mode = "blend", opacity = 0.5) {
    if (!layerA) return;
    const first = await load(layerA);
    canvas.width = first.width;
    canvas.height = first.height;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const firstCanvas = document.createElement("canvas");
    firstCanvas.width = first.width; firstCanvas.height = first.height;
    firstCanvas.getContext("2d").putImageData(imageDataFromRgba(first.rgba, first.width, first.height), 0, 0);
    context.drawImage(firstCanvas, 0, 0);
    if (!layerB) return;
    const second = await load(layerB, first.width, first.height);
    const secondCanvas = document.createElement("canvas");
    secondCanvas.width = first.width; secondCanvas.height = first.height;
    secondCanvas.getContext("2d").putImageData(imageDataFromRgba(second.rgba, first.width, first.height), 0, 0);
    if (mode === "difference"
      && layerDomain(layerA.type) === "mask" && layerDomain(layerB.type) === "mask") {
      const rgba = await worker.run("difference-masks", {
        a: first.gray, b: second.gray,
        thresholdA: thresholdFor(layerA), thresholdB: thresholdFor(layerB),
      });
      context.putImageData(imageDataFromRgba(rgba, first.width, first.height), 0, 0);
      return;
    }
    if (mode === "side-by-side") {
      context.drawImage(firstCanvas, 0, 0);
      context.save();
      context.beginPath();
      context.rect(first.width / 2, 0, first.width / 2, first.height);
      context.clip();
      context.drawImage(secondCanvas, 0, 0);
      context.restore();
      return;
    }
    if (mode === "swipe") {
      const split = Math.round(first.width * opacity);
      context.save();
      context.beginPath();
      context.rect(0, 0, split, first.height);
      context.clip();
      context.drawImage(secondCanvas, 0, 0);
      context.restore();
      context.fillStyle = "rgba(255,255,255,.9)";
      context.fillRect(split - 2, 0, 4, first.height);
      return;
    }
    context.globalAlpha = opacity;
    context.drawImage(secondCanvas, 0, 0);
    context.globalAlpha = 1;
  }

  async function mergeMasks(layerA, layerB, mode, tinyThreshold = 100) {
    const { first, second, width, height } = await loadPair(layerA, layerB);
    const gray = await worker.run("merge-masks", {
      a: first.gray, b: second.gray, mode, width, height, tinyThreshold,
      thresholdA: thresholdFor(layerA), thresholdB: thresholdFor(layerB),
    });
    const analysis = await worker.run("analyze-mask", {
      gray, width, height, threshold: 127, tinyThreshold,
    });
    return { gray, width, height, type: "repaired-mask", analysis };
  }

  async function confidence(layerA, layerB) {
    const { first, second, width, height } = await loadPair(layerA, layerB);
    const gray = await worker.run("confidence-map", {
      a: first.gray, b: second.gray,
      thresholdA: thresholdFor(layerA), thresholdB: thresholdFor(layerB),
    });
    return { gray, width, height, type: "confidence-map" };
  }

  async function consensus(layers, votes, tinyThreshold = 100) {
    if (layers.length < 2) throw new Error("Choose a session with at least two mask layers.");
    const first = await load(layers[0]);
    const images = [first];
    for (const layer of layers.slice(1)) images.push(await load(layer, first.width, first.height));
    const gray = await worker.run("consensus-masks", {
      sources: images.map((image) => image.gray),
      votes: Math.max(1, Math.min(layers.length, votes)),
      thresholds: layers.map(thresholdFor), width: first.width, height: first.height, tinyThreshold,
    });
    const analysis = await worker.run("analyze-mask", {
      gray, width: first.width, height: first.height, threshold: 127, tinyThreshold,
    });
    return { gray, width: first.width, height: first.height, type: "repaired-mask", analysis };
  }

  async function blendHeightmaps(layerA, layerB, options = {}) {
    const { first, second, width, height } = await loadPair(layerA, layerB);
    let mask = null;
    let maskThreshold = 127;
    if (options.maskLayer) {
      const maskImage = await load(options.maskLayer, width, height);
      mask = maskImage.gray;
      maskThreshold = thresholdFor(options.maskLayer);
    }
    const gray = await worker.run("blend-heightmaps", {
      a: first.gray, b: second.gray,
      weightB: options.weightB ?? 0.5, detailStrength: options.detailStrength ?? 0,
      mask, maskThreshold,
      contrast: options.contrast ?? 1,
      smoothing: options.smoothing ?? 0,
      width, height,
    });
    const analysis = await worker.run("analyze-heightmap", { gray, width, height });
    return { gray, width, height, type: "composite-heightmap", analysis };
  }

  async function medianHeightmaps(layers, maskLayer = null) {
    if (layers.length < 2) throw new Error("Choose a session with at least two heightmap layers.");
    const first = await load(layers[0]);
    const images = [first];
    for (const layer of layers.slice(1)) images.push(await load(layer, first.width, first.height));
    let mask = null;
    let maskThreshold = 127;
    if (maskLayer) {
      const maskImage = await load(maskLayer, first.width, first.height);
      mask = maskImage.gray;
      maskThreshold = thresholdFor(maskLayer);
    }
    const gray = await worker.run("median-heightmaps", {
      sources: images.map((image) => image.gray), mask, maskThreshold,
    });
    const analysis = await worker.run("analyze-heightmap", {
      gray, width: first.width, height: first.height,
    });
    return {
      gray, width: first.width, height: first.height,
      type: "composite-heightmap", analysis,
    };
  }


  async function compositeVisual(layerA, layerB, maskLayer, landInfluence = 1) {
    if (!maskLayer) throw new Error("Choose a canonical coastline mask.");
    const { first, second, width, height } = await loadPair(layerA, layerB);
    const maskImage = await load(maskLayer, width, height);
    const rgba = await worker.run("composite-visual", {
      a: first.rgba, b: second.rgba, mask: maskImage.gray,
      maskThreshold: thresholdFor(maskLayer), landInfluence,
    });
    return {
      rgba, width, height, type: "visual-map",
      analysis: { note: "Original ocean preserved; selected derived land texture composited inside the locked coastline." },
    };
  }


  async function buildFeatureMask(canonicalLayer, evidenceEntries = [], options = {}) {
    if (!canonicalLayer) throw new Error("Choose a canonical coastline mask.");
    const canonical = await load(canonicalLayer);
    const evidence = [];
    for (const entry of evidenceEntries) {
      const image = await load(entry.layer || entry, canonical.width, canonical.height);
      evidence.push({ image, entry });
    }
    const result = await worker.run("build-feature-mask", {
      canonical: canonical.gray, canonicalThreshold: thresholdFor(canonicalLayer),
      evidence: evidence.map((item) => item.image.gray),
      thresholds: evidence.map((item) => thresholdFor(item.entry.layer || item.entry)),
      weights: evidence.map((item) => Number(item.entry.weight ?? 1)),
      width: canonical.width, height: canonical.height,
      style: options.style || "hybrid",
      coastlineExpansion: options.coastlineExpansion,
      nearbyIslandDistance: options.nearbyIslandDistance,
      minimumIslandArea: options.minimumIslandArea,
      finalMinimumArea: options.finalMinimumArea,
      evidenceSupport: options.evidenceSupport,
      maximumEvidenceCoverage: options.maximumEvidenceCoverage ?? 0.35,
    });
    const analysis = await worker.run("analyze-mask", {
      gray: result.gray, width: canonical.width, height: canonical.height,
      threshold: 127, tinyThreshold: Number(options.minimumIslandArea ?? 20),
    });
    analysis.assimilation = result.stats;
    return { gray: result.gray, width: canonical.width, height: canonical.height, type: "repaired-mask", analysis, assimilation: result.stats };
  }

  async function assimilateHeightEvidence(sourceLayer, evidenceEntries = [], maskLayer, options = {}) {
    if (!sourceLayer) throw new Error("Choose a canonical source heightmap.");
    if (!maskLayer) throw new Error("Choose a coastline mask for evidence assimilation.");
    const source = await load(sourceLayer);
    const mask = await load(maskLayer, source.width, source.height);
    const evidence = [];
    for (const entry of evidenceEntries) {
      const image = await load(entry.layer || entry, source.width, source.height);
      evidence.push({ image, entry });
    }
    const result = await worker.run("assimilate-height-evidence", {
      source: source.gray, evidence: evidence.map((item) => item.image.gray),
      weights: evidence.map((item) => Number(item.entry.weight ?? 1)),
      mask: mask.gray, maskThreshold: thresholdFor(maskLayer),
      width: source.width, height: source.height,
      coastFloor: options.coastFloor ?? 18,
      evidenceInfluence: options.evidenceInfluence, detailStrength: options.detailStrength,
      detailRadius: options.detailRadius ?? 2, ridgeRetention: options.ridgeRetention,
      valleyRetention: options.valleyRetention, contrast: options.contrast, smoothing: options.smoothing,
    });
    const analysis = await worker.run("analyze-heightmap", { gray: result.gray, width: source.width, height: source.height });
    analysis.assimilation = result.stats;
    return { gray: result.gray, width: source.width, height: source.height, type: "composite-heightmap", analysis, assimilation: result.stats };
  }

  async function clipHeightmapToMask(heightLayer, maskLayer, options = {}) {
    const height = await load(heightLayer);
    const mask = await load(maskLayer, height.width, height.height);
    const gray = await worker.run("clip-heightmap-to-mask", {
      heightmap: height.gray, mask: mask.gray, maskThreshold: thresholdFor(maskLayer),
      coastFloor: options.coastFloor ?? 1,
    });
    const analysis = await worker.run("analyze-heightmap", { gray, width: height.width, height: height.height });
    return { gray, width: height.width, height: height.height, type: "composite-heightmap", analysis };
  }

  async function extractClimateMetadata(layer, maskLayer = null) {
    const image = await load(layer);
    const mask = maskLayer ? await load(maskLayer, image.width, image.height) : null;
    return worker.run("extract-climate-palette", {
      rgba: image.rgba, width: image.width, height: image.height,
      mask: mask?.gray || null, maskThreshold: maskLayer ? thresholdFor(maskLayer) : 127,
    });
  }

  async function buildEnvironmentalZones(layer, maskLayer = null, options = {}) {
    const image = await load(layer);
    const mask = maskLayer ? await load(maskLayer, image.width, image.height) : null;
    const result = await worker.run("build-provisional-zones", {
      rgba: image.rgba, width: image.width, height: image.height,
      mask: mask?.gray || null, maskThreshold: maskLayer ? thresholdFor(maskLayer) : 127,
      zoneCount: options.zoneCount ?? 10,
    });
    return {
      rgba: result.rgba, width: image.width, height: image.height, type: "classified-regions",
      analysis: { environmentalZones: result.metadata, note: result.metadata.caution },
      metadata: result.metadata,
    };
  }

  async function resultToBlob(result) {
    if (result.rgba) return rgbaToPngBlob(result.rgba, result.width, result.height);
    return grayToPngBlob(result.gray, result.width, result.height, layerDomain(result.type) === "mask");
  }

  function drawResult(canvas, result) {
    canvas.width = result.width;
    canvas.height = result.height;
    if (result.rgba) {
      canvas.getContext("2d").putImageData(imageDataFromRgba(result.rgba, result.width, result.height), 0, 0);
    } else {
      canvas.getContext("2d").putImageData(
        grayToImageData(result.gray, result.width, result.height, layerDomain(result.type) === "mask"), 0, 0,
      );
    }
  }

  return {
    load, analyze, compareAnalysis, renderCompare, mergeMasks, confidence, consensus,
    blendHeightmaps, medianHeightmaps, compositeVisual,
    buildFeatureMask, assimilateHeightEvidence, clipHeightmapToMask, extractClimateMetadata,
    buildEnvironmentalZones,
    resultToBlob, drawResult, clearCache: () => cache.clear(),
    dispose: () => worker.dispose(),
  };
}
