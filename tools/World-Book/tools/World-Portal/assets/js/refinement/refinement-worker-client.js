function cloneForTransfer(value, transfers) {
  if (ArrayBuffer.isView(value)) {
    const copy = new value.constructor(value);
    transfers.push(copy.buffer);
    return copy;
  }
  if (Array.isArray(value)) return value.map((item) => cloneForTransfer(item, transfers));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => (
      [key, cloneForTransfer(item, transfers)]
    )));
  }
  return value;
}

export function createRefinementWorker() {
  const worker = new Worker(new URL("./refinement-worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let sequence = 0;
  worker.onmessage = (event) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.result);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Refinement worker failed.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  return {
    run(operation, payload) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const transfers = [];
        const transferablePayload = cloneForTransfer(payload, transfers);
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, operation, payload: transferablePayload }, transfers);
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}
