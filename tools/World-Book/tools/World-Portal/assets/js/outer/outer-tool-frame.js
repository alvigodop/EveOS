export function buildOuterToolFrameUrl(entry, baseUrl, context = null, reloadRevision = null) {
  const url = new URL(entry, baseUrl);
  for (const key of [
    "wpWorldKey", "wpWorldName", "wpSyncRevision", "wpSyncToken", "wpHandoffId",
    "wpToolId", "wpSourceCommit", "wpReload",
  ]) {
    url.searchParams.delete(key);
  }
  if (context?.worldKey && context?.revision && context?.syncToken
    && context?.toolId && context?.sourceCommit) {
    url.searchParams.set("wpWorldKey", context.worldKey);
    url.searchParams.set("wpWorldName", context.worldName || context.worldKey);
    url.searchParams.set("wpSyncRevision", String(context.revision));
    url.searchParams.set("wpSyncToken", context.syncToken);
    if (context.handoffId) url.searchParams.set("wpHandoffId", context.handoffId);
    url.searchParams.set("wpToolId", context.toolId || "orogen");
    if (context.sourceCommit) url.searchParams.set("wpSourceCommit", context.sourceCommit);
  }
  if (reloadRevision !== null) url.searchParams.set("wpReload", String(reloadRevision));
  return url.href;
}

export function matchOuterToolFrameContext(state, context, baseUrl) {
  if (!state?.loaded || !context || !state.sourceUrl) return null;
  try {
    const url = new URL(state.sourceUrl, baseUrl);
    const matches = url.origin === new URL(baseUrl).origin
      && url.pathname === "/outer/orogen/import.html"
      && url.searchParams.get("wpWorldKey") === context.worldKey
      && Number(url.searchParams.get("wpSyncRevision")) === Number(context.revision)
      && url.searchParams.get("wpSyncToken") === context.syncToken
      && url.searchParams.get("wpHandoffId") === context.handoffId
      && url.searchParams.get("wpToolId") === context.toolId
      && url.searchParams.get("wpSourceCommit") === context.sourceCommit;
    return matches ? context : null;
  } catch {
    return null;
  }
}

// Orogen keeps its own document, JavaScript realm, settings, and dependencies.
// Host communication is through a validated message contract. The audited
// legacy fallback is limited to render capture and camera events on its canvas.
export function createOuterToolFrame({ onStateChange } = {}) {
  let frame = null;
  let host = null;
  let toolId = null;
  let entry = null;
  let sourceUrl = null;
  let worldContext = null;
  let loaded = false;
  let loading = false;
  let loadRevision = 0;

  function snapshot() {
    return {
      toolId, entry, sourceUrl, loaded, loading, loadRevision,
      worldKey: worldContext?.worldKey || null,
      attached: Boolean(frame),
    };
  }

  function publish() {
    onStateChange?.(snapshot());
    return snapshot();
  }

  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.className = "outer-port__frame";
    frame.title = "Embedded World Orogen";
    frame.setAttribute("allow", "fullscreen");
    // Same-origin requests must retain the document query so the server can
    // bind assets to the exact world/revision/token that requested them.
    frame.referrerPolicy = "same-origin";
    frame.addEventListener("load", () => {
      try {
        const actualUrl = frame.contentWindow?.location?.href || "";
        if (actualUrl === "about:blank") return;
        if (/^https?:/i.test(actualUrl)) {
          sourceUrl = actualUrl;
          const actual = new URL(actualUrl);
          if (actual.origin === window.location.origin
            && ["/outer/orogen/import.html", "/outer/orogen/index.html"].includes(actual.pathname)) {
            entry = actual.pathname.slice(1);
          }
        }
      } catch {
        // The bridge will reject a source that is no longer on the exact origin.
      }
      loaded = true;
      loading = false;
      loadRevision += 1;
      publish();
    });
    return frame;
  }

  function attach(container) {
    host = container;
    if (!host) return publish();
    const element = ensureFrame();
    if (element.parentElement !== host) host.appendChild(element);
    return publish();
  }

  function load(nextToolId, nextEntry, { force = false, context = worldContext } = {}) {
    if (!nextEntry) return publish();
    const nextUrl = buildOuterToolFrameUrl(nextEntry, window.location.href, context);
    const element = ensureFrame();
    const changed = force || toolId !== nextToolId || entry !== nextEntry || sourceUrl !== nextUrl || !element.src;
    toolId = nextToolId;
    entry = nextEntry;
    sourceUrl = nextUrl;
    worldContext = context ? { ...context } : null;
    if (!changed) return publish();
    loaded = false;
    loading = true;
    publish();
    element.src = nextUrl;
    return snapshot();
  }

  function reload(context = worldContext) {
    if (!frame || !entry) return publish();
    worldContext = context ? { ...context } : null;
    sourceUrl = buildOuterToolFrameUrl(entry, window.location.href, worldContext, Date.now());
    loaded = false;
    loading = true;
    publish();
    frame.src = sourceUrl;
    return snapshot();
  }

  function openInTab() {
    if (!entry) return false;
    const url = sourceUrl || buildOuterToolFrameUrl(entry, window.location.href, worldContext);
    return Boolean(window.open(url, `outer-tool-${toolId}`, "noopener"));
  }

  function destroy() {
    frame?.remove();
    frame = null;
    loaded = false;
    loading = false;
    sourceUrl = null;
    worldContext = null;
    return publish();
  }

  return {
    attach, load, reload, openInTab, destroy, getState: snapshot,
    get element() { return frame; },
    get contentWindow() { return frame?.contentWindow || null; },
  };
}
