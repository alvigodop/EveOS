import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentPlan, validateEvePlan } from "../assets/js/eve/eve-plan-validator.js";
import {
  AGENT_PLAN_PROTOCOL, EVE_PROTOCOL_VERSION, LEGACY_EVE_PLAN_PROTOCOL,
} from "../assets/js/eve/eve-capabilities.js";
import {
  createLayerRecord, ensureLayerAssets, upsertLayer,
} from "../assets/js/world/world-layer-store.js";

const WORLD_ID = "test-world";

function makeRecord(layers = []) {
  const record = { id: WORLD_ID, name: "Test World", assets: {} };
  ensureLayerAssets(record);
  for (const layer of layers) {
    upsertLayer(record, createLayerRecord({ worldId: WORLD_ID, ...layer }));
  }
  return record;
}

function plan(overrides = {}) {
  return {
    protocol: AGENT_PLAN_PROTOCOL,
    version: EVE_PROTOCOL_VERSION,
    worldId: WORLD_ID,
    commands: [{ id: "c1", capability: "world.saveCheckpoint", parameters: { reason: "checkpoint" } }],
    ...overrides,
  };
}

const errorText = (result) => result.errors.join(" | ");

test("a minimal well-formed plan validates", () => {
  const result = validateEvePlan(plan(), { record: makeRecord() });
  assert.equal(result.valid, true, errorText(result));
  assert.equal(result.commandCount, 1);
  assert.equal(result.riskLevel, "low");
});

test("validateAgentPlan is the canonical name for the same validator", () => {
  assert.equal(validateAgentPlan, validateEvePlan);
});

test("the legacy eve-plan protocol alias is still accepted", () => {
  const result = validateEvePlan(plan({ protocol: LEGACY_EVE_PLAN_PROTOCOL }), { record: makeRecord() });
  assert.equal(result.valid, true, errorText(result));
});

test("an unknown protocol is rejected", () => {
  const result = validateEvePlan(plan({ protocol: "some-other-plan" }), { record: makeRecord() });
  assert.equal(result.valid, false);
  assert.ok(/Unsupported plan protocol/.test(errorText(result)));
});

test("a plan for another world is rejected", () => {
  const result = validateEvePlan(plan({ worldId: "different-world" }), { record: makeRecord() });
  assert.ok(/targets a different world/.test(errorText(result)));
});

test("an unadvertised capability is rejected", () => {
  const result = validateEvePlan(
    plan({ commands: [{ id: "c1", capability: "shell.exec", parameters: {} }] }),
    { record: makeRecord() },
  );
  assert.ok(/Unsupported capability: shell\.exec/.test(errorText(result)));
});

test("a reference to a layer the world does not own is rejected", () => {
  const result = validateEvePlan(
    plan({ commands: [{ id: "c1", capability: "layers.setCanonicalMask", inputs: { layerId: "ghost" } }] }),
    { record: makeRecord() },
  );
  assert.ok(/references missing layer ghost/.test(errorText(result)));
});

test("a reference to a layer the world does own is accepted", () => {
  const record = makeRecord([{ id: "mask-1", name: "Mask", type: "land-mask" }]);
  const result = validateEvePlan(
    plan({ commands: [{ id: "c1", capability: "layers.setCanonicalMask", inputs: { layerId: "mask-1" } }] }),
    { record },
  );
  assert.equal(result.valid, true, errorText(result));
  assert.equal(result.requiresConfirmation, true, "canonical promotion must require confirmation");
  assert.equal(result.riskLevel, "high");
});

test("duplicate command IDs are rejected", () => {
  const result = validateEvePlan(plan({
    commands: [
      { id: "same", capability: "world.saveCheckpoint" },
      { id: "same", capability: "world.saveCheckpoint" },
    ],
  }), { record: makeRecord() });
  assert.ok(/Duplicate command ID: same/.test(errorText(result)));
});

test("a missing required input is reported", () => {
  const result = validateEvePlan(
    plan({ commands: [{ id: "c1", capability: "layers.markProvisional", inputs: {} }] }),
    { record: makeRecord() },
  );
  assert.ok(/missing required input layerId/.test(errorText(result)));
});

test("a result reference must point at an earlier command", () => {
  const forward = validateEvePlan(plan({
    commands: [
      { id: "first", capability: "layers.markProvisional", inputs: { layerId: "$result.second.generatedLayerId" } },
      { id: "second", capability: "heightmapForge.regenerateMask" },
    ],
  }), { record: makeRecord() });
  assert.ok(/must target an earlier command/.test(errorText(forward)));

  const backward = validateEvePlan(plan({
    commands: [
      { id: "first", capability: "heightmapForge.regenerateMask" },
      { id: "second", capability: "layers.markProvisional", inputs: { layerId: "$result.first.generatedLayerId" } },
    ],
  }), { record: makeRecord() });
  assert.equal(backward.valid, true, errorText(backward));
});

test("a result reference to an unknown command is rejected", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "c1", capability: "layers.markProvisional", inputs: { layerId: "$result.nobody.generatedLayerId" } }],
  }), { record: makeRecord() });
  assert.ok(/targets unknown command nobody/.test(errorText(result)));
});

