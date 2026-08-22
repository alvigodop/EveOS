import test from "node:test";
import assert from "node:assert/strict";
import {
  OROGEN_INITIAL_CENTER_DIRECTION,
  advanceOrogenViewDirection,
  createOrogenViewSync,
  directionToOrogenSpherical,
  normalizePlanetDirection,
  orogenSphericalToDirection,
  planOrogenViewAlignment,
} from "../assets/js/outer/orogen-view-sync.js";

const COMMIT = "cc2662b4edd52231c4f65d8765f3ef12cd82d9b7";
const BASE_URL = "http://127.0.0.1:8770/";
const CONTEXT = Object.freeze({
  worldKey: "world-a",
  worldName: "World A",
  revision: 41,
  syncToken: "sync-token-a",
  handoffId: "handoff-a",
  toolId: "orogen",
  sourceCommit: COMMIT,
});

function boundUrl(context = CONTEXT) {
  const url = new URL("outer/orogen/import.html", BASE_URL);
  url.searchParams.set("wpWorldKey", context.worldKey);
  url.searchParams.set("wpWorldName", context.worldName);
  url.searchParams.set("wpSyncRevision", String(context.revision));
  url.searchParams.set("wpSyncToken", context.syncToken);
  url.searchParams.set("wpHandoffId", context.handoffId);
  url.searchParams.set("wpToolId", context.toolId);
  url.searchParams.set("wpSourceCommit", context.sourceCommit);
  return url.href;
}

class FakePointerEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

