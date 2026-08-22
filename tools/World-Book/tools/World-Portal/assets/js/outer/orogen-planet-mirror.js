import {
  createOrogenMirrorInputRelay, matchesOrogenMirrorInputUrl, orogenMirrorContextKey,
} from "./orogen-mirror-input-relay.js";
import { createOrogenMirrorSourceViewport } from "./orogen-mirror-source-viewport.js";
import { createOrogenViewSync } from "./orogen-view-sync.js";

export function selectOrogenRenderCanvas(documentLike) {
  const canvases = [...(documentLike?.querySelectorAll?.("canvas") || [])];
  return canvases.reduce((best, canvas) => {
    const area = Math.max(0, Number(canvas.width) || 0) * Math.max(0, Number(canvas.height) || 0);
    const bestArea = best
      ? Math.max(0, Number(best.width) || 0) * Math.max(0, Number(best.height) || 0)
      : -1;
    return area > bestArea ? canvas : best;
  }, null);
}

export function createOrogenPlanetMirror({ viewport, sceneApi, onStateChange } = {}) {
  const host = viewport || document.getElementById("viewport");
  const surface = document.createElement("section");
  surface.className = "orogen-mirror";
  surface.hidden = true;
  surface.setAttribute("aria-label", "World Orogen planet view. Drag to rotate; wheel or pinch to zoom.");
  surface.innerHTML = `
    <div class="orogen-mirror__stage">
      <video class="orogen-mirror__video" muted autoplay playsinline draggable="false" aria-hidden="true"></video>
      <canvas class="orogen-mirror__canvas" aria-hidden="true" hidden></canvas>
    </div>
    <p class="orogen-mirror__badge">World Orogen · drag to rotate · wheel/pinch to zoom</p>
  `;
  host?.appendChild(surface);

  const switcher = document.createElement("div");
  switcher.className = "planet-view-switcher";
  switcher.hidden = true;
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Planet view");
  switcher.innerHTML = `
    <button type="button" data-planet-view="world-portal" aria-pressed="true">World Portal</button>
    <button type="button" data-planet-view="orogen" aria-pressed="false">Orogen planet</button>
  `;
  document.body.appendChild(switcher);

  const video = surface.querySelector("video");
  const fallbackCanvas = surface.querySelector("canvas");
  const stage = surface.querySelector(".orogen-mirror__stage");
  const buttons = [...switcher.querySelectorAll("button")];
  const inputRelay = createOrogenMirrorInputRelay({
    surface,
    getMediaElement: () => video.hidden ? fallbackCanvas : video,
  });
  const viewSync = createOrogenViewSync({
    getPortalView: () => sceneApi?.getPlanetViewState?.(),
    applyPortalView: (viewState) => {
      if (!sceneApi?.applyPlanetViewState?.(viewState)) {
        throw new Error("the World Portal globe did not accept the shared view direction");
      }
    },
  });
  let stream = null;
  let animationFrame = null;
  let captureCheckTimer = null;
  let requested = false;
  let connected = false;
  let transport = null;
  let reason = "Mirror Planet is not active.";
  let activeView = "world-portal";
  let worldKey = null;
  let bindGeneration = 0;
  let sourceBinding = null;
  const sourceViewport = createOrogenMirrorSourceViewport({
    stage,
    onApplied: scheduleCaptureDimensionCheck,
  });

  function snapshot() {
    const interaction = inputRelay.getState();
    return {
      requested, connected, transport, reason, activeView, worldKey,
      interactive: interaction.available, interaction,
      viewSync: viewSync.getState(),
      sourceViewport: sourceViewport.getState(),
    };
  }

  function publish() {
    const result = snapshot();
    onStateChange?.(result);
    return result;
  }

  function renderView() {
    const showingOrogen = activeView === "orogen" && connected;
    surface.hidden = !requested && !connected;
    surface.classList.toggle("orogen-mirror--showing", showingOrogen);
    const interaction = inputRelay.setEnabled(showingOrogen);
    surface.classList.toggle("orogen-mirror--interactive", interaction.enabled);
    for (const button of buttons) {
      const selected = button.dataset.planetView === (showingOrogen ? "orogen" : "world-portal");
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-active", selected);
    }
  }

  function pausePortalSpin(paused) {
    sceneApi?.setSpinPauseReason?.("orogen-mirror-view", paused);
  }

  function selectView(next) {
    const showingOrogen = next === "orogen" && connected;
    if (showingOrogen) {
      const portalView = sceneApi?.getPlanetViewState?.();
      if (portalView) sceneApi?.applyPlanetViewState?.(portalView);
      const alignment = portalView?.centerDirection
        ? viewSync.alignOrogenToDirection(portalView.centerDirection)
        : viewSync.alignOrogenToPortal();
      if (!alignment.aligned) reason = `${reason} ${alignment.reason}`;
      pausePortalSpin(true);
      viewSync.setLivePortalSync(true, { applyNow: false });
      activeView = "orogen";
    } else {
      if (connected) viewSync.applyOrogenToPortal();
      viewSync.setLivePortalSync(false, { applyNow: false });
      activeView = "world-portal";
      pausePortalSpin(false);
    }
    renderView();
    return publish();
  }

  function stopTransport() {
    inputRelay.cancel();
    viewSync.setLivePortalSync(false, { applyNow: false });
    pausePortalSpin(false);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    if (captureCheckTimer !== null) window.clearTimeout(captureCheckTimer);
    captureCheckTimer = null;
    stream?.getTracks?.().forEach((track) => track.stop());
    stream = null;
    if (video) {
      video.pause?.();
      video.srcObject = null;
      video.hidden = false;
    }
    if (fallbackCanvas) fallbackCanvas.hidden = true;
    connected = false;
    transport = null;
  }

  function releaseSourceBinding(message = "Orogen view synchronization is not bound.") {
    inputRelay.unbind(message);
    viewSync.unbind(message);
    sourceViewport.release();
    sourceBinding = null;
  }

  function beginCanvasFallback(sourceCanvas) {
    const context = fallbackCanvas?.getContext?.("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot create the mirror fallback canvas.");
    video.hidden = true;
    fallbackCanvas.hidden = false;
    const draw = () => {
      if (!requested || !connected) return;
      try {
        const width = Math.max(1, Number(sourceCanvas.width) || 1);
        const height = Math.max(1, Number(sourceCanvas.height) || 1);
        if (fallbackCanvas.width !== width || fallbackCanvas.height !== height) {
          fallbackCanvas.width = width;
          fallbackCanvas.height = height;
        }
        context.drawImage(sourceCanvas, 0, 0, width, height);
      } catch (error) {
        stopTransport();
        activeView = "world-portal";
        reason = `Mirror stopped safely: ${error?.message || error}`;
        renderView();
        publish();
        return;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    connected = true;
    transport = "canvas-copy";
    reason = "Live Orogen planet mirror using the canvas-copy fallback.";
    draw();
  }

  function scheduleCaptureDimensionCheck() {
    if (captureCheckTimer !== null) window.clearTimeout(captureCheckTimer);
    captureCheckTimer = null;
    if (transport !== "canvas-capture-stream" || !sourceBinding?.sourceCanvas) return;
    captureCheckTimer = window.setTimeout(() => {
      captureCheckTimer = null;
      if (transport !== "canvas-capture-stream" || !requested || !connected) return;
      const sourceCanvas = sourceBinding.sourceCanvas;
      const widthMatches = Math.abs(Number(video.videoWidth) - Number(sourceCanvas.width)) <= 1;
      const heightMatches = Math.abs(Number(video.videoHeight) - Number(sourceCanvas.height)) <= 1;
      if (widthMatches && heightMatches) return;
      stream?.getTracks?.().forEach((track) => track.stop());
      stream = null;
      video.pause?.();
      video.srcObject = null;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      connected = false;
      beginCanvasFallback(sourceCanvas);
      reason = "Live Orogen mirror switched to exact-size canvas rendering after a source resize.";
      renderView();
      publish();
    }, 240);
  }

  async function bindCanvas(sourceCanvas) {
    if (typeof sourceCanvas.captureStream === "function") {
      try {
        const captured = sourceCanvas.captureStream(30);
        if (!captured?.getVideoTracks?.().length) throw new Error("No canvas video track was returned.");
        stream = captured;
        video.hidden = false;
        fallbackCanvas.hidden = true;
        video.srcObject = captured;
        await video.play();
        connected = true;
        transport = "canvas-capture-stream";
        reason = "Live Orogen planet and starfield mirror.";
        scheduleCaptureDimensionCheck();
        return;
      } catch {
        stream?.getTracks?.().forEach((track) => track.stop());
        stream = null;
        video.srcObject = null;
      }
    }
    beginCanvasFallback(sourceCanvas);
  }

  function sourceBindingMatches(frame, context) {
    if (sourceBinding?.frame !== frame
      || sourceBinding.contextKey !== orogenMirrorContextKey(context)
      || !sourceBinding.sourceCanvas?.isConnected) return false;
    try {
      return matchesOrogenMirrorInputUrl(
        frame.contentWindow?.location?.href || frame.src, context, window.location.href,
      );
    } catch {
      return false;
    }
  }

  async function prepare(frame, context, { attempts = 24, interval = 125 } = {}) {
    if (sourceBindingMatches(frame, context)) return { ...snapshot(), prepared: true };
    const generation = ++bindGeneration;
    stopTransport();
    releaseSourceBinding("The previous Orogen view binding was replaced.");
    worldKey = context?.worldKey || null;
    reason = "Finding Orogen's render canvas…";
    if (!frame || !orogenMirrorContextKey(context)) {
      worldKey = null;
      reason = "Mirror Planet requires active world sync.";
      return { ...publish(), prepared: false };
    }
    try {
      const frameUrl = new URL(frame.contentWindow?.location?.href || frame.src, window.location.href);
      if (frameUrl.origin !== window.location.origin) {
        throw new Error("the embedded tool is not on World Portal's exact origin");
      }
      if (!matchesOrogenMirrorInputUrl(frameUrl.href, context, window.location.href)) {
        throw new Error("the iframe is not bound to this exact world revision");
      }
      let sourceCanvas = null;
      for (let attempt = 0; attempt < attempts && generation === bindGeneration; attempt += 1) {
        // The legacy fallback is restricted to the audited render canvas. It
        // never queries, mirrors, or changes Orogen settings.
        sourceCanvas = selectOrogenRenderCanvas(frame.contentDocument);
        if (sourceCanvas?.width && sourceCanvas?.height) break;
        await new Promise((resolve) => window.setTimeout(resolve, interval));
      }
      if (generation !== bindGeneration) return snapshot();
      if (!sourceCanvas) throw new Error("Orogen did not expose a render canvas");
      const interaction = inputRelay.bind({ frame, sourceCanvas, context });
      const synchronized = viewSync.bind({ frame, sourceCanvas, context });
      if (!interaction.available || !synchronized.available) {
        throw new Error(interaction.available ? synchronized.reason : interaction.reason);
      }
      sourceBinding = {
        frame, sourceCanvas, contextKey: orogenMirrorContextKey(context), generation,
      };
      reason = "Orogen planet view is ready for an exact mirrored connection.";
      return { ...publish(), prepared: true };
    } catch (error) {
      releaseSourceBinding("The Orogen view binding could not be prepared.");
      worldKey = null;
      reason = `Mirror Planet unavailable: ${error?.message || error}.`;
      return { ...publish(), prepared: false };
    }
  }

  async function start(frame, context, options = {}) {
    requested = true;
    stopTransport();
    activeView = "world-portal";
    worldKey = context?.worldKey || null;
    reason = "Preparing the live Orogen planet view…";
    switcher.hidden = false;
    renderView();
    publish();
    const prepared = await prepare(frame, context, options);
    if (!prepared.prepared || !sourceBindingMatches(frame, context)) {
      requested = false;
      switcher.hidden = true;
      renderView();
      return publish();
    }
    const generation = sourceBinding.generation;
    try {
      sourceViewport.bind(frame);
      await sourceViewport.stabilize();
      if (generation !== bindGeneration || !sourceBindingMatches(frame, context)) return snapshot();
      await bindCanvas(sourceBinding.sourceCanvas);
      if (generation !== bindGeneration || !sourceBindingMatches(frame, context)) {
        stopTransport();
        return snapshot();
      }
      const interaction = inputRelay.getState();
      reason = interaction.available
        ? `${reason} Drag to rotate; use the wheel or pinch to zoom.`
        : `${reason} ${interaction.reason}`;
      return selectView("orogen");
    } catch (error) {
      stopTransport();
      releaseSourceBinding("The Orogen mirror stopped during startup.");
      requested = false;
      activeView = "world-portal";
      worldKey = null;
      switcher.hidden = true;
      reason = `Mirror Planet unavailable: ${error?.message || error}.`;
      renderView();
      return publish();
    }
  }

  function invalidate(message = "Mirror Planet was cleared.") {
    bindGeneration += 1;
    requested = false;
    stopTransport();
    releaseSourceBinding(message);
    activeView = "world-portal";
    worldKey = null;
    reason = message;
    switcher.hidden = true;
    renderView();
    return publish();
  }

  function suspend(message = "Waiting for the exact Orogen world view to reload…") {
    if (!requested) return snapshot();
    bindGeneration += 1;
    stopTransport();
    releaseSourceBinding(message);
    activeView = "world-portal";
    worldKey = null;
    reason = message;
    renderView();
    return publish();
  }

  for (const button of buttons) {
    button.addEventListener("click", () => selectView(button.dataset.planetView));
  }
  renderView();
  return {
    prepare, start, suspend, invalidate, selectView, getState: snapshot,
    refreshLayout: () => sourceViewport.refresh(),
    cancelInput: () => inputRelay.cancel(),
    destroy() {
      invalidate();
      inputRelay.destroy();
      viewSync.destroy();
      sourceViewport.release();
      surface.remove();
      switcher.remove();
    },
  };
}
