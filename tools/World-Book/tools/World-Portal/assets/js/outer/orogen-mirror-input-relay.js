export const PREFERRED_OROGEN_CAMERA_INPUT_CAPABILITY = "planet-camera-input@1";
// This fallback is deliberately narrower than the future semantic bridge. Each
// upstream revision must be audited before World Portal may synthesize events
// into its render canvas.
export const LEGACY_OROGEN_CAMERA_INPUT_COMMITS = Object.freeze([
  "cc2662b4edd52231c4f65d8765f3ef12cd82d9b7",
]);
const CONTEXT_QUERY = Object.freeze({
  worldKey: "wpWorldKey",
  worldName: "wpWorldName",
  revision: "wpSyncRevision",
  syncToken: "wpSyncToken",
  handoffId: "wpHandoffId",
  toolId: "wpToolId",
  sourceCommit: "wpSourceCommit",
});
const PINCH_STEP_LOG = Math.abs(Math.log(0.92));
function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
function exactContext(context) {
  return Boolean(context?.worldKey && context?.worldName && context?.syncToken
    && context?.handoffId && context?.toolId === "orogen"
    && /^[0-9a-f]{40}$/i.test(context?.sourceCommit || "")
    && finitePositive(context?.revision));
}
export function orogenMirrorContextKey(context) {
  if (!exactContext(context)) return null;
  return [
    context.worldKey, context.worldName, Number(context.revision), context.syncToken,
    context.handoffId, context.toolId, context.sourceCommit.toLowerCase(),
  ].join("\u0000");
}
export function matchesOrogenMirrorInputUrl(urlLike, context, baseUrl) {
  if (!orogenMirrorContextKey(context)) return false;
  try {
    const url = new URL(urlLike, baseUrl);
    const base = new URL(baseUrl);
    return url.origin === base.origin
      && url.pathname === "/outer/orogen/import.html"
      && url.searchParams.get(CONTEXT_QUERY.worldKey) === context.worldKey
      && url.searchParams.get(CONTEXT_QUERY.worldName) === context.worldName
      && Number(url.searchParams.get(CONTEXT_QUERY.revision)) === Number(context.revision)
      && url.searchParams.get(CONTEXT_QUERY.syncToken) === context.syncToken
      && url.searchParams.get(CONTEXT_QUERY.handoffId) === context.handoffId
      && url.searchParams.get(CONTEXT_QUERY.toolId) === context.toolId
      && url.searchParams.get(CONTEXT_QUERY.sourceCommit)?.toLowerCase()
        === context.sourceCommit.toLowerCase();
  } catch {
    return false;
  }
}
export function computeContainedMediaRect(box, intrinsicWidth, intrinsicHeight) {
  const width = Number(box?.width) || 0;
  const height = Number(box?.height) || 0;
  const mediaWidth = Number(intrinsicWidth) || 0;
  const mediaHeight = Number(intrinsicHeight) || 0;
  if (width <= 0 || height <= 0 || mediaWidth <= 0 || mediaHeight <= 0) return null;
  const scale = Math.min(width / mediaWidth, height / mediaHeight);
  const renderedWidth = mediaWidth * scale;
  const renderedHeight = mediaHeight * scale;
  return {
    left: Number(box.left) + ((width - renderedWidth) / 2),
    top: Number(box.top) + ((height - renderedHeight) / 2),
    width: renderedWidth,
    height: renderedHeight,
  };
}
export function mapMirrorPoint(point, mediaRect, sourceRect, { allowOutside = false } = {}) {
  if (!mediaRect || !sourceRect || mediaRect.width <= 0 || mediaRect.height <= 0
    || sourceRect.width <= 0 || sourceRect.height <= 0) return null;
  const u = (Number(point?.clientX) - mediaRect.left) / mediaRect.width;
  const v = (Number(point?.clientY) - mediaRect.top) / mediaRect.height;
  if (!allowOutside && (u < 0 || u > 1 || v < 0 || v > 1)) return null;
  return {
    clientX: sourceRect.left + (u * sourceRect.width),
    clientY: sourceRect.top + (v * sourceRect.height),
  };
}
export function advanceOrogenPinch(previousDistance, nextDistance, residual = 0, maxSteps = 3) {
  if (!finitePositive(previousDistance) || !finitePositive(nextDistance)) {
    return { wheelDeltas: [], residual: 0 };
  }
  const total = residual + Math.log(Number(nextDistance) / Number(previousDistance));
  const available = Math.floor(Math.abs(total) / PINCH_STEP_LOG);
  const count = Math.min(Math.max(0, Number(maxSteps) || 0), available);
  if (!count) return { wheelDeltas: [], residual: total };
  const direction = Math.sign(total);
  return {
    wheelDeltas: Array.from({ length: count }, () => direction > 0 ? -1 : 1),
    residual: total - (direction * count * PINCH_STEP_LOG),
  };
}
function captureMethodShim(canvas) {
  const names = ["setPointerCapture", "releasePointerCapture"];
  const records = names.map((name) => ({
    name,
    hadOwn: Object.prototype.hasOwnProperty.call(canvas, name),
    descriptor: Object.getOwnPropertyDescriptor(canvas, name),
  }));
  try {
    for (const { name } of records) {
      Object.defineProperty(canvas, name, {
        configurable: true, writable: true, value() {},
      });
    }
  } catch (error) {
    for (const record of records) {
      if (record.hadOwn) Object.defineProperty(canvas, record.name, record.descriptor);
      else delete canvas[record.name];
    }
    throw error;
  }
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const record of records) {
      if (record.hadOwn) Object.defineProperty(canvas, record.name, record.descriptor);
      else delete canvas[record.name];
    }
  };
}

