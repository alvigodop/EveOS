(function () {
  const WB = window.WorldBook;

  const KIND_OPTIONS = [
    "character", "organization", "family", "class-group", "location", "sublocation",
    "faction", "phenomenon", "mystery", "event", "object", "system", "ability",
    "container", "document"
  ];

  function normalizeList(value) {
    if (Array.isArray(value)) return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
    return [...new Set(String(value || "").split(",").map(item => item.trim()).filter(Boolean))];
  }

  function normalizeRule(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const rule = {};
    const semanticKinds = normalizeList(input.semanticKinds);
    const statuses = normalizeList(input.statuses);
    const tagsAll = normalizeList(input.tagsAll);
    const tagsAny = normalizeList(input.tagsAny);
    if (semanticKinds.length) rule.semanticKinds = semanticKinds;
    if (statuses.length) rule.statuses = statuses;
    if (tagsAll.length) rule.tagsAll = tagsAll;
    if (tagsAny.length) rule.tagsAny = tagsAny;
    if (input.relationshipType && input.relationshipTargetId) {
      rule.relationshipType = String(input.relationshipType);
      rule.relationshipTargetId = String(input.relationshipTargetId);
    }
    return rule;
  }

  function preview(state, rawRule, collectionId) {
    const rule = normalizeRule(rawRule);
    const results = [];
    WB.walkVirtual(state.virtualRoot, node => {
      if (node.id === collectionId) return;
      if (collectionId && WB.isVirtualDescendant(state.virtualRoot, node.id, collectionId)) return;
      if (WB.Canon.matchesRule(state, node, rule)) results.push(node);
    });
    return results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function uniqueName(parent, requested, excludeId) {
    const base = String(requested || "Smart Collection").trim() || "Smart Collection";
    const used = new Set((parent.children || []).filter(node => node.id !== excludeId).map(node => String(node.name).toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    let counter = 2;
    while (used.has(`${base} ${counter}`.toLowerCase())) counter += 1;
    return `${base} ${counter}`;
  }

  function save(state, options) {
    const parent = WB.findVirtual(state.virtualRoot, options.parentId);
    if (!parent || parent.type !== "folder") throw new Error("Choose a destination folder.");
    let node = options.collectionId ? WB.findVirtual(state.virtualRoot, options.collectionId) : null;
    if (node && node.nodeRole !== "smart-collection") throw new Error("Only a smart collection can be edited here.");
    const timestamp = WB.nowISO();
    if (!node) {
      node = WB.createVirtualNode("folder", uniqueName(parent, options.name), {
        nodeRole: "smart-collection", semanticKind: "collection", collectionRule: normalizeRule(options.rule)
      });
      parent.children.push(node);
    } else {
      const oldParent = WB.findVirtualParent(state.virtualRoot, node.id);
      if (oldParent && oldParent.id !== parent.id) WB.moveVirtualTo(state.virtualRoot, node.id, parent.id, parent.children.length);
      node.name = uniqueName(parent, options.name, node.id);
      node.collectionRule = normalizeRule(options.rule);
      node.semanticKind = "collection";
      node.nodeRole = "smart-collection";
      node.updatedAt = timestamp;
    }
    parent.open = true;
    parent.updatedAt = timestamp;
    WB.Canon.refreshSmartCollection(state, node);
    return node;
  }

  WB.SmartCollections = { KIND_OPTIONS, normalizeList, normalizeRule, preview, save };
})();
