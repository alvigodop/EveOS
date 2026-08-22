import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_OROGEN_CAMERA_INPUT_COMMITS,
  PREFERRED_OROGEN_CAMERA_INPUT_CAPABILITY,
  advanceOrogenPinch,
  computeContainedMediaRect,
  createOrogenMirrorInputRelay,
  mapMirrorPoint,
  matchesOrogenMirrorInputUrl,
  orogenMirrorContextKey,
} from "../assets/js/outer/orogen-mirror-input-relay.js";

const COMMIT = "cc2662b4edd52231c4f65d8765f3ef12cd82d9b7";
const BASE_URL = "http://127.0.0.1:8770/";
const CONTEXT = Object.freeze({
  worldKey: "world-a", worldName: "World A", revision: 71,
  syncToken: "sync-a", handoffId: "handoff-a",
  toolId: "orogen", sourceCommit: COMMIT,
});

function frameUrl(context = CONTEXT) {
  const url = new URL("outer/orogen/import.html", BASE_URL);
  for (const [key, value] of Object.entries({
    wpWorldKey: context.worldKey,
    wpWorldName: context.worldName,
    wpSyncRevision: context.revision,
    wpSyncToken: context.syncToken,
    wpHandoffId: context.handoffId,
    wpToolId: context.toolId,
    wpSourceCommit: context.sourceCommit,
  })) url.searchParams.set(key, String(value));
  return url.href;
}

class FakeInputEvent extends Event {
  constructor(type, init = {}) {
    super(type, { bubbles: init.bubbles, cancelable: init.cancelable });
    for (const key of [
      "pointerId", "pointerType", "isPrimary", "button", "buttons", "pressure",
      "width", "height", "clientX", "clientY", "deltaX", "deltaY", "deltaZ",
      "deltaMode", "altKey", "ctrlKey", "metaKey", "shiftKey",
    ]) Object.defineProperty(this, key, { configurable: true, enumerable: true, value: init[key] });
  }
}

class ChildPointerEvent extends FakeInputEvent {}
class ChildWheelEvent extends FakeInputEvent {}

function hostPointer(type, overrides = {}) {
  return new FakeInputEvent(type, {
    bubbles: true, cancelable: true,
    pointerId: 1, pointerType: "mouse", isPrimary: true,
    button: type === "pointerup" ? 0 : 0,
    buttons: type === "pointerup" ? 0 : 1,
    pressure: 0.5, width: 1, height: 1,
    clientX: 300, clientY: 200,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
    ...overrides,
  });
}

function fixture(context = CONTEXT, { allowedCommits } = {}) {
  const surface = new EventTarget();
  const captures = new Set();
  surface.setPointerCapture = (pointerId) => captures.add(pointerId);
  surface.hasPointerCapture = (pointerId) => captures.has(pointerId);
  surface.releasePointerCapture = (pointerId) => captures.delete(pointerId);

  const sourceDocument = {};
  const sourceCanvas = new EventTarget();
  sourceCanvas.ownerDocument = sourceDocument;
  sourceCanvas.isConnected = true;
  sourceCanvas.width = 1600;
  sourceCanvas.height = 800;
  sourceCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
  const originalSetPointerCapture = function originalSetPointerCapture() {};
  const originalReleasePointerCapture = function originalReleasePointerCapture() {};
  sourceCanvas.setPointerCapture = originalSetPointerCapture;
  sourceCanvas.releasePointerCapture = originalReleasePointerCapture;

  const sourceWindow = {
    location: { href: frameUrl(context) },
    PointerEvent: ChildPointerEvent,
    WheelEvent: ChildWheelEvent,
  };
  const frame = { contentWindow: sourceWindow, contentDocument: sourceDocument };
  const media = {
    videoWidth: 1600, videoHeight: 800,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 300 }),
  };
  const relay = createOrogenMirrorInputRelay({
    surface, getMediaElement: () => media, baseUrl: BASE_URL,
    ...(allowedCommits ? { allowedCommits } : {}),
  });
  return {
    surface, sourceCanvas, sourceWindow, sourceDocument, frame, media, relay, captures,
    originalSetPointerCapture, originalReleasePointerCapture,
  };
}

test("camera capability is future-only while the legacy fallback is pinned", () => {
  assert.equal(PREFERRED_OROGEN_CAMERA_INPUT_CAPABILITY, "planet-camera-input@1");
  assert.deepEqual(LEGACY_OROGEN_CAMERA_INPUT_COMMITS, [COMMIT]);
  const state = fixture().relay.getState();
  assert.equal(state.preferredCapability, "planet-camera-input@1");
  assert.equal(Object.hasOwn(state, "capability"), false);
});

