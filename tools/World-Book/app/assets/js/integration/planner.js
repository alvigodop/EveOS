(function () {
  const WB = window.WorldBook;
  const Core = WB.Integration.Core;
  const MAX_OPERATIONS = 5000;
  const MAX_HISTORY = 200;

  function normalizeInjection(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Injection metadata is missing.");
    const id = String(raw.id || "").trim();
    const title = String(raw.title || "").trim();
    const revision = Number(raw.revision == null ? 1 : raw.revision);
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(id)) {
      throw new Error("injection.id must be a stable 3–128 character identifier using letters, numbers, dots, dashes, or underscores.");
    }
    if (!title) throw new Error("injection.title is required.");
    if (!Number.isInteger(revision) || revision < 1) throw new Error("injection.revision must be a positive integer.");
    return {
      id,
      title,
      revision,
      author: String(raw.author || "Eve").trim() || "Eve",
      scope: String(raw.scope || "single-task").trim() || "single-task",
      description: String(raw.description || "").trim(),
      createdAt: raw.createdAt || WB.nowISO()
    };
  }

  function ensureIntegrationState(state) {
    state.integrations = state.integrations && typeof state.integrations === "object" ? state.integrations : {};
    state.integrations.applied = Array.isArray(state.integrations.applied) ? state.integrations.applied : [];
    state.integrations.protectedTag = Core.OWNER_TAG;
    return state.integrations;
  }

  function parsePayload(value) {
    const payload = typeof value === "string" ? JSON.parse(value) : value;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Injection JSON must be an object.");
    if (payload.format !== Core.FORMAT) throw new Error(`format must be "${Core.FORMAT}".`);
    if (Number(payload.formatVersion) !== Core.FORMAT_VERSION) {
      throw new Error(`Unsupported injection formatVersion. Expected ${Core.FORMAT_VERSION}.`);
    }
    const injection = normalizeInjection(payload.injection);
    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    if (!operations.length) throw new Error("At least one operation is required.");
    if (operations.length > MAX_OPERATIONS) throw new Error(`An injection may contain at most ${MAX_OPERATIONS.toLocaleString()} operations.`);
    return { payload, injection, operations };
  }

  function plan(state, input) {
    const parsed = parsePayload(input);
    const key = Core.injectionKey(parsed.injection);
    const existingApplied = Array.isArray(state?.integrations?.applied) ? state.integrations.applied : [];
    if (existingApplied.some(record => record.key === key)) {
      throw new Error(`Injection ${key} was already applied. Increase injection.revision for a deliberate update.`);
    }

    const nextState = Core.deepClone(state);
    ensureIntegrationState(nextState);
    Core.ensureOwnerTagDefinition(nextState);
    const changes = WB.Integration.Operations.applyOperations(nextState, parsed.operations, parsed.injection);
    WB.Taxonomy.normalizeState(nextState);
    WB.Links.normalizeState(nextState);
    WB.Canon.normalizeState(nextState);

    const historyRecord = {
      key,
      id: parsed.injection.id,
      revision: parsed.injection.revision,
      title: parsed.injection.title,
      author: parsed.injection.author,
      scope: parsed.injection.scope,
      appliedAt: WB.nowISO(),
      operationCount: parsed.operations.length,
      changeCount: changes.length
    };
    nextState.integrations.applied.unshift(historyRecord);
    nextState.integrations.applied = nextState.integrations.applied.slice(0, MAX_HISTORY);
    nextState.appVersion = WB.APP_VERSION;
    nextState.schemaVersion = Math.max(Number(nextState.schemaVersion || 0), 10);

    const warnings = [];
    if (!changes.length) warnings.push("The injection is valid but produces no state changes.");
    if (parsed.operations.length > 250) warnings.push("Large injection: review the preview carefully before applying.");

    return {
      nextState,
      changes,
      warnings,
      injection: parsed.injection,
      historyRecord,
      operationCount: parsed.operations.length
    };
  }

  function template() {
    return {
      format: Core.FORMAT,
      formatVersion: Core.FORMAT_VERSION,
      injection: {
        id: "lex-focused-task",
        revision: 1,
        title: "Focused World Book update",
        author: "Eve",
        scope: "single-task",
        description: "Created only when Alvin explicitly requests a World Book injection."
      },
      operations: [
        {
          op: "upsert",
          path: "The-Lex-New-World-Book/Characters/Main Character/Leon Kirumi/Eve Notes",
          type: "file",
          status: "draft",
          content: "Focused injected content goes here.",
          addTags: ["Leon Kirumi"],
          hideTags: [Core.OWNER_TAG],
          links: [
            {
              targetPath: "The-Lex-New-World-Book/Characters/Main Character/Leon Kirumi",
              label: "Leon Kirumi"
            }
          ]
        }
      ]
    };
  }

  WB.Integration.Planner = { parsePayload, plan, template, ensureIntegrationState };
})();
