(function () {
  const WB = window.WorldBook;

  const DEFAULT_RELATIONSHIPS = [
    { id: "related-to", name: "related to", inverse: "related to", symmetric: true },
    { id: "occurs-at", name: "occurs at", inverse: "location of" },
    { id: "member-of", name: "member of", inverse: "has member" },
    { id: "introduced-in", name: "introduced in", inverse: "introduced" },
    { id: "originated-from", name: "originated from", inverse: "origin of" },
    { id: "part-of", name: "part of", inverse: "contains" },
    { id: "caused-by", name: "caused by", inverse: "caused" },
    { id: "best-friend-of", name: "best friend of", inverse: "best friend of", symmetric: true },
    { id: "love-interest-of", name: "love interest of", inverse: "love interest of", symmetric: true },
    { id: "mentioned", name: "mentioned", inverse: "mentioned by" }
  ];

  function normalizeKind(node) {
    if (!node.semanticKind) node.semanticKind = node.type === "folder" ? "container" : "document";
    if (!node.nodeRole) node.nodeRole = "canonical";
    if (!node.canonicalId) node.canonicalId = node.nodeRole === "reference" ? node.referenceTargetId : node.id;
    node.provenance = node.provenance && typeof node.provenance === "object" ? node.provenance : {};
  }

  function definition(state, id) {
    return (state.relationshipDefinitions || []).find(item => item.id === id) || DEFAULT_RELATIONSHIPS[0];
  }

  function matchesRule(state, node, rule) {
    if (!node || node.nodeRole === "reference" || node.nodeRole === "smart-collection") return false;
    if (Array.isArray(rule.semanticKinds) && rule.semanticKinds.length && !rule.semanticKinds.includes(node.semanticKind)) return false;
    if (Array.isArray(rule.statuses) && rule.statuses.length && !rule.statuses.includes(node.status)) return false;
    const tags = new Set(WB.Taxonomy.virtualTagInfo(state, node).effective.map(item => String(item?.name || item).toLowerCase()));
    if (Array.isArray(rule.tagsAll) && rule.tagsAll.some(tag => !tags.has(String(tag).toLowerCase()))) return false;
    if (Array.isArray(rule.tagsAny) && rule.tagsAny.length && !rule.tagsAny.some(tag => tags.has(String(tag).toLowerCase()))) return false;
    if (rule.relationshipType && rule.relationshipTargetId) {
      const links = WB.Links.forEntry(state, node.id);
      if (!links.some(link => link.relationshipType === rule.relationshipType && link.targetId === rule.relationshipTargetId)) return false;
    }
    return true;
  }

  function refreshSmartCollection(state, collection) {
    if (collection.nodeRole !== "smart-collection" || collection.type !== "folder") return;
    const rule = collection.collectionRule || {};
    const existingAliases = new Map((collection.children || []).filter(x => x.nodeRole === "reference").map(x => [x.referenceTargetId, x.name]));
    const results = [];
    WB.walkVirtual(state.virtualRoot, node => {
      if (node.id === collection.id || WB.isVirtualDescendant(state.virtualRoot, node.id, collection.id)) return;
      if (!matchesRule(state, node, rule)) return;
      results.push(node);
    });
    results.sort((a,b) => String(a.name).localeCompare(String(b.name)));
    collection.children = results.map(target => ({
      id: `ref-${collection.id}-${target.id}`,
      type: target.type,
      name: existingAliases.get(target.id) || target.name,
      status: target.status,
      tags: [], sharedTags: [], visibleTags: [], links: [], content: "", children: [], open: false,
      semanticKind: target.semanticKind,
      nodeRole: "reference",
      canonicalId: target.id,
      referenceTargetId: target.id,
      referenceContext: "smart-collection",
      createdAt: collection.createdAt || WB.nowISO(), updatedAt: WB.nowISO(), provenance: {}
    }));
  }

  WB.Canon = {
    DEFAULT_RELATIONSHIPS,
    normalizeState(state) {
      state.relationshipDefinitions = Array.isArray(state.relationshipDefinitions) && state.relationshipDefinitions.length
        ? state.relationshipDefinitions : DEFAULT_RELATIONSHIPS.map(x => ({...x}));
      const ids = new Set(state.relationshipDefinitions.map(x => x.id));
      DEFAULT_RELATIONSHIPS.forEach(x => { if (!ids.has(x.id)) state.relationshipDefinitions.push({...x}); });
      WB.walkVirtual(state.virtualRoot, node => normalizeKind(node));
      WB.walkVirtual(state.virtualRoot, node => {
        if (node.nodeRole === "reference") {
          const target = WB.findVirtual(state.virtualRoot, node.referenceTargetId);
          if (target && target.nodeRole !== "reference") {
            node.name = node.referenceAlias || target.name;
            node.status = target.status;
            node.semanticKind = target.semanticKind;
            node.type = target.type;
          }
        }
      });
      WB.walkVirtual(state.virtualRoot, node => refreshSmartCollection(state, node));
      return state;
    },
    relationDefinition: definition,
    matchesRule,
    refreshSmartCollection,
    createReference(target, alias, context) {
      return WB.createVirtualNode(target.type, alias || target.name, {
        id: WB.makeId("ref"), nodeRole: "reference", canonicalId: target.id,
        referenceTargetId: target.id, semanticKind: target.semanticKind,
        status: target.status, open: false, content: ""
      });
    },
    resolveNode(state, node) {
      if (node?.nodeRole !== "reference") return node;
      return WB.findVirtual(state.virtualRoot, node.referenceTargetId) || node;
    },
    refreshSmartCollections(state) {
      WB.walkVirtual(state.virtualRoot, node => refreshSmartCollection(state, node));
    }
  };
})();
