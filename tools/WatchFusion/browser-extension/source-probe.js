/* Runs in every accessible frame of the explicitly selected tab.
   Passive by default. Writes require an explicit WatchFusion control. */
(() => {
  if (window.__watchFusionMediaProbe) return;
  window.__watchFusionMediaProbe = true;
  let enabled = true, pageMedia = null, sampleTimer = null, runtimeListenerAttached = false;
  const frameToken = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const PAGE_CHANNEL = 'eveos.watchfusion.page-media.v1';
  const mediaEvents=['play','pause','playing','seeking','seeked','ratechange','volumechange','waiting','ended'];
  let observedElement=null, eventTimer=null;
  let silenceSourcePlayer = false;
  const priorMute = new Map();
  function silenceElement(element) {
    if (!priorMute.has(element) || !element.muted) priorMute.set(element, element.muted);
    if (!element.muted) element.muted = true;
  }
  function updatePlayerSilence() {
    if (!silenceSourcePlayer) return;
    for (const [element, muted] of priorMute) {
      if (element.isConnected === false) {
        element.muted = muted;
        priorMute.delete(element);
      }
    }
    for (const element of document.querySelectorAll('video,audio')) silenceElement(element);
  }
  function setPlayerSilence(enabled) {
    silenceSourcePlayer = enabled;
    if (enabled) {
      updatePlayerSilence();
      return;
    }
    for (const [element, muted] of priorMute) element.muted = muted;
    priorMute.clear();
  }
  function onSourceAudioChange(event) {
    if (silenceSourcePlayer && /^(AUDIO|VIDEO)$/.test(event.target?.tagName)) silenceElement(event.target);
  }
  function onMediaEvent(event) {
    if (!enabled || event.target !== observedElement) return;
    clearTimeout(eventTimer);
    eventTimer=setTimeout(() => { eventTimer=null; snapshot(); },25);
  }
  function observeMedia(element) {
    if (element===observedElement) return;
    if (observedElement) for (const type of mediaEvents) observedElement.removeEventListener(type,onMediaEvent);
    observedElement=element;
    if (element) for (const type of mediaEvents) element.addEventListener(type,onMediaEvent,{passive:true});
  }

  function isRuntimeInvalidated(error) {
    return /Extension context invalidated/i.test(String(error?.message || error || ''));
  }

  // A reloaded extension leaves this isolated world behind with a dead runtime.
  // Every runtime touch goes through here so a stale probe never throws.
  function runtimeApi() {
    try {
      const runtime = globalThis.chrome?.runtime;
      return runtime?.id ? runtime : null;
    } catch { return null; }
  }

  function sendRuntimeMessage(message) {
    if (!enabled) return;
    const runtime = runtimeApi();
    if (!runtime) { cleanup(); return; }
    try {
      const pending = runtime.sendMessage(message);
      if (pending && typeof pending.catch === 'function') {
        pending.catch(error => {
          if (isRuntimeInvalidated(error)) cleanup();
        });
      }
    } catch (error) {
      if (isRuntimeInvalidated(error)) { cleanup(); return; }
      throw error;
    }
  }

  function onWindowMessage(event) {
    if (event.source === window && event.data?.channel === PAGE_CHANNEL && event.data.type === 'state') {
      pageMedia = { ...event.data, at:Date.now() };
    }
  }

  function onDocumentLoad(event) {
    if (enabled && event.target?.tagName === 'IFRAME') {
      sendRuntimeMessage({ to:'worker', type:'refresh-probes' });
    }
  }

  function media() {
    return [...document.querySelectorAll('video,audio')]
      .filter(element => element.readyState > 0)
      .sort((a,b) => Number(a.paused) - Number(b.paused)
        || Number(b.readyState) - Number(a.readyState)
        || (Number(b.videoWidth || 0) * Number(b.videoHeight || 0)) - (Number(a.videoWidth || 0) * Number(a.videoHeight || 0)))[0] || null;
  }

  function pagePlayer() {
    if (!pageMedia?.hasMedia || Date.now() - pageMedia.at > 2200) return null;
    // Custom-element prototype methods live in the page's main world and are not
    // reliably visible from this isolated extension world. The main-world adapter
    // already validates the transport API before publishing hasMedia.
    return document.querySelector('strmcx-embed');
  }

  function cleanup() {
    if (!window.__watchFusionMediaProbe) return;
    enabled = false; pageMedia = null;
    setPlayerSilence(false);
    clearInterval(sampleTimer); sampleTimer = null;
    if (eventTimer !== null) clearTimeout(eventTimer);
    eventTimer = null; observeMedia(null);
    window.removeEventListener('message', onWindowMessage);
    document.removeEventListener('load', onDocumentLoad, true);
    document.removeEventListener('play', onSourceAudioChange, true);
    document.removeEventListener('volumechange', onSourceAudioChange, true);
    const runtime = runtimeListenerAttached ? runtimeApi() : null;
    runtimeListenerAttached = false;
    if (runtime) {
      try { runtime.onMessage.removeListener(onRuntimeMessage); }
      catch (error) { if (!isRuntimeInvalidated(error)) throw error; }
    }
    window.postMessage({ channel:PAGE_CHANNEL, type:'dispose' }, '*');
    try { delete window.__watchFusionMediaProbeCleanup; } catch { window.__watchFusionMediaProbeCleanup = null; }
    try { delete window.__watchFusionMediaProbe; } catch { window.__watchFusionMediaProbe = false; }
  }
  window.__watchFusionMediaProbeCleanup = cleanup;

  function clickTransport(action) {
    const selectors = action === 'next'
      ? ['.ytp-next-button','[aria-label*="Next" i]','[title*="Next" i]','[data-testid*="next" i]','[data-action*="next" i]']
      : ['.ytp-prev-button','[aria-label*="Previous" i]','[aria-label*="Back" i]','[title*="Previous" i]','[data-testid*="prev" i]','[data-action*="prev" i]'];
    const button = selectors.flatMap(selector => [...document.querySelectorAll(selector)])
      .find(element => element && !element.disabled && !element.hidden);
    if (!button) return false;
    button.click();
    return true;
  }

  function snapshot() {
    if (!enabled) return;
    updatePlayerSilence();
    const element = media();
    observeMedia(element);
    const controller = element ? null : pagePlayer();
    const hasMedia = Boolean(element || controller);
    const score = (element && !element.paused ? 4 : 0) + (element?.tagName === 'VIDEO' ? 2 : 0) + (controller ? 3 : 0);
    if (window !== top) parent.postMessage({ type:'watchfusion:media-frame', token:frameToken, hasMedia, score }, '*');
    sendRuntimeMessage({
      to:'worker', type:'sample', token:frameToken, topFrame:window === top, hasMedia, score,
      metadata: {
        pageUrl:location.href,
        sampledAt:Date.now(),
        title:pageMedia?.title || navigator.mediaSession?.metadata?.title || document.title,
        paused:element ? element.paused : pageMedia?.paused !== false,
        ended:element ? !!element.ended : !!pageMedia?.ended,
        buffering:element ? element.seeking || element.readyState < 3 : undefined,
        currentTime:element?.currentTime || pageMedia?.currentTime || 0,
        duration:Number.isFinite(element?.duration) ? element.duration : pageMedia?.duration || 0,
        rate:element?.playbackRate || pageMedia?.rate || 1,
        // The local output override must not mute WatchFusion's resolved player.
        volume:element ? ((priorMute.get(element) ?? element.muted) ? 0 : element.volume ?? 1) : pageMedia?.volume ?? 1,
        status:hasMedia ? '' : 'Waiting for playable media state.'
      }
    });
  }

  function onRuntimeMessage(message, _sender, reply) {
    if (message.type === 'probe-stop') { cleanup(); return; }
    if (message.type === 'probe-start') {
      enabled = true;
      setPlayerSilence(message.sourcePlayerSilenced === true);
      snapshot();
      return;
    }
    if (message.type === 'source-player-silence' && enabled) {
      setPlayerSilence(message.enabled === true);
      snapshot();
      reply?.({ silencedMedia:priorMute.size });
      return;
    }
    if (message.type !== 'source-control' || !enabled) return;
    const element = media(), controller = element ? null : pagePlayer(), value = Number(message.value) || 0;
    if (controller) {
      window.postMessage({ channel:PAGE_CHANNEL, type:'control', action:message.action, value }, '*');
      snapshot();
      return;
    }
    if (message.action === 'next' || message.action === 'prev') { clickTransport(message.action); snapshot(); return; }
    if (!element) return;
    if (message.action === 'toggle') { if (element.paused) element.play().catch(() => {}); else element.pause(); }
    if (message.action === 'play') element.play().catch(() => {});
    if (message.action === 'pause') element.pause();
    if (message.action === 'seek') element.currentTime = Math.max(0, Math.min(value, Number.isFinite(element.duration) ? element.duration : value));
    if (message.action === 'rate') element.playbackRate = Math.max(.25, Math.min(4, value));
    if (message.action === 'volume') {
      element.volume = Math.max(0, Math.min(1, value));
      if (priorMute.has(element)) priorMute.set(element, value === 0);
      else element.muted = value === 0;
    }
    snapshot();
  }

  window.addEventListener('message', onWindowMessage);
  document.addEventListener('load', onDocumentLoad, true);
  document.addEventListener('play', onSourceAudioChange, true);
  document.addEventListener('volumechange', onSourceAudioChange, true);
  const runtime = runtimeApi();
  if (!runtime) { cleanup(); return; }
  try {
    runtime.onMessage.addListener(onRuntimeMessage);
    runtimeListenerAttached = true;
  } catch (error) {
    cleanup();
    if (isRuntimeInvalidated(error)) return;
    throw error;
  }
  sampleTimer = setInterval(snapshot, 350);
  snapshot();
})();
