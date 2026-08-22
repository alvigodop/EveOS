export function createHeightmapWorkerClient() {
  const worker = new Worker(new URL("./heightmap-worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let sequence = 0;

  worker.addEventListener("message", (event) => {
    const message = event.data || {};
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === "progress") {
      request.onProgress?.(message);
      return;
    }
    pending.delete(message.id);
    if (message.type === "result") request.resolve(message);
    else request.reject(new Error(message.message || "Heightmap processing failed."));
  });

  worker.addEventListener("error", (event) => {
    const error = event.error || new Error(event.message || "Heightmap worker failed.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });

  function process({ rgba, width, height, settings, onProgress }) {
    const id = `heightmap-${Date.now().toString(36)}-${sequence += 1}`;
    const transferable = rgba instanceof Uint8ClampedArray
      ? rgba : new Uint8ClampedArray(rgba);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage(
        { type: "process", id, rgba: transferable, width, height, settings },
        [transferable.buffer],
      );
    });
  }

  return {
    process,
    dispose() {
      worker.terminate();
      for (const request of pending.values()) {
        request.reject(new Error("Heightmap worker was closed."));
      }
      pending.clear();
    },
  };
}
