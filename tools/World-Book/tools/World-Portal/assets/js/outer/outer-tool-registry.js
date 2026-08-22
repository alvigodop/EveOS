const STATUS_URLS = [
  "assets/data/outer-tools.runtime.json",
  "assets/data/outer-tools.default.json",
];

// Fallback identity used when the status file is missing, so the panel can still
// explain what the tool is and how to initialize it. Availability stays false.
const FALLBACK_TOOLS = [
  {
    id: "orogen",
    name: "World Orogen",
    kind: "world 3D planetary tool",
    path: "outer/orogen",
    entry: "outer/orogen/import.html",
    generator: "outer/orogen/index.html",
    license: "GPL-3.0",
    repository: "https://github.com/raguilar011095/planet_heightmap_generation",
    hosted: "https://www.orogen.studio/",
  },
];

export function normalizeOuterTool(tool) {
  const commit = typeof tool.commit === "string" && tool.commit ? tool.commit : null;
  return {
    id: String(tool.id || "unknown"),
    name: String(tool.name || "Outer tool"),
    kind: String(tool.kind || "external tool"),
    path: String(tool.path || ""),
    entry: String(tool.entry || ""),
    generator: tool.generator ? String(tool.generator) : null,
    license: tool.license ? String(tool.license) : null,
    repository: tool.repository ? String(tool.repository) : null,
    hosted: tool.hosted ? String(tool.hosted) : null,
    available: tool.available === true,
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    syncSupported: tool.syncSupported === true,
    syncReason: String(tool.syncReason || "World sync status is unavailable."),
    syncing: tool.syncing === true,
    syncEndpoint: String(tool.syncEndpoint || "/__outer/orogen/sync"),
    updateEndpoint: String(tool.updateEndpoint || "/__outer/orogen/update"),
    bridgeProtocol: String(tool.bridgeProtocol || "world-portal.orogen-bridge"),
    bridgeProtocolVersion: Number(tool.bridgeProtocolVersion) || 1,
  };
}

async function loadStatusSource() {
  for (const url of STATUS_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json();
      if (Array.isArray(payload?.tools) && payload.tools.length) return payload.tools;
    } catch {
      // Continue through runtime, portable default, then hardcoded identity.
    }
  }
  return FALLBACK_TOOLS;
}

// A vendored tool is only usable if its entry document actually resolves. The
// status file records what the server saw at startup; this re-checks at runtime
// so a submodule initialized mid-session is picked up on refresh.
async function entryResolves(entry) {
  if (!entry) return false;
  try {
    const response = await fetch(entry, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export function describeStatus(tool) {
  if (!tool.available) return { state: "missing", label: "not initialized" };
  if (!tool.commit) return { state: "ready", label: "ready" };
  return { state: "ready", label: `ready @ ${tool.commitShort}` };
}

export function initializationHint(tool) {
  return `${tool.name} is not present. Run: git submodule update --init ${tool.path}`;
}

export function createOuterToolRegistry() {
  let tools = [];
  let loaded = false;

  async function load() {
    const source = await loadStatusSource();
    const normalized = source.map(normalizeOuterTool);
    // Trust the live check over the startup snapshot.
    const checks = await Promise.all(normalized.map((tool) => entryResolves(tool.entry)));
    tools = normalized.map((tool, index) => ({ ...tool, available: checks[index] }));
    loaded = true;
    return tools;
  }

  return {
    load,
    isLoaded: () => loaded,
    getTools: () => tools.map((tool) => ({ ...tool })),
    getTool(id) {
      const tool = tools.find((item) => item.id === id);
      return tool ? { ...tool } : null;
    },
    availableCount: () => tools.filter((tool) => tool.available).length,
  };
}
