export const WORLD_PORTAL_STATE_EVENT = "world-portal-state-change";

export function emitWorldStateChange(key, value, detail = {}) {
  window.dispatchEvent(new CustomEvent(WORLD_PORTAL_STATE_EVENT, {
    detail: { key, value, ...detail },
  }));
}
