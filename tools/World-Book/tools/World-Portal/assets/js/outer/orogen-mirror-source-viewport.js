export const OROGEN_MIRROR_SOURCE_CLASS = "outer-port__frame-wrap--mirror-source";

const SOURCE_PROPERTIES = Object.freeze({
  left: "--orogen-mirror-source-left",
  top: "--orogen-mirror-source-top",
  width: "--orogen-mirror-source-width",
  height: "--orogen-mirror-source-height",
});

export function mirrorSourceViewportStyle(rect) {
  const values = Object.fromEntries(Object.entries(SOURCE_PROPERTIES).map(([key, property]) => {
    const value = Number(rect?.[key]);
    return [property, `${Math.max(0, Number.isFinite(value) ? value : 0)}px`];
  }));
  return Number(rect?.width) > 0 && Number(rect?.height) > 0 ? values : null;
}

function dispatchSourceResize(frame) {
  try {
    const sourceWindow = frame?.contentWindow;
    if (!sourceWindow?.dispatchEvent) return;
    const ResizeEvent = sourceWindow.Event;
    if (typeof ResizeEvent === "function") sourceWindow.dispatchEvent(new ResizeEvent("resize"));
  } catch {
    // A frame navigating away is treated as stale by the mirror binding.
  }
}

export function createOrogenMirrorSourceViewport({
  stage,
  windowLike = globalThis.window,
  settleDelay = 120,
  onApplied,
} = {}) {
  let frame = null;
  let wrapper = null;
  let resizeObserver = null;
  let animationFrame = null;
  let settleTimer = null;
  let generation = 0;
  let lastStyle = null;

  function cancelScheduled() {
    if (animationFrame !== null) windowLike?.cancelAnimationFrame?.(animationFrame);
    if (settleTimer !== null) windowLike?.clearTimeout?.(settleTimer);
    animationFrame = null;
    settleTimer = null;
  }

  function apply() {
    if (!frame || !wrapper || !stage?.getBoundingClientRect) return false;
    const nextStyle = mirrorSourceViewportStyle(stage.getBoundingClientRect());
    if (!nextStyle) return false;
    const overlay = wrapper.closest?.(".outer-port-overlay");
    const parked = !overlay || overlay.classList.contains("outer-port-overlay--parked");
    if (parked) wrapper.classList?.add?.(OROGEN_MIRROR_SOURCE_CLASS);
    else wrapper.classList?.remove?.(OROGEN_MIRROR_SOURCE_CLASS);
    for (const [property, value] of Object.entries(nextStyle)) {
      wrapper.style?.setProperty?.(property, value);
    }
    lastStyle = nextStyle;
    dispatchSourceResize(frame);
    onApplied?.({ frame, rect: stage.getBoundingClientRect(), style: { ...nextStyle } });
    return true;
  }

  function schedule() {
    if (!frame || !wrapper) return false;
    const scheduledGeneration = ++generation;
    cancelScheduled();
    const run = () => {
      animationFrame = null;
      if (scheduledGeneration !== generation) return;
      apply();
      settleTimer = windowLike?.setTimeout?.(() => {
        settleTimer = null;
        if (scheduledGeneration === generation) apply();
      }, settleDelay) ?? null;
    };
    if (typeof windowLike?.requestAnimationFrame === "function") {
      animationFrame = windowLike.requestAnimationFrame(run);
    } else run();
    return true;
  }

  function bind(nextFrame) {
    if (frame === nextFrame && wrapper === nextFrame?.parentElement) return schedule();
    release();
    frame = nextFrame || null;
    wrapper = frame?.parentElement || null;
    if (!frame || !wrapper || !stage) return false;
    const Observer = windowLike?.ResizeObserver || globalThis.ResizeObserver;
    if (typeof Observer === "function") {
      resizeObserver = new Observer(() => schedule());
      resizeObserver.observe(stage);
    }
    windowLike?.addEventListener?.("resize", schedule);
    return schedule();
  }

  function stabilize() {
    schedule();
    return new Promise((resolve) => {
      const finish = () => resolve(apply());
      if (typeof windowLike?.setTimeout === "function") {
        windowLike.setTimeout(finish, settleDelay + 20);
      } else finish();
    });
  }

  function release() {
    generation += 1;
    cancelScheduled();
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    windowLike?.removeEventListener?.("resize", schedule);
    if (wrapper) {
      wrapper.classList?.remove?.(OROGEN_MIRROR_SOURCE_CLASS);
      for (const property of Object.values(SOURCE_PROPERTIES)) wrapper.style?.removeProperty?.(property);
    }
    const previousFrame = frame;
    frame = null;
    wrapper = null;
    lastStyle = null;
    dispatchSourceResize(previousFrame);
  }

  return {
    bind,
    refresh: schedule,
    stabilize,
    release,
    getState: () => ({
      bound: Boolean(frame && wrapper),
      measured: Boolean(lastStyle),
      style: lastStyle ? { ...lastStyle } : null,
    }),
  };
}