test("exact URL validation covers the complete world ownership tuple and origin", () => {
  assert.ok(orogenMirrorContextKey(CONTEXT));
  assert.equal(matchesOrogenMirrorInputUrl(frameUrl(), CONTEXT, BASE_URL), true);
  for (const key of [
    "worldKey", "worldName", "revision", "syncToken", "handoffId", "toolId", "sourceCommit",
  ]) {
    const changed = { ...CONTEXT, [key]: key === "revision" ? 72 : `${CONTEXT[key]}-wrong` };
    assert.equal(matchesOrogenMirrorInputUrl(frameUrl(), changed, BASE_URL), false, key);
  }
  assert.equal(matchesOrogenMirrorInputUrl(
    frameUrl().replace(BASE_URL, "http://localhost:8770/"), CONTEXT, BASE_URL,
  ), false);
});

test("contain geometry maps only the visible media, not its letterbox", () => {
  const contained = computeContainedMediaRect(
    { left: 100, top: 50, width: 400, height: 300 }, 1600, 800,
  );
  assert.deepEqual(contained, { left: 100, top: 100, width: 400, height: 200 });
  assert.deepEqual(mapMirrorPoint(
    { clientX: 300, clientY: 200 }, contained,
    { left: 10, top: 20, width: 800, height: 400 },
  ), { clientX: 410, clientY: 220 });
  assert.equal(mapMirrorPoint(
    { clientX: 300, clientY: 75 }, contained,
    { left: 10, top: 20, width: 800, height: 400 },
  ), null);
});

test("pinch distance becomes bounded Orogen wheel steps with residual precision", () => {
  const spread = advanceOrogenPinch(100, 110);
  assert.deepEqual(spread.wheelDeltas, [-1]);
  assert.ok(spread.residual > 0);
  const squeeze = advanceOrogenPinch(110, 100);
  assert.deepEqual(squeeze.wheelDeltas, [1]);
  assert.equal(advanceOrogenPinch(100, 500, 0, 3).wheelDeltas.length, 3);
});

test("primary drag relays synchronously and restores exact canvas method identities", () => {
  const fx = fixture();
  const received = [];
  fx.sourceCanvas.addEventListener("pointerdown", (event) => {
    received.push(event);
    assert.notEqual(fx.sourceCanvas.setPointerCapture, fx.originalSetPointerCapture);
    fx.sourceCanvas.setPointerCapture(event.pointerId);
  });
  fx.sourceCanvas.addEventListener("pointermove", (event) => {
    received.push(event);
    assert.notEqual(fx.sourceCanvas.releasePointerCapture, fx.originalReleasePointerCapture);
  });
  fx.sourceCanvas.addEventListener("pointerup", (event) => {
    received.push(event);
    fx.sourceCanvas.releasePointerCapture(event.pointerId);
  });

  assert.equal(fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT }).available, true);
  fx.relay.setEnabled(true);
  fx.surface.dispatchEvent(hostPointer("pointerdown"));
  assert.ok(fx.captures.has(1));
  fx.surface.dispatchEvent(hostPointer("pointermove", { clientX: 340, clientY: 220 }));
  fx.surface.dispatchEvent(hostPointer("pointerup", { clientX: 340, clientY: 220 }));

  assert.deepEqual(received.map((event) => event.type), ["pointerdown", "pointermove", "pointerup"]);
  assert.ok(received.every((event) => event instanceof ChildPointerEvent));
  assert.equal(received[0].clientX, 400);
  assert.equal(received[0].clientY, 200);
  assert.equal(fx.sourceCanvas.setPointerCapture, fx.originalSetPointerCapture);
  assert.equal(fx.sourceCanvas.releasePointerCapture, fx.originalReleasePointerCapture);
  assert.equal(fx.captures.size, 0);
});

test("right, middle, and modified drags never reach Orogen", () => {
  const fx = fixture();
  let count = 0;
  fx.sourceCanvas.addEventListener("pointerdown", () => { count += 1; });
  fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.relay.setEnabled(true);
  fx.surface.dispatchEvent(hostPointer("pointerdown", { button: 1, buttons: 4 }));
  fx.surface.dispatchEvent(hostPointer("pointerdown", { button: 2, buttons: 2 }));
  fx.surface.dispatchEvent(hostPointer("pointerdown", { button: 0, buttons: 3 }));
  fx.surface.dispatchEvent(hostPointer("pointerdown", { ctrlKey: true }));
  fx.surface.dispatchEvent(hostPointer("pointerdown", { shiftKey: true }));
  assert.equal(count, 0);
});

test("a modified or no-left-button move cancels a gesture instead of changing the camera", () => {
  const fx = fixture();
  const received = [];
  for (const type of ["pointerdown", "pointermove", "pointercancel"]) {
    fx.sourceCanvas.addEventListener(type, (event) => received.push(event.type));
  }
  fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.relay.setEnabled(true);
  fx.surface.dispatchEvent(hostPointer("pointerdown"));
  fx.surface.dispatchEvent(hostPointer("pointermove", { ctrlKey: true }));
  assert.deepEqual(received, ["pointerdown", "pointercancel"]);
  assert.equal(fx.sourceCanvas.setPointerCapture, fx.originalSetPointerCapture);
});

