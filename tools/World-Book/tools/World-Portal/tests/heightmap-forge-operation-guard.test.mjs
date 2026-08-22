import test from "node:test";
import assert from "node:assert/strict";

import {
  createHeightmapOperationGuard, isHeightmapOperationCancelled,
} from "../assets/js/heightmap/heightmap-forge-operation-guard.js";

test("Forge operation guard rejects an A to B to A world race", () => {
  let worldId = "world-a";
  let sourceRevision = 1;
  const guard = createHeightmapOperationGuard({
    getWorldId: () => worldId,
    getSourceRevision: () => sourceRevision,
  });
  const oldA = guard.begin("send", worldId);
  worldId = "world-b";
  guard.advanceWorld();
  worldId = "world-a";
  guard.advanceWorld();
  assert.equal(guard.isCurrent(oldA), false);
  assert.throws(() => guard.assertCurrent(oldA), isHeightmapOperationCancelled);
});

test("Forge operation guard rejects superseded work and a reloaded source", () => {
  let worldId = "world-a";
  let sourceRevision = 4;
  const guard = createHeightmapOperationGuard({
    getWorldId: () => worldId,
    getSourceRevision: () => sourceRevision,
  });
  const firstPreview = guard.begin("preview", worldId);
  const secondPreview = guard.begin("preview", worldId);
  assert.equal(guard.isCurrent(firstPreview), false);
  assert.equal(guard.isCurrent(secondPreview), true);
  const pendingSave = guard.begin("save", worldId);
  sourceRevision += 1;
  assert.equal(guard.isCurrent(pendingSave), false);
});
