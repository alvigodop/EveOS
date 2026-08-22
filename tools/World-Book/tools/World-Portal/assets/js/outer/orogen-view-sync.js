import { LEGACY_OROGEN_CAMERA_INPUT_COMMITS, matchesOrogenMirrorInputUrl,
  orogenMirrorContextKey } from "./orogen-mirror-input-relay.js";
const TAU = Math.PI * 2;
const DEFAULT_POLAR_EPSILON = 1e-6;
const DEFAULT_MAX_STEP_PIXELS = 72;
const DEFAULT_MAX_ALIGNMENT_MOVES = 256;
// The audited Orogen import view starts at camera.position = [0, 0.4, 2.8]
// with an origin target. This is a local geographic direction, not a retained
// Orogen camera or module reference.
export const OROGEN_INITIAL_CENTER_DIRECTION = Object.freeze([
  0, 0.1414213562373095, 0.9899494936611665,
]);
function finite(value) { return Number.isFinite(Number(value)); }
function vectorParts(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return [Number(value[0]), Number(value[1]), Number(value[2])];
  }
  if (value && typeof value === "object") return [Number(value.x), Number(value.y), Number(value.z)];
  return [NaN, NaN, NaN];
}
export function normalizePlanetDirection(value) {
  const [x, y, z] = vectorParts(value);
  if (![x, y, z].every(Number.isFinite)) throw new TypeError(
    "Planet view direction must contain three finite values.",
  );
  const length = Math.hypot(x, y, z);
  if (length <= Number.EPSILON) throw new RangeError("Planet view direction cannot be zero length.");
  return [x / length, y / length, z / length];
}
export function wrapOrogenAzimuth(value) {
  if (!finite(value)) throw new TypeError("Azimuth must be finite.");
  let wrapped = (Number(value) + Math.PI) % TAU;
  if (wrapped < 0) wrapped += TAU;
  return wrapped - Math.PI;
}
export function directionToOrogenSpherical(direction) {
  const [x, y, z] = normalizePlanetDirection(direction);
  return { azimuth: wrapOrogenAzimuth(Math.atan2(x, z)),
    polar: Math.acos(Math.max(-1, Math.min(1, y))) };
}
export function orogenSphericalToDirection({ azimuth, polar } = {}) {
  if (!finite(azimuth) || !finite(polar)) throw new TypeError(
    "Orogen spherical view requires finite azimuth and polar angles.",
  );
  const safePolar = Math.max(0, Math.min(Math.PI, Number(polar)));
  const sinPolar = Math.sin(safePolar);
  return normalizePlanetDirection([sinPolar * Math.sin(Number(azimuth)),
    Math.cos(safePolar), sinPolar * Math.cos(Number(azimuth))]);
}
export function shortestOrogenAzimuthDelta(from, to) {
  return wrapOrogenAzimuth(Number(to) - Number(from));
}
export function advanceOrogenViewDirection(direction, deltaX, deltaY, viewportHeight,
  { rotateSpeed = 1, polarEpsilon = DEFAULT_POLAR_EPSILON } = {},
) {
  const height = Number(viewportHeight);
  const speed = Number(rotateSpeed);
  const epsilon = Math.max(Number.EPSILON, Number(polarEpsilon));
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(speed) || speed <= 0
    || !Number.isFinite(epsilon) || epsilon >= Math.PI / 2) {
    throw new RangeError("Orogen view advancement requires valid viewport and rotation limits.");
  }
  const spherical = directionToOrogenSpherical(direction);
  const radiansPerPixel = TAU * speed / height;
  const azimuth = wrapOrogenAzimuth(spherical.azimuth - ((Number(deltaX) || 0) * radiansPerPixel));
  const polar = Math.max(epsilon,
    Math.min(Math.PI - epsilon, spherical.polar - ((Number(deltaY) || 0) * radiansPerPixel)));
  return orogenSphericalToDirection({ azimuth, polar });
}
export function planOrogenViewAlignment(currentDirection, targetDirection, viewportHeight, {
  rotateSpeed = 1, maxStepPixels = DEFAULT_MAX_STEP_PIXELS,
  maxMoves = DEFAULT_MAX_ALIGNMENT_MOVES,
} = {}) {
  const height = Number(viewportHeight);
  const speed = Number(rotateSpeed);
  const stepLimit = Number(maxStepPixels);
  const moveLimit = Math.max(1, Math.floor(Number(maxMoves)));
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(speed) || speed <= 0
    || !Number.isFinite(stepLimit) || stepLimit <= 0 || !Number.isFinite(moveLimit)) {
    throw new RangeError("Orogen alignment requires valid viewport and move limits.");
  }
  const current = directionToOrogenSpherical(currentDirection);
  const target = directionToOrogenSpherical(targetDirection);
  const radiansPerPixel = TAU * speed / height;
  const deltaAzimuth = shortestOrogenAzimuthDelta(current.azimuth, target.azimuth);
  const deltaPolar = target.polar - current.polar;
  const deltaX = -deltaAzimuth / radiansPerPixel;
  const deltaY = -deltaPolar / radiansPerPixel;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 1e-7) {
    return { deltaX: 0, deltaY: 0, moves: [],
      targetDirection: normalizePlanetDirection(targetDirection) };
  }
  const count = Math.ceil(distance / stepLimit);
  if (count > moveLimit) {
    throw new RangeError(`Orogen alignment needs ${count} moves; the safe limit is ${moveLimit}.`);
  }
  return { deltaX, deltaY,
    moves: Array.from({ length: count }, () => ({ deltaX: deltaX / count, deltaY: deltaY / count })),
    targetDirection: normalizePlanetDirection(targetDirection) };
}
function contextCommit(context) { return String(context?.sourceCommit || "").toLowerCase(); }
function unmodifiedPrimaryStart(event) {
  return event?.button === 0 && event?.buttons === 1 && event?.isPrimary !== false
    && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
function unmodifiedPrimaryMove(event) {
  return event?.buttons === 1 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
function canvasCssHeight(canvas) {
  const clientHeight = Number(canvas?.clientHeight);
  if (Number.isFinite(clientHeight) && clientHeight > 0) return clientHeight;
  const height = Number(canvas?.getBoundingClientRect?.().height);
  return Number.isFinite(height) && height > 0 ? height : 0;
}
function captureMethodShim(canvas) {
  const records = ["setPointerCapture", "releasePointerCapture"].map((name) => ({
    name,
    hadOwn: Object.prototype.hasOwnProperty.call(canvas, name),
    descriptor: Object.getOwnPropertyDescriptor(canvas, name),
  }));
  try {
    for (const { name } of records) {
      Object.defineProperty(canvas, name, { configurable: true, writable: true, value() {} });
    }
  } catch (error) {
    for (const record of records) {
      if (record.hadOwn) Object.defineProperty(canvas, record.name, record.descriptor);
      else delete canvas[record.name];
    }
    throw error;
  }
  return () => {
    for (const record of records) {
      if (record.hadOwn) Object.defineProperty(canvas, record.name, record.descriptor);
      else delete canvas[record.name];
    }
  };
}
function pointerInit(pointerId, clientX, clientY, buttons) {
  return {
    bubbles: true, cancelable: true, composed: true, pointerId, pointerType: "mouse",
    isPrimary: true, button: 0, buttons, pressure: buttons ? 0.5 : 0,
    width: 1, height: 1, clientX, clientY,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
  };
}
function portalDirection(value) { return normalizePlanetDirection(value?.centerDirection || value); }
export function createOrogenViewSync({
  baseUrl = globalThis.location?.href || "http://localhost/",
  allowedCommits = LEGACY_OROGEN_CAMERA_INPUT_COMMITS,
  initialDirection = OROGEN_INITIAL_CENTER_DIRECTION,
  getPortalView = () => null, applyPortalView = () => {}, onStateChange,
} = {}) {
  const allowed = new Set((allowedCommits || []).map((commit) => String(commit).toLowerCase()));
  const resetDirection = normalizePlanetDirection(initialDirection);
  let centerDirection = [...resetDirection];
  let binding = null, bindingGeneration = 0, viewRevision = 0, activePointer = null;
  let livePortalSync = false, syntheticPointerId = 700000;
  let reason = "Orogen view synchronization is not bound.";
  let lastOrigin = "reset";
  function snapshot() {
    return {
      bound: Boolean(binding),
      available: Boolean(binding && allowed.has(contextCommit(binding.context))),
      bindingGeneration, contextKey: binding?.contextKey || null,
      worldKey: binding?.context.worldKey || null, sourceCommit: binding?.context.sourceCommit || null,
      centerDirection: [...centerDirection], viewRevision, interacting: Boolean(activePointer),
      livePortalSync, lastOrigin, reason,
    };
  }

  function publish() {
    const state = snapshot();
    onStateChange?.(state);
    return state;
  }

  function removeSourceListeners(current) {
    if (!current?.sourceCanvas) return;
    for (const [type, listener] of [["pointerdown", onSourcePointerDown],
      ["pointermove", onSourcePointerMove], ["pointerup", onSourcePointerEnd],
      ["pointercancel", onSourcePointerEnd], ["lostpointercapture", onSourcePointerEnd]]) {
      current.sourceCanvas.removeEventListener?.(type, listener, true);
    }
  }

  function clearBinding(message, { reset = true, notify = true } = {}) {
    removeSourceListeners(binding);
    binding = null;
    bindingGeneration += 1;
    activePointer = null;
    livePortalSync = false;
    if (reset) {
      centerDirection = [...resetDirection]; viewRevision = 0; lastOrigin = "reset";
    }
    reason = message;
    return notify ? publish() : snapshot();
  }

  function bindingIsCurrent(current = binding) {
    if (!current) return false;
    try {
      const { frame, sourceWindow, sourceDocument, sourceCanvas, context, generation } = current;
      return generation === bindingGeneration
        && frame.contentWindow === sourceWindow
        && frame.contentDocument === sourceDocument
        && sourceCanvas.ownerDocument === sourceDocument
        && sourceCanvas.isConnected
        && matchesOrogenMirrorInputUrl(sourceWindow.location.href, context, baseUrl)
        && allowed.has(contextCommit(context));
    } catch {
      return false;
    }
  }

  function currentBinding() {
    if (bindingIsCurrent()) return binding;
    if (binding) clearBinding("The Orogen view binding became stale and was cleared.");
    return null;
  }

  function viewPayload(origin) {
    return {
      centerDirection: [...centerDirection], viewRevision, bindingGeneration,
      worldKey: binding?.context.worldKey || null,
      sourceCommit: binding?.context.sourceCommit || null, origin,
    };
  }

  function applyTrackedView(origin) {
    if (!currentBinding()) return false;
    try {
      applyPortalView(viewPayload(origin));
      return true;
    } catch (error) {
      livePortalSync = false;
      reason = `World Portal rejected the Orogen view: ${error?.message || error}`;
      return false;
    }
  }

  function commitTrackedDirection(next, origin) {
    centerDirection = normalizePlanetDirection(next);
    viewRevision += 1;
    lastOrigin = origin;
    reason = "Orogen and World Portal view direction is tracked.";
    if (livePortalSync) applyTrackedView(origin);
    return publish();
  }

  function onSourcePointerDown(event) {
    if (!currentBinding()) return;
    if (activePointer && event.pointerId !== activePointer.pointerId) {
      activePointer = null;
      reason = "Multi-pointer input is not treated as a rotation gesture.";
      publish();
      return;
    }
    if (!unmodifiedPrimaryStart(event) || activePointer) return;
    activePointer = { pointerId: event.pointerId,
      clientX: Number(event.clientX), clientY: Number(event.clientY) };
    reason = "Tracking Orogen camera rotation.";
    publish();
  }

  function onSourcePointerMove(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    const current = currentBinding();
    if (!current) return;
    if (!unmodifiedPrimaryMove(event)) {
      activePointer = null;
      reason = "Modified or non-primary movement was ignored.";
      publish();
      return;
    }
    const clientX = Number(event.clientX);
    const clientY = Number(event.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const deltaX = clientX - activePointer.clientX;
    const deltaY = clientY - activePointer.clientY;
    activePointer.clientX = clientX;
    activePointer.clientY = clientY;
    if (!deltaX && !deltaY) return;
    const height = canvasCssHeight(current.sourceCanvas);
    if (!height) return;
    commitTrackedDirection(advanceOrogenViewDirection(centerDirection, deltaX, deltaY, height),
      "orogen-canvas-drag");
  }

  function onSourcePointerEnd(event) {
    if (!activePointer || event.pointerId !== activePointer.pointerId) return;
    activePointer = null;
    reason = "Orogen camera rotation is ready to synchronize.";
    publish();
  }

  function bind({ frame, sourceCanvas, context } = {}) {
    clearBinding("Preparing an exact Orogen view binding.", { notify: false });
    const contextKey = orogenMirrorContextKey(context);
    const commit = contextCommit(context);
    try {
      const sourceWindow = frame?.contentWindow;
      const sourceDocument = frame?.contentDocument;
      if (!contextKey || !sourceWindow || !sourceDocument || !sourceCanvas
        || sourceCanvas.ownerDocument !== sourceDocument || !sourceCanvas.isConnected
        || !matchesOrogenMirrorInputUrl(sourceWindow.location.href, context, baseUrl)) {
        throw new Error("the source canvas does not belong to the exact synced Orogen document");
      }
      if (!allowed.has(commit)) throw new Error(
        "this Orogen commit is not audited for view synchronization",
      );
      binding = {
        frame, sourceWindow, sourceDocument, sourceCanvas,
        context: { ...context, sourceCommit: commit },
        contextKey, generation: bindingGeneration,
      };
      for (const [type, listener] of [["pointerdown", onSourcePointerDown],
        ["pointermove", onSourcePointerMove], ["pointerup", onSourcePointerEnd],
        ["pointercancel", onSourcePointerEnd], ["lostpointercapture", onSourcePointerEnd]]) {
        sourceCanvas.addEventListener(type, listener, true);
      }
      reason = "Exact Orogen canvas view tracking is ready.";
      lastOrigin = "orogen-frame-load";
    } catch (error) {
      binding = null;
      reason = `Orogen view synchronization unavailable: ${error?.message || error}.`;
    }
    return publish();
  }

  function applyOrogenToPortal() {
    const applied = applyTrackedView("orogen-view-switch");
    if (applied) reason = "World Portal was aligned to the tracked Orogen direction.";
    return { ...publish(), applied };
  }

  function setLivePortalSync(next, { applyNow = true } = {}) {
    livePortalSync = Boolean(next && currentBinding());
    let applied = false;
    if (livePortalSync && applyNow) applied = applyTrackedView("orogen-live-sync-start");
    reason = livePortalSync
      ? "Orogen rotation is synchronizing the hidden World Portal globe."
      : "Live World Portal view synchronization is paused.";
    return { ...publish(), applied };
  }

  function alignOrogenToDirection(targetDirection, options = {}) {
    const current = currentBinding();
    if (!current) return { ...snapshot(), aligned: false, plan: null };
    if (activePointer) {
      reason = "Finish the active camera gesture before switching planet views.";
      return { ...publish(), aligned: false, plan: null };
    }
    let plan;
    try {
      plan = planOrogenViewAlignment(
        centerDirection,
        targetDirection,
        canvasCssHeight(current.sourceCanvas),
        options,
      );
    } catch (error) {
      reason = `Orogen view alignment was rejected: ${error?.message || error}`;
      return { ...publish(), aligned: false, plan: null };
    }
    if (!plan.moves.length) {
      centerDirection = [...plan.targetDirection];
      reason = "Orogen already matches the World Portal direction.";
      return { ...publish(), aligned: true, plan };
    }
    const PointerEventCtor = current.sourceWindow.PointerEvent;
    if (typeof PointerEventCtor !== "function") {
      reason = "The Orogen frame cannot create audited pointer events.";
      return { ...publish(), aligned: false, plan };
    }
    const rectangle = current.sourceCanvas.getBoundingClientRect?.();
    if (!rectangle || !finite(rectangle.left) || !finite(rectangle.top)
      || !finite(rectangle.width) || !finite(rectangle.height)
      || Number(rectangle.width) <= 0 || Number(rectangle.height) <= 0) {
      reason = "The Orogen render canvas has no usable interaction rectangle.";
      return { ...publish(), aligned: false, plan };
    }
    const pointerId = syntheticPointerId += 1;
    let clientX = Number(rectangle.left) + (Number(rectangle.width) / 2);
    let clientY = Number(rectangle.top) + (Number(rectangle.height) / 2);
    let restoreCaptureMethods;
    let pointerStarted = false;
    try {
      restoreCaptureMethods = captureMethodShim(current.sourceCanvas);
      current.sourceCanvas.dispatchEvent(new PointerEventCtor(
        "pointerdown", pointerInit(pointerId, clientX, clientY, 1),
      ));
      pointerStarted = true;
      for (const move of plan.moves) {
        clientX += move.deltaX;
        clientY += move.deltaY;
        current.sourceCanvas.dispatchEvent(new PointerEventCtor(
          "pointermove", pointerInit(pointerId, clientX, clientY, 1),
        ));
      }
      current.sourceCanvas.dispatchEvent(new PointerEventCtor(
        "pointerup", pointerInit(pointerId, clientX, clientY, 0),
      ));
      pointerStarted = false;
      centerDirection = [...plan.targetDirection];
      lastOrigin = "world-portal-alignment";
      reason = "Orogen was aligned through the audited canvas camera connector.";
      return { ...publish(), aligned: true, plan };
    } catch (error) {
      if (pointerStarted) {
        try {
          current.sourceCanvas.dispatchEvent(new PointerEventCtor(
            "pointercancel", pointerInit(pointerId, clientX, clientY, 0),
          ));
        } catch {
          // Exact cleanup and method restoration continue below.
        }
      }
      reason = `Orogen view alignment stopped safely: ${error?.message || error}`;
      return { ...publish(), aligned: false, plan };
    } finally {
      restoreCaptureMethods?.();
    }
  }

  function alignOrogenToPortal(options = {}) {
    let target;
    try {
      target = portalDirection(getPortalView());
    } catch (error) {
      reason = `World Portal did not provide a valid planet direction: ${error?.message || error}`;
      return { ...publish(), aligned: false, plan: null };
    }
    return alignOrogenToDirection(target, options);
  }

  return {
    bind,
    unbind: (message = "Orogen view synchronization is not bound.") => clearBinding(message),
    applyOrogenToPortal,
    alignOrogenToDirection,
    alignOrogenToPortal,
    setLivePortalSync,
    getState: snapshot,
    destroy() {
      return clearBinding("Orogen view synchronization was destroyed.");
    },
  };
}
