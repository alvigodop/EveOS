import { matchOuterToolFrameContext } from "./outer-tool-frame.js";

export async function revalidateOuterToolContext({
  portal, sync, frame, mirror, bridge, tool, worldGeneration, baseUrl,
  reload = "changed", onStateChange,
}) {
  const world = portal.getActiveWorld();
  const worldId = String(world?.id ?? portal.activeWorldId ?? "");
  const selectedGeneration = worldGeneration();
  const previousContext = sync.getFrameContext();
  await sync.selectWorld({ worldKey: worldId, worldName: world?.name || worldId });
  if (selectedGeneration !== worldGeneration()
    || worldId !== String(portal.activeWorldId ?? "")) {
    return { stale: true, context: null, checkoutChanged: false };
  }
  const state = sync.getState();
  const context = sync.getFrameContext();
  const checkoutChanged = Boolean(tool?.commit && state.liveSourceCommit !== tool.commit);
  const fields = ["worldKey", "revision", "syncToken", "handoffId", "toolId", "sourceCommit"];
  const contextChanged = fields.some((key) => previousContext?.[key] !== context?.[key]);
  const frameState = frame.getState();
  let importContextMismatch = false;
  let exactImportContext = false;
  try {
    const frameUrl = new URL(frameState.sourceUrl, baseUrl);
    exactImportContext = Boolean(context) && Boolean(matchOuterToolFrameContext(
      { ...frameState, loaded: true }, context, baseUrl,
    ));
    importContextMismatch = Boolean(context) && frameUrl.pathname === "/outer/orogen/import.html"
      && !exactImportContext;
  } catch {
    // A missing frame URL is handled by the caller's attach/load path.
  }
  if (checkoutChanged) {
    mirror.invalidate("The checked-out Orogen revision changed; the old mirror was cleared.");
    bridge.detach();
  } else if (!context) {
    if (mirror.getState().requested) {
      mirror.invalidate("World sync is not active for this exact world revision.");
    }
    bridge.detach();
  }
  const bridgeRebound = exactImportContext && frameState.loaded
    && bridge.getState?.().state === "detached";
  if (bridgeRebound) {
    bridge.attach({ sourceWindow: frame.contentWindow, sourceUrl: frameState.sourceUrl, context });
  }
  if ((reload === true || (reload === "changed"
    && (contextChanged || checkoutChanged || importContextMismatch)))
    && frameState.attached) frame.reload(context);
  onStateChange?.();
  return {
    stale: false, context, checkoutChanged, contextChanged,
    importContextMismatch, bridgeRebound,
  };
}
