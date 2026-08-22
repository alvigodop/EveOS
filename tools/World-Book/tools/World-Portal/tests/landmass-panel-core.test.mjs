import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLayerProvenance, hasPhysicalLandmassAnalysis, selectMeasurableMask,
} from "../assets/js/ui/landmass-panel.js";

function record(layers, canonicalId = null) {
  return {
    id: "world-a",
    assets: {
      layers,
      canonical: canonicalId ? { maskLayerId: canonicalId } : {},
    },
  };
}

test("the newest Orogen-returned mask leads a non-Orogen canonical mask", () => {
  const worldPortalMask = {
    id: "canonical", type: "binary-land-mask", sourceTool: "Heightmap Forge",
    updatedAt: "2026-08-20T10:00:00Z", isCanonical: true,
  };
  const returned = {
    id: "returned", name: "land-mask.png", type: "orogen-land-mask",
    sourceTool: "World Orogen", sourceVersion: "cc2662b4",
    sourceRepository: "https://github.com/raguilar011095/planet_heightmap_generation",
    updatedAt: "2026-08-19T10:00:00Z",
  };
  const selected = selectMeasurableMask(record([worldPortalMask, returned], "canonical"));
  assert.equal(selected.layer.id, "returned");
  assert.equal(selected.kind, "orogen-return");
  assert.equal(selected.canonical, false);
});

test("without an Orogen return, the explicit canonical mask leads", () => {
  const canonical = {
    id: "canonical", type: "repaired-mask", sourceTool: "Refinement Lab",
    updatedAt: "2026-08-19T10:00:00Z", isCanonical: true,
  };
  const newer = {
    id: "newer", type: "binary-land-mask", sourceTool: "Heightmap Forge",
    updatedAt: "2026-08-20T10:00:00Z",
  };
  const selected = selectMeasurableMask(record([canonical, newer], "canonical"));
  assert.equal(selected.layer.id, "canonical");
  assert.equal(selected.kind, "canonical");
});

test("provenance is explicit when version and repository are missing", () => {
  assert.equal(
    formatLayerProvenance({ sourceTool: "World Orogen" }),
    "World Orogen · version not recorded · repository not recorded",
  );
});

test("cached component evidence is re-analyzed when total physical area is missing", () => {
  assert.equal(hasPhysicalLandmassAnalysis({
    landmassCount: 1,
    largestComponents: [{ weightedArea: 20 }],
  }), false);
  assert.equal(hasPhysicalLandmassAnalysis({
    landmassCount: 1,
    weightedLandArea: 20,
    largestComponents: [{ weightedArea: 20 }],
  }), true);
  assert.equal(hasPhysicalLandmassAnalysis({
    landmassCount: 0,
    weightedLandArea: 0,
    largestComponents: [],
  }), true);
});
