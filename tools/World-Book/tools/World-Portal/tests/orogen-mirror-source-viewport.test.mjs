import test from "node:test";
import assert from "node:assert/strict";

import {
  OROGEN_MIRROR_SOURCE_CLASS,
  createOrogenMirrorSourceViewport,
  mirrorSourceViewportStyle,
} from "../assets/js/outer/orogen-mirror-source-viewport.js";

test("mirror source viewport style preserves the measured stage rectangle", () => {
  assert.deepEqual(mirrorSourceViewportStyle({ left: 12.5, top: 8, width: 960, height: 720 }), {
    "--orogen-mirror-source-left": "12.5px",
    "--orogen-mirror-source-top": "8px",
    "--orogen-mirror-source-width": "960px",
    "--orogen-mirror-source-height": "720px",
  });
  assert.equal(mirrorSourceViewportStyle({ width: 0, height: 720 }), null);
});

test("binding, resizing, and release keep one source frame with clean lifecycle", async () => {
  let rect = { left: 100, top: 20, width: 1200, height: 800 };
  const properties = new Map();
  const classes = new Set();
  let resizeEvents = 0;
  let observerCallback = null;
  let parked = true;
  const wrapper = {
    closest: () => ({ classList: { contains: () => parked } }),
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
    },
    style: {
      setProperty: (key, value) => properties.set(key, value),
      removeProperty: (key) => properties.delete(key),
    },
  };
  class ChildEvent { constructor(type) { this.type = type; } }
  const frame = {
    parentElement: wrapper,
    contentWindow: {
      Event: ChildEvent,
      dispatchEvent(event) { if (event.type === "resize") resizeEvents += 1; },
    },
  };
  const windowLike = {
    requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    ResizeObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() { observerCallback = null; }
    },
  };
  const sourceViewport = createOrogenMirrorSourceViewport({
    stage: { getBoundingClientRect: () => ({ ...rect }) },
    windowLike,
    settleDelay: 0,
  });

  assert.equal(sourceViewport.bind(frame), true);
  assert.equal(classes.has(OROGEN_MIRROR_SOURCE_CLASS), true);
  assert.equal(properties.get("--orogen-mirror-source-width"), "1200px");
  assert.equal(properties.get("--orogen-mirror-source-height"), "800px");
  assert.equal(sourceViewport.getState().measured, true);

  parked = false;
  observerCallback();
  assert.equal(classes.has(OROGEN_MIRROR_SOURCE_CLASS), false);
  parked = true;
  sourceViewport.refresh();
  assert.equal(classes.has(OROGEN_MIRROR_SOURCE_CLASS), true);

  rect = { left: 4, top: 6, width: 390, height: 844 };
  observerCallback();
  await sourceViewport.stabilize();
  assert.equal(properties.get("--orogen-mirror-source-left"), "4px");
  assert.equal(properties.get("--orogen-mirror-source-height"), "844px");
  assert.ok(resizeEvents >= 2);

  sourceViewport.release();
  assert.equal(classes.has(OROGEN_MIRROR_SOURCE_CLASS), false);
  assert.equal(properties.size, 0);
  assert.deepEqual(sourceViewport.getState(), { bound: false, measured: false, style: null });
});
