export class HeightmapOperationCancelled extends Error {
  constructor(message = "The active world changed; the Heightmap Forge operation was cancelled.") {
    super(message);
    this.name = "HeightmapOperationCancelled";
    this.code = "HEIGHTMAP_FORGE_STALE_OPERATION";
  }
}

export function isHeightmapOperationCancelled(error) {
  return error?.code === "HEIGHTMAP_FORGE_STALE_OPERATION";
}

export function createHeightmapOperationGuard({ getWorldId, getSourceRevision } = {}) {
  let worldGeneration = 0;
  let sequence = 0;
  let destroyed = false;
  const scopes = new Map();

  function begin(scope, expectedWorldId = getWorldId?.()) {
    const request = ++sequence;
    scopes.set(scope, request);
    return Object.freeze({
      scope,
      request,
      worldId: String(expectedWorldId ?? ""),
      worldGeneration,
      sourceRevision: getSourceRevision?.() ?? null,
    });
  }

  function isCurrent(ticket) {
    return Boolean(ticket) && !destroyed
      && scopes.get(ticket.scope) === ticket.request
      && ticket.worldGeneration === worldGeneration
      && ticket.worldId === String(getWorldId?.() ?? "")
      && ticket.sourceRevision === (getSourceRevision?.() ?? null);
  }

  function assertCurrent(ticket, message) {
    if (!isCurrent(ticket)) throw new HeightmapOperationCancelled(message);
    return ticket;
  }

  function advanceWorld() {
    worldGeneration += 1;
    scopes.clear();
    return worldGeneration;
  }

  function cancel(scope) {
    if (scope) scopes.set(scope, ++sequence);
  }

  function destroy() {
    destroyed = true;
    worldGeneration += 1;
    scopes.clear();
  }

  return {
    begin, isCurrent, assertCurrent, advanceWorld, cancel, destroy,
    getWorldGeneration: () => worldGeneration,
  };
}