function unmodifiedPrimary(event) {
  return event.button === 0 && (event.pointerType === "touch"
    || (event.isPrimary !== false && event.buttons === 1))
    && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function pointerInit(event, point) {
  return {
    bubbles: true, cancelable: true, composed: true,
    pointerId: event.pointerId, pointerType: event.pointerType || "mouse",
    isPrimary: event.isPrimary !== false, button: event.button,
    buttons: event.buttons, pressure: event.pressure,
    width: event.width, height: event.height,
    clientX: point.clientX, clientY: point.clientY,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
  };
}

function distance(first, second) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

export function createOrogenMirrorInputRelay({
  surface,
  getMediaElement,
  baseUrl = globalThis.location?.href || "http://localhost/",
  allowedCommits = LEGACY_OROGEN_CAMERA_INPUT_COMMITS,
  onStateChange,
} = {}) {
  const allowed = new Set(allowedCommits.map((commit) => String(commit).toLowerCase()));
  const touchPointers = new Map();
  let binding = null;
  let bindingGeneration = 0;
  let enabled = false;
  let activeGesture = null;
  let pinch = null;
  let suppressTouchUntilClear = false;
  let reason = "Camera interaction is not bound.";

  function snapshot() {
    const available = Boolean(binding && allowed.has(binding.context.sourceCommit.toLowerCase()));
    return {
      preferredCapability: PREFERRED_OROGEN_CAMERA_INPUT_CAPABILITY,
      mode: available ? "legacy-canvas-events" : "inactive",
      available,
      enabled: available && enabled,
      interacting: Boolean(activeGesture || pinch),
      bindingGeneration,
      worldKey: binding?.context.worldKey || null,
      sourceCommit: binding?.context.sourceCommit || null,
      reason,
    };
  }

  function publish() {
    const state = snapshot();
    onStateChange?.(state);
    return state;
  }

  function currentBinding() {
    if (!enabled || !binding || binding.generation !== bindingGeneration) return null;
    try {
      const { frame, sourceWindow, sourceDocument, sourceCanvas, context } = binding;
      if (frame.contentWindow !== sourceWindow || frame.contentDocument !== sourceDocument
        || sourceCanvas.ownerDocument !== sourceDocument || !sourceCanvas.isConnected
        || !matchesOrogenMirrorInputUrl(sourceWindow.location.href, context, baseUrl)) return null;
      return binding;
    } catch {
      return null;
    }
  }

  function mediaRect(current) {
    const media = getMediaElement?.();
    const box = media?.getBoundingClientRect?.();
    // Prefer the live source size while a capture track renegotiates.
    const width = Number(current.sourceCanvas.width) || Number(media?.videoWidth)
      || Number(media?.width);
    const height = Number(current.sourceCanvas.height) || Number(media?.videoHeight)
      || Number(media?.height);
    return computeContainedMediaRect(box, width, height);
  }

  function mappedPoint(event, { allowOutside = false } = {}) {
    const current = currentBinding();
    if (!current) return null;
    return mapMirrorPoint(event, mediaRect(current), current.sourceCanvas.getBoundingClientRect(), { allowOutside });
  }

  function dispatchPointer(type, event, { allowOutside = true } = {}) {
    const current = currentBinding();
    const point = mappedPoint(event, { allowOutside }) || activeGesture?.lastPoint;
    if (!current || !point || typeof current.sourceWindow.PointerEvent !== "function") return false;
    current.sourceCanvas.dispatchEvent(new current.sourceWindow.PointerEvent(type, pointerInit(event, point)));
    if (activeGesture) {
      activeGesture.lastPoint = point;
      activeGesture.lastHostPoint = { clientX: event.clientX, clientY: event.clientY };
    }
    return true;
  }

  function releaseHostCapture(pointerId) {
    try {
      if (surface?.hasPointerCapture?.(pointerId)) surface.releasePointerCapture(pointerId);
    } catch {
      // A browser may have already released capture during cancellation.
    }
  }

  function finishGesture(event, type = "pointercancel", { releaseHost = true } = {}) {
    const gesture = activeGesture;
    if (!gesture) return;
    try {
      if (event && currentBinding()) dispatchPointer(type, event);
    } catch {
      // Cleanup and exact method restoration still run below.
    } finally {
      activeGesture = null;
      gesture.restoreCaptureMethods();
      if (releaseHost) releaseHostCapture(gesture.pointerId);
    }
  }

  function startGesture(event) {
    const current = currentBinding();
    const point = mappedPoint(event);
    if (!current || !point || activeGesture) return false;
    let restoreCaptureMethods;
    try {
      restoreCaptureMethods = captureMethodShim(current.sourceCanvas);
      surface?.setPointerCapture?.(event.pointerId);
      activeGesture = {
        pointerId: event.pointerId,
        pointerType: event.pointerType || "mouse",
        lastPoint: point,
        lastHostPoint: { clientX: event.clientX, clientY: event.clientY },
        restoreCaptureMethods,
      };
      if (!dispatchPointer("pointerdown", event, { allowOutside: false })) throw new Error("dispatch rejected");
      return true;
    } catch {
      activeGesture = null;
      restoreCaptureMethods?.();
      releaseHostCapture(event.pointerId);
      return false;
    }
  }

  function dispatchWheel(event, deltaY = event.deltaY, pointOverride = null) {
    const current = currentBinding();
    const point = pointOverride || mappedPoint(event);
    if (!current || !point || !deltaY || typeof current.sourceWindow.WheelEvent !== "function") return false;
    current.sourceCanvas.dispatchEvent(new current.sourceWindow.WheelEvent("wheel", {
      bubbles: true, cancelable: true, composed: true,
      clientX: point.clientX, clientY: point.clientY,
      deltaX: Number(event.deltaX) || 0, deltaY, deltaZ: Number(event.deltaZ) || 0,
      deltaMode: Number(event.deltaMode) || 0,
      ctrlKey: Boolean(event.ctrlKey),
    }));
    return true;
  }

  function beginPinch() {
    if (activeGesture) finishGesture({ ...touchPointers.get(activeGesture.pointerId),
      pointerId: activeGesture.pointerId, pointerType: "touch", button: 0, buttons: 0 },
    "pointercancel", { releaseHost: false });
    const points = [...touchPointers.values()];
    pinch = points.length === 2 ? { distance: distance(points[0], points[1]), residual: 0 } : null;
    suppressTouchUntilClear = true;
  }

  function onPointerDown(event) {
    if (!unmodifiedPrimary(event) || !mappedPoint(event)) return;
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      try { surface?.setPointerCapture?.(event.pointerId); } catch {
        touchPointers.delete(event.pointerId);
        return;
      }
      if (touchPointers.size === 1 && !suppressTouchUntilClear) startGesture(event);
      else beginPinch();
    } else if (!startGesture(event)) return;
    event.preventDefault?.();
  }

  function onPointerMove(event) {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      touchPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (pinch && touchPointers.size === 2) {
        const points = [...touchPointers.values()];
        const nextDistance = distance(points[0], points[1]);
        const step = advanceOrogenPinch(pinch.distance, nextDistance, pinch.residual);
        pinch.distance = nextDistance;
        pinch.residual = step.residual;
        const centerEvent = {
          clientX: (points[0].clientX + points[1].clientX) / 2,
          clientY: (points[0].clientY + points[1].clientY) / 2,
        };
        const center = mappedPoint(centerEvent, { allowOutside: true });
        for (const delta of step.wheelDeltas) dispatchWheel(event, delta, center);
        event.preventDefault?.();
        return;
      }
    }
    if (activeGesture?.pointerId !== event.pointerId) return;
    if (event.pointerType !== "touch" && (event.altKey || event.ctrlKey || event.metaKey
      || event.shiftKey || event.buttons !== 1)) {
      return finishGesture(event, "pointercancel");
    }
    if (!currentBinding()) return finishGesture(event, "pointercancel");
    try {
      if (dispatchPointer("pointermove", event)) event.preventDefault?.();
    } catch {
      finishGesture(event, "pointercancel");
    }
  }

  function onPointerEnd(event) {
    const wasTouch = event.pointerType === "touch";
    if (activeGesture?.pointerId === event.pointerId) {
      finishGesture(event, event.type === "pointerup" ? "pointerup" : "pointercancel");
    }
    if (wasTouch) {
      touchPointers.delete(event.pointerId);
      releaseHostCapture(event.pointerId);
      if (touchPointers.size === 0) {
        pinch = null;
        suppressTouchUntilClear = false;
      }
      event.preventDefault?.();
    }
  }

  function onWheel(event) {
    if (event.altKey || event.metaKey || event.shiftKey) return;
    try {
      if (dispatchWheel(event)) event.preventDefault?.();
    } catch {
      // A stale frame rejects input without affecting World Portal scrolling.
    }
  }

  function cancel() {
    if (activeGesture) {
      const point = activeGesture.lastHostPoint;
      finishGesture({
        clientX: point.clientX, clientY: point.clientY,
        pointerId: activeGesture.pointerId, pointerType: activeGesture.pointerType,
        button: 0, buttons: 0, isPrimary: true,
      }, "pointercancel");
    }
    for (const pointerId of touchPointers.keys()) releaseHostCapture(pointerId);
    touchPointers.clear();
    pinch = null;
    suppressTouchUntilClear = false;
  }

  function setEnabled(next) {
    if (!next) cancel();
    enabled = Boolean(next && binding);
    if (enabled) reason = "Drag to rotate; use the wheel or pinch to zoom. Settings stay in the port.";
    else if (binding) reason = "Camera interaction is paused.";
    return publish();
  }

  function bind({ frame, sourceCanvas, context } = {}) {
    cancel();
    bindingGeneration += 1;
    enabled = false;
    binding = null;
    const contextKey = orogenMirrorContextKey(context);
    const commit = String(context?.sourceCommit || "").toLowerCase();
    try {
      const sourceWindow = frame?.contentWindow;
      const sourceDocument = frame?.contentDocument;
      if (!contextKey || !sourceWindow || !sourceDocument || !sourceCanvas
        || sourceCanvas.ownerDocument !== sourceDocument || !sourceCanvas.isConnected
        || !matchesOrogenMirrorInputUrl(sourceWindow.location.href, context, baseUrl)) {
        throw new Error("The source canvas is not bound to the exact synced world tuple.");
      }
      if (!allowed.has(commit)) {
        reason = "This Orogen revision is not audited for host camera input; the visual mirror remains available.";
        return publish();
      }
      binding = {
        frame, sourceWindow, sourceDocument, sourceCanvas,
        context: { ...context, sourceCommit: commit },
        contextKey, generation: bindingGeneration,
      };
      reason = "Camera input is ready. Settings remain available only in the port.";
    } catch (error) {
      reason = `Camera input unavailable: ${error?.message || error}`;
    }
    return publish();
  }

  function unbind(message = "Camera interaction is not bound.") {
    cancel();
    bindingGeneration += 1;
    enabled = false;
    binding = null;
    reason = message;
    return publish();
  }

  surface?.addEventListener?.("pointerdown", onPointerDown);
  surface?.addEventListener?.("pointermove", onPointerMove);
  surface?.addEventListener?.("pointerup", onPointerEnd);
  surface?.addEventListener?.("pointercancel", onPointerEnd);
  surface?.addEventListener?.("lostpointercapture", onPointerEnd);
  surface?.addEventListener?.("wheel", onWheel, { passive: false });

  return {
    bind, unbind, cancel, setEnabled, getState: snapshot,
    destroy() {
      unbind();
      surface?.removeEventListener?.("pointerdown", onPointerDown);
      surface?.removeEventListener?.("pointermove", onPointerMove);
      surface?.removeEventListener?.("pointerup", onPointerEnd);
      surface?.removeEventListener?.("pointercancel", onPointerEnd);
      surface?.removeEventListener?.("lostpointercapture", onPointerEnd);
      surface?.removeEventListener?.("wheel", onWheel);
    },
  };
}