class FakeCanvas {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.isConnected = true;
    this.clientHeight = 600;
    this.listeners = new Map();
    this.setPointerCapture = function originalSetPointerCapture() {};
    this.releasePointerCapture = function originalReleasePointerCapture() {};
  }

  addEventListener(type, listener, capture = false) {
    const key = `${type}:${Boolean(capture)}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(listener);
  }

  removeEventListener(type, listener, capture = false) {
    this.listeners.get(`${type}:${Boolean(capture)}`)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const capture of [true, false]) {
      for (const listener of this.listeners.get(`${event.type}:${capture}`) || []) {
        listener.call(this, event);
      }
    }
    return true;
  }

  getBoundingClientRect() {
    return { left: 50, top: 25, width: 1000, height: 600 };
  }
}

function fixture(options = {}) {
  const sourceDocument = {};
  const sourceWindow = {
    location: { href: boundUrl() },
    PointerEvent: FakePointerEvent,
  };
  const frame = { contentWindow: sourceWindow, contentDocument: sourceDocument };
  const sourceCanvas = new FakeCanvas(sourceDocument);
  const applied = [];
  const sync = createOrogenViewSync({
    baseUrl: BASE_URL,
    getPortalView: options.getPortalView || (() => ({ centerDirection: [0, 0, 1] })),
    applyPortalView: options.applyPortalView || ((view) => applied.push(view)),
    allowedCommits: options.allowedCommits,
  });
  return { sync, frame, sourceCanvas, sourceWindow, sourceDocument, applied };
}

function pointer(type, overrides = {}) {
  return new FakePointerEvent(type, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    clientX: 200,
    clientY: 200,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

function closeDirection(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, 3);
  for (let index = 0; index < 3; index += 1) {
    assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance,
      `component ${index}: ${actual[index]} != ${expected[index]}`);
  }
}

test("direction and Orogen spherical conversions round-trip", () => {
  const direction = normalizePlanetDirection([0.3, -0.4, 0.8]);
  closeDirection(orogenSphericalToDirection(directionToOrogenSpherical(direction)), direction);
  assert.throws(() => normalizePlanetDirection([0, 0, 0]), /zero length/);
  assert.throws(() => normalizePlanetDirection([0, NaN, 1]), /finite/);
});

test("pointer deltas follow OrbitControls azimuth and polar conventions", () => {
  const height = 600;
  const moved = advanceOrogenViewDirection([0, 0, 1], 150, -75, height);
  const spherical = directionToOrogenSpherical(moved);
  assert.ok(Math.abs(spherical.azimuth - (-Math.PI / 2)) < 1e-10);
  assert.ok(Math.abs(spherical.polar - (Math.PI * 3 / 4)) < 1e-10);

  const clamped = directionToOrogenSpherical(
    advanceOrogenViewDirection([0, 0, 1], 0, 1e9, height),
  );
  assert.ok(clamped.polar > 0);
  assert.ok(clamped.polar < 1e-5);
});

test("alignment takes the shortest seam path and bounds every move", () => {
  const current = orogenSphericalToDirection({ azimuth: Math.PI - 0.1, polar: 1.2 });
  const target = orogenSphericalToDirection({ azimuth: -Math.PI + 0.1, polar: 2.0 });
  const plan = planOrogenViewAlignment(current, target, 800, { maxStepPixels: 24 });
  assert.ok(Math.abs(plan.deltaX) < 40, "alignment should cross the seam, not orbit the long way");
  assert.ok(plan.moves.length > 1);
  assert.ok(plan.moves.every((move) => Math.hypot(move.deltaX, move.deltaY) <= 24 + 1e-10));
  closeDirection(
    advanceOrogenViewDirection(current, plan.deltaX, plan.deltaY, 800),
    target,
  );
});

test("exact audited canvas binding tracks direct and synthetic primary drags", () => {
  const fx = fixture();
  const bound = fx.sync.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  assert.equal(bound.bound, true);
  closeDirection(bound.centerDirection, OROGEN_INITIAL_CENTER_DIRECTION);

  fx.sourceCanvas.dispatchEvent(pointer("pointerdown"));
  fx.sourceCanvas.dispatchEvent(pointer("pointermove", { clientX: 320, clientY: 140 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointerup", { clientX: 320, clientY: 140 }));

  const expected = advanceOrogenViewDirection(
    OROGEN_INITIAL_CENTER_DIRECTION, 120, -60, fx.sourceCanvas.clientHeight,
  );
  closeDirection(fx.sync.getState().centerDirection, expected);
  assert.equal(fx.sync.getState().viewRevision, 1);
});

test("modified, secondary, and interrupted gestures cannot rotate tracked state", () => {
  const fx = fixture();
  fx.sync.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  const initial = fx.sync.getState().centerDirection;

  fx.sourceCanvas.dispatchEvent(pointer("pointerdown", { button: 2, buttons: 2 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointermove", { clientX: 500, buttons: 2 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointerup", { clientX: 500 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointerdown", { isPrimary: false, pointerId: 9 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointermove", { isPrimary: false, pointerId: 9, clientX: 500 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointerup", { isPrimary: false, pointerId: 9 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointerdown"));
  fx.sourceCanvas.dispatchEvent(pointer("pointermove", { clientX: 500, shiftKey: true }));
  fx.sourceCanvas.dispatchEvent(pointer("pointermove", { clientX: 600 }));
  closeDirection(fx.sync.getState().centerDirection, initial);
  assert.equal(fx.sync.getState().viewRevision, 0);
});

test("live sync applies tracked Orogen direction through the injected portal callback", () => {
  const fx = fixture();
  fx.sync.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.sync.setLivePortalSync(true);
  assert.equal(fx.applied.length, 1);

  fx.sourceCanvas.dispatchEvent(pointer("pointerdown"));
  fx.sourceCanvas.dispatchEvent(pointer("pointermove", { clientX: 260 }));
  fx.sourceCanvas.dispatchEvent(pointer("pointerup", { clientX: 260 }));
  assert.equal(fx.applied.length, 2);
  closeDirection(fx.applied.at(-1).centerDirection, fx.sync.getState().centerDirection);
  assert.equal(fx.applied.at(-1).worldKey, "world-a");
  assert.equal(fx.applied.at(-1).sourceCommit, COMMIT);
});

test("alignment uses child-realm pointer events and restores exact capture methods", () => {
  const target = normalizePlanetDirection([0.7, -0.2, 0.6]);
  const fx = fixture({ getPortalView: () => ({ centerDirection: target }) });
  const originalSet = fx.sourceCanvas.setPointerCapture;
  const originalRelease = fx.sourceCanvas.releasePointerCapture;
  const received = [];
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    fx.sourceCanvas.addEventListener(type, (event) => received.push({
      type: event.type,
      constructor: event.constructor,
      x: event.clientX,
      y: event.clientY,
    }));
  }
  fx.sync.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  const result = fx.sync.alignOrogenToPortal({ maxStepPixels: 18 });

  assert.equal(result.aligned, true);
  assert.equal(received[0].type, "pointerdown");
  assert.equal(received.at(-1).type, "pointerup");
  assert.ok(received.every((event) => event.constructor === FakePointerEvent));
  for (let index = 1; index < received.length - 1; index += 1) {
    assert.ok(Math.hypot(
      received[index].x - received[index - 1].x,
      received[index].y - received[index - 1].y,
    ) <= 18 + 1e-10);
  }
  assert.equal(fx.sourceCanvas.setPointerCapture, originalSet);
  assert.equal(fx.sourceCanvas.releasePointerCapture, originalRelease);
  closeDirection(fx.sync.getState().centerDirection, target);
});

test("unaudited or stale bindings fail closed and remove source listeners", () => {
  const fx = fixture({ allowedCommits: ["a".repeat(40)] });
  const rejected = fx.sync.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  assert.equal(rejected.bound, false);
  assert.match(rejected.reason, /not audited/);

  const allowed = fixture();
  allowed.sync.bind({ frame: allowed.frame, sourceCanvas: allowed.sourceCanvas, context: CONTEXT });
  allowed.sourceWindow.location.href = boundUrl({ ...CONTEXT, worldKey: "world-b" });
  allowed.sourceCanvas.dispatchEvent(pointer("pointerdown"));
  const stale = allowed.sync.getState();
  assert.equal(stale.bound, false);
  assert.equal(stale.worldKey, null);
  assert.match(stale.reason, /stale/);
  assert.equal(allowed.sourceCanvas.listeners.get("pointerdown:true").size, 0);
});
