(function () {
  const WB = window.WorldBook;
  const STRUCTURAL = new Set([
    "info", "social", "members", "roles", "formation", "pledge", "stats", "core relationship",
    "base relationship", "base relationships", "plot ties", "introduced elements", "event timeline",
    "locations", "factions", "mysteries", "characters organizations", "characters and organizations",
    "observed effects"
  ]);
  const LENSES = new Set([
    "plot ties", "social", "members", "introduced elements", "core to location",
    "base relationship", "base relationships", "organization orbit"
  ]);
  const SMART_CATEGORIES = new Set([
    "characters organizations", "characters and organizations", "locations", "factions", "mysteries"
  ]);

  function words(value) {
    return String(value || "").normalize("NFKD").replace(/[’']/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  }
  function normalizedName(value) { return words(value).join(" "); }
  function textOf(node) { return [node?.name, node?.content, node?.notes].filter(Boolean).join("\n").trim(); }
  function factualText(node) { return [node?.content, node?.notes].filter(Boolean).join("\n").trim(); }
  function isCanonical(node) { return node && node.nodeRole !== "reference" && node.nodeRole !== "smart-collection"; }

  function fingerprint(type, ids, detail) {
    const raw = [type, ...(ids || []).map(String).sort(), String(detail || "")].join("|");
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) { hash ^= raw.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${type}:${(hash >>> 0).toString(36)}`;
  }

  function addFinding(list, input) {
    const targetIds = [...new Set((input.targetIds || []).filter(Boolean))];
    const relatedIds = [...new Set((input.relatedIds || []).filter(Boolean))];
    list.push({
      severity: input.severity || "review", type: input.type, title: input.title, summary: input.summary,
      targetIds, relatedIds, evidence: (input.evidence || []).filter(Boolean).slice(0, 8),
      count: Number(input.count || 1), action: input.action || "review",
      fingerprint: fingerprint(input.type, [...targetIds, ...relatedIds], input.detail || input.title)
    });
  }

  function makeContext(state) {
    const nodes = [], byId = new Map(), parentById = new Map(), pathById = new Map();
    function visit(node, parent, path) {
      const nextPath = [...path, node.name];
      nodes.push(node); byId.set(node.id, node); parentById.set(node.id, parent || null);
      pathById.set(node.id, nextPath.join(" › "));
      if (node.type === "folder") (node.children || []).forEach(child => visit(child, node, nextPath));
    }
    visit(state.virtualRoot, null, []);
    const canonical = nodes.filter(isCanonical);
    const entityFolders = canonical.filter(node => {
      if (node.type !== "folder") return false;
      if (node.semanticKind && !["container", "collection"].includes(node.semanticKind)) return true;
      return (node.children || []).some(child => {
        const name = normalizedName(child.name);
        return name === "info" || name.includes("stats") || name === "org core";
      });
    });
    const entityIds = new Set(entityFolders.map(node => node.id)), nameIndex = new Map();
    entityFolders.forEach(node => {
      [normalizedName(node.name), words(node.name)[0]].filter(Boolean).forEach(key => {
        if (!nameIndex.has(key)) nameIndex.set(key, []);
        nameIndex.get(key).push(node);
      });
    });
    return { state, nodes, canonical, byId, parentById, pathById, entityFolders, entityIds, nameIndex };
  }

  function nearestEntity(context, node) {
    let current = node;
    while (current) {
      if (context.entityIds.has(current.id)) return current;
      current = context.parentById.get(current.id);
    }
    return null;
  }

  function resolveNamedEntity(context, raw) {
    const exact = context.nameIndex.get(normalizedName(raw)) || [];
    if (exact.length === 1) return exact[0];
    const short = context.nameIndex.get(words(raw)[0] || "") || [];
    return short.length === 1 ? short[0] : null;
  }

  function lensAncestor(context, node) {
    let current = context.parentById.get(node.id);
    while (current) {
      if (LENSES.has(normalizedName(current.name))) return current;
      current = context.parentById.get(current.id);
    }
    return null;
  }

  function similarity(a, b) {
    const left = [...new Set(words(a).filter(word => word.length > 2))];
    const right = [...new Set(words(b).filter(word => word.length > 2))];
    if (!left.length || !right.length) return 0;
    if (normalizedName(a) === normalizedName(b)) return 1;
    const shared = left.filter(word => right.includes(word)).length;
    if (Math.min(left.length, right.length) === 1 && shared === 1) return 0.72;
    return shared / Math.max(left.length, right.length);
  }

  function emptyLeafStats(node, cache) {
    const memo = cache || new Map();
    if (memo.has(node.id)) return memo.get(node.id);
    if (!isCanonical(node)) return { total: 0, empty: 0, factual: 0 };
    const ownFactual = Boolean(factualText(node) || (node.links || []).length);
    let result;
    if (node.type !== "folder" || !(node.children || []).length) {
      result = { total: 1, empty: ownFactual ? 0 : 1, factual: ownFactual ? 1 : 0 };
    } else {
      result = node.children.reduce((sum, child) => {
        const stats = emptyLeafStats(child, memo);
        sum.total += stats.total; sum.empty += stats.empty; sum.factual += stats.factual;
        return sum;
      }, { total: 0, empty: 0, factual: ownFactual ? 1 : 0 });
    }
    memo.set(node.id, result);
    return result;
  }

  const kit = {
    STRUCTURAL, LENSES, SMART_CATEGORIES, words, normalizedName, textOf, factualText, isCanonical,
    addFinding, nearestEntity, resolveNamedEntity, lensAncestor, similarity, emptyLeafStats
  };

  WB.Integrity = WB.Integrity || {};
  Object.assign(WB.Integrity, {
    normalizeState(state) {
      state.integrity = state.integrity && typeof state.integrity === "object" ? state.integrity : {};
      state.integrity.schemaVersion = 1;
      state.integrity.ignored = state.integrity.ignored && typeof state.integrity.ignored === "object"
        ? state.integrity.ignored : {};
      state.integrity.intentionalScaffoldingIds = Array.isArray(state.integrity.intentionalScaffoldingIds)
        ? [...new Set(state.integrity.intentionalScaffoldingIds.map(String))] : [];
      state.integrity.preferences = state.integrity.preferences && typeof state.integrity.preferences === "object"
        ? state.integrity.preferences : {};
      return state.integrity;
    },
    scan(state) {
      this.normalizeState(state);
      const context = makeContext(state), findings = [];
      (WB.IntegrityRules || []).forEach(rule => rule(state, context, findings, kit));
      const ignored = state.integrity.ignored || {};
      findings.forEach(finding => {
        finding.ignored = Boolean(ignored[finding.fingerprint]);
        finding.paths = finding.targetIds.map(id => context.pathById.get(id)).filter(Boolean);
      });
      const order = { error: 0, review: 1, opportunity: 2, info: 3 };
      findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.title.localeCompare(b.title));
      state.integrity.lastScanAt = WB.nowISO();
      return {
        findings, scannedAt: state.integrity.lastScanAt,
        counts: findings.reduce((counts, finding) => {
          counts.total += 1; counts[finding.severity] = (counts[finding.severity] || 0) + 1;
          if (finding.ignored) counts.ignored += 1;
          return counts;
        }, { total: 0, error: 0, review: 0, opportunity: 0, info: 0, ignored: 0 })
      };
    }
  });
})();
