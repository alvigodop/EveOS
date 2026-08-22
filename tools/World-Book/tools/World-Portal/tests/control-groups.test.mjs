import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_GROUPS, DEFAULT_COLLAPSED_GROUPS,
  normalizeCollapsedGroups, planControlGroups,
} from "../assets/js/ui/control-groups.js";

const PANEL_KEYS = [
  "world-library", "refinementMissionPanel", "heightmapForgePanel",
  "landmassPanel", "outerToolsPanel", "orogenLabPanel", "eveGuidedPanel",
  "projection", "hex-conversion", "map-overlays", "geographyPanel",
  "planet-style", "cloud-layer", "lighting", "planet-and-orbital-layers",
  "celestialSystemPanel", "accurate-source",
];

test("the grouped control plan assigns all 17 panels exactly once", () => {
  const plan = planControlGroups(PANEL_KEYS);
  const assigned = plan.groups.flatMap((group) => group.sections);
  assert.equal(CONTROL_GROUPS.length, 4);
  assert.equal(assigned.length, 17);
  assert.equal(new Set(assigned).size, 17);
  assert.deepEqual(new Set(assigned), new Set(PANEL_KEYS));
  assert.deepEqual(plan.unclaimed, []);
});

test("a future unassigned panel remains visible as an unclaimed panel", () => {
  const plan = planControlGroups([...PANEL_KEYS, "future-panel"]);
  assert.deepEqual(plan.unclaimed, ["future-panel"]);
});

test("collapsed group state is sanitized without erasing expand-all", () => {
  assert.deepEqual(normalizeCollapsedGroups(undefined), [...DEFAULT_COLLAPSED_GROUPS]);
  assert.deepEqual(normalizeCollapsedGroups([]), []);
  assert.deepEqual(
    normalizeCollapsedGroups(["group-world", "invalid", "group-world"]),
    ["group-world"],
  );
});