test("out-of-range and wrong-typed parameters are rejected", () => {
  const range = validateEvePlan(plan({
    commands: [{ id: "c1", capability: "orogen.finalizeInput", parameters: { coastFloor: 900 } }],
  }), { record: makeRecord() });
  assert.ok(/coastFloor must be between 1 and 255/.test(errorText(range)));

  const type = validateEvePlan(plan({
    commands: [{ id: "c1", capability: "orogen.finalizeInput", parameters: { strictBinaryMask: "yes" } }],
  }), { record: makeRecord() });
  assert.ok(/strictBinaryMask must be boolean/.test(errorText(type)));
});

test("an unknown parameter name is rejected", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "c1", capability: "orogen.finalizeInput", parameters: { madeUpKnob: 3 } }],
  }), { record: makeRecord() });
  assert.ok(/unknown parameter madeUpKnob/.test(errorText(result)));
});

test("Orogen output must stay exactly 2:1", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "c1", capability: "orogen.finalizeInput", parameters: { outputWidth: 4096, outputHeight: 4096 } }],
  }), { record: makeRecord() });
  assert.ok(/outputWidth must equal outputHeight/.test(errorText(result)));
});

test("an understated risk level produces a warning, not an error", () => {
  const record = makeRecord([{ id: "mask-1", name: "Mask", type: "land-mask" }]);
  const result = validateEvePlan(plan({
    riskLevel: "low",
    commands: [{ id: "c1", capability: "layers.setCanonicalMask", inputs: { layerId: "mask-1" } }],
  }), { record });
  assert.equal(result.valid, true, errorText(result));
  assert.ok(result.warnings.some((warning) => /require high risk/.test(warning)));
});

test("a stale context hash warns without invalidating the plan", () => {
  const result = validateEvePlan(
    plan({ basedOnContextHash: "old-hash" }),
    { record: makeRecord(), contextHash: "current-hash" },
  );
  assert.equal(result.valid, true, errorText(result));
  assert.ok(result.warnings.some((warning) => /older world context/.test(warning)));
});

// --- Unsafe-content scanning -------------------------------------------------
// The scan covers command inputs and parameters. Free-text plan fields are
// prose and must survive intact; see PROSE_KEYS in the validator.

test("executable content in parameters is rejected and the path is named", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "risky", capability: "orogen.finalizeInput", parameters: { maskLayerId: "<script>alert(1)</script>" } }],
  }), { record: makeRecord() });
  assert.equal(result.valid, false);
  assert.ok(/risky\.parameters\.maskLayerId/.test(errorText(result)), errorText(result));
  assert.ok(/executable-like content/.test(errorText(result)));
});

test("a filesystem path in inputs is rejected", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "risky", capability: "layers.markProvisional", inputs: { layerId: "../../etc/passwd" } }],
  }), { record: makeRecord() });
  assert.ok(/risky\.inputs\.layerId/.test(errorText(result)));
  assert.ok(/filesystem path/.test(errorText(result)));
});

test("a network target in a non-prose parameter is rejected", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "risky", capability: "refinement.generateConsensusMask", parameters: { mode: "https://evil.test/x" } }],
  }), { record: makeRecord() });
  assert.ok(/network action target/.test(errorText(result)));
});

test("a disallowed field name inside parameters is rejected", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "risky", capability: "mission.create", parameters: { scope: { onload: "x", actionUrl: "y" } } }],
  }), { record: makeRecord() });
  assert.ok(/disallowed field name/.test(errorText(result)));
});

test("unsafe content nested inside an array is still found", () => {
  const result = validateEvePlan(plan({
    commands: [{ id: "risky", capability: "mission.create", parameters: { maskEvidenceLayerIds: ["ok", "C:/Windows/system32"] } }],
  }), { record: makeRecord() });
  assert.ok(/filesystem path/.test(errorText(result)));
  assert.ok(/\[1\]/.test(errorText(result)), errorText(result));
});

test("REGRESSION: prose plan fields may contain URLs and paths", () => {
  const result = validateEvePlan(plan({
    title: "Rebuild coastline (see C:/reference/notes.txt)",
    summary: "Cross-checked against https://www.naturalearthdata.com before planning.",
    notes: ["Compared with ../previous-pass output.", "Source: https://example.test/atlas"],
    commands: [{
      id: "c1",
      capability: "world.saveCheckpoint",
      parameters: { reason: "checkpoint" },
      reason: "Matches the reference at https://example.test/atlas and the ../baseline export.",
      expectedResult: "A checkpoint written to C:/Users/world.json",
    }],
  }), { record: makeRecord() });
  assert.equal(result.valid, true, errorText(result));
});

test("REGRESSION: descriptive string parameters may contain URLs", () => {
  const record = makeRecord([{ id: "layer-1", name: "Evidence", type: "heightmap" }]);
  const trust = validateEvePlan(plan({
    commands: [{
      id: "c1",
      capability: "evidence.setLayerTrust",
      inputs: { layerId: "layer-1" },
      parameters: { status: "anomalous-useful", notes: "Ridges match https://example.test/dem" },
    }],
  }), { record });
  assert.equal(trust.valid, true, errorText(trust));

  const mission = validateEvePlan(plan({
    commands: [{
      id: "c1",
      capability: "mission.create",
      parameters: { name: "Pass 3 (../baseline)", reason: "Follows https://example.test/plan" },
    }],
  }), { record });
  assert.equal(mission.valid, true, errorText(mission));
});
