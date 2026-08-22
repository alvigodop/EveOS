import { emitWorldStateChange } from "./world-events.js";

export function createWorldAutosave({ portal, state, delay = 650 }) {
  let timer = 0;
  let saving = null;
  let queued = false;
  let lastReason = "";

  function publish(status, message, error = null) {
    emitWorldStateChange("worldSaveState", status, { status, message, error });
  }


  async function publishSaved(world) {
    let estimate = null;
    try { estimate = await navigator.storage?.estimate?.(); } catch { estimate = null; }
    const ratio = estimate?.quota ? estimate.usage / estimate.quota : 0;
    if (ratio > 0.85) {
      publish("warning", `Storage nearly full · ${Math.round(ratio * 100)}% used`);
    } else publish("saved", `Saved locally · ${world.name}`);
  }

  async function flush(reason = lastReason || "World updated") {
    window.clearTimeout(timer);
    timer = 0;
    if (portal.getActiveWorld().builtin) {
      publish("session", "Built-in Earth changes remain in this session until exported.");
      return null;
    }
    if (saving) {
      queued = true;
      return saving;
    }
    portal.updateActiveViewState(state);
    publish("saving", `Saving locally… ${reason}`);
    saving = portal.saveActiveWorld().then(async (world) => {
      await publishSaved(world);
      return world;
    }).catch((error) => {
      console.error(error);
      publish("failed", error?.message || String(error), error);
      throw error;
    }).finally(() => {
      saving = null;
      if (queued) {
        queued = false;
        schedule("Queued changes");
      }
    });
    return saving;
  }

  function schedule(reason = "World updated", immediate = false) {
    lastReason = reason;
    if (portal.getActiveWorld().builtin) {
      publish("session", "Built-in Earth changes are session-only unless exported.");
      return;
    }
    window.clearTimeout(timer);
    publish("pending", `Saving soon… ${reason}`);
    timer = window.setTimeout(() => flush(reason), immediate ? 0 : delay);
  }

  function handleVisibility() {
    if (document.visibilityState === "hidden" && timer) flush("Browser state checkpoint");
  }

  document.addEventListener("visibilitychange", handleVisibility);
  return {
    schedule,
    flush,
    destroy() {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    },
  };
}