test("host capture failure happens before source pointerdown and restores the shim", () => {
  const fx = fixture();
  let sourceDown = 0;
  fx.surface.setPointerCapture = () => { throw new Error("capture unavailable"); };
  fx.sourceCanvas.addEventListener("pointerdown", () => { sourceDown += 1; });
  fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.relay.setEnabled(true);
  fx.surface.dispatchEvent(hostPointer("pointerdown"));
  assert.equal(sourceDown, 0);
  assert.equal(fx.relay.getState().interacting, false);
  assert.equal(fx.sourceCanvas.setPointerCapture, fx.originalSetPointerCapture);
  assert.equal(fx.sourceCanvas.releasePointerCapture, fx.originalReleasePointerCapture);
});

test("wheel uses the child realm, permits trackpad Ctrl, and rejects other modifiers", () => {
  const fx = fixture();
  const received = [];
  fx.sourceCanvas.addEventListener("wheel", (event) => received.push(event));
  fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.relay.setEnabled(true);
  const wheel = new FakeInputEvent("wheel", {
    cancelable: true, clientX: 300, clientY: 200,
    deltaX: 0, deltaY: -120, deltaZ: 0, deltaMode: 0, ctrlKey: true,
  });
  fx.surface.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, true);
  assert.equal(received.length, 1);
  assert.ok(received[0] instanceof ChildWheelEvent);
  assert.equal(received[0].ctrlKey, true);
  for (const modifier of ["altKey", "metaKey", "shiftKey"]) {
    const rejected = new FakeInputEvent("wheel", {
      cancelable: true, clientX: 300, clientY: 200, deltaY: -120, [modifier]: true,
    });
    fx.surface.dispatchEvent(rejected);
    assert.equal(rejected.defaultPrevented, false, modifier);
  }
  assert.equal(received.length, 1);

  fx.sourceWindow.location.href = frameUrl({ ...CONTEXT, worldKey: "world-b" });
  const staleWheel = new FakeInputEvent("wheel", {
    cancelable: true, clientX: 300, clientY: 200, deltaY: 120,
  });
  fx.surface.dispatchEvent(staleWheel);
  assert.equal(staleWheel.defaultPrevented, false);
  assert.equal(received.length, 1);
});

test("second touch cancels rotation and converts pinch to wheel without a second source pointer", () => {
  const fx = fixture();
  const pointerTypes = [];
  const wheelDeltas = [];
  for (const type of ["pointerdown", "pointercancel"]) {
    fx.sourceCanvas.addEventListener(type, (event) => pointerTypes.push(event.type));
  }
  fx.sourceCanvas.addEventListener("wheel", (event) => wheelDeltas.push(event.deltaY));
  fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.relay.setEnabled(true);
  fx.surface.dispatchEvent(hostPointer("pointerdown", {
    pointerId: 10, pointerType: "touch", clientX: 200, clientY: 200,
  }));
  fx.surface.dispatchEvent(hostPointer("pointerdown", {
    pointerId: 11, pointerType: "touch", isPrimary: false, clientX: 300, clientY: 200,
  }));
  assert.equal(fx.captures.has(10), true);
  assert.equal(fx.captures.has(11), true);
  fx.surface.dispatchEvent(hostPointer("pointermove", {
    pointerId: 11, pointerType: "touch", isPrimary: false, clientX: 310, clientY: 200,
  }));
  assert.deepEqual(pointerTypes, ["pointerdown", "pointercancel"]);
  assert.deepEqual(wheelDeltas, [-1]);
  assert.equal(fx.sourceCanvas.setPointerCapture, fx.originalSetPointerCapture);
});

test("frame/world invalidation stops a live gesture and restores native methods", () => {
  const fx = fixture();
  const received = [];
  for (const type of ["pointerdown", "pointermove", "pointercancel"]) {
    fx.sourceCanvas.addEventListener(type, (event) => received.push(event.type));
  }
  fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context: CONTEXT });
  fx.relay.setEnabled(true);
  fx.surface.dispatchEvent(hostPointer("pointerdown"));
  fx.sourceWindow.location.href = frameUrl({ ...CONTEXT, revision: 72 });
  fx.surface.dispatchEvent(hostPointer("pointermove", { clientX: 350 }));
  assert.deepEqual(received, ["pointerdown"]);
  assert.equal(fx.relay.getState().interacting, false);
  assert.equal(fx.sourceCanvas.setPointerCapture, fx.originalSetPointerCapture);
  assert.equal(fx.sourceCanvas.releasePointerCapture, fx.originalReleasePointerCapture);
});

test("an unaudited commit keeps visual mirroring possible but disables input", () => {
  const context = { ...CONTEXT, sourceCommit: "1".repeat(40) };
  const fx = fixture(context);
  const state = fx.relay.bind({ frame: fx.frame, sourceCanvas: fx.sourceCanvas, context });
  assert.equal(state.available, false);
  assert.match(state.reason, /not audited/);
  assert.equal(fx.relay.setEnabled(true).enabled, false);
});
