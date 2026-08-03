(function () {
  const WB = window.WorldBook;
  const rules = WB.IntegrityRules = WB.IntegrityRules || [];

  rules.push(function brokenReferences(_state, context, findings, kit) {
    context.nodes.filter(node => node.nodeRole === "reference").forEach(node => {
      const target = context.byId.get(node.referenceTargetId);
      if (!target || target.nodeRole === "reference") {
        kit.addFinding(findings, {
          type: "broken-reference", severity: "error", title: "Broken shortcut",
          summary: "This shortcut no longer reaches a valid canonical source.",
          targetIds: [node.id], relatedIds: target ? [target.id] : [],
          evidence: [context.pathById.get(node.id), `Target ID: ${node.referenceTargetId || "missing"}`],
          action: "repair-reference"
        });
      }
      if (kit.factualText(node) || (node.links || []).length || (node.tags || []).length || (node.children || []).length) {
        kit.addFinding(findings, {
          type: "reference-drift", severity: "error", title: "Shortcut owns independent data",
          summary: "A shortcut must display its source without developing separate facts, links, tags, or children.",
          targetIds: [node.id], relatedIds: target ? [target.id] : [],
          evidence: [context.pathById.get(node.id)], action: "clean-reference"
        });
      }
    });
  });

  rules.push(function linkIntegrity(_state, context, findings, kit) {
    context.canonical.forEach(source => {
      const seen = new Set();
      WB.Links.normalizeList(source.links).forEach(link => {
        const target = context.byId.get(link.targetId);
        if (!target || target.nodeRole === "reference") {
          kit.addFinding(findings, {
            type: "broken-link", severity: "error", title: "Link target is missing",
            summary: "This typed link points to an entry that no longer exists as a canonical source.",
            targetIds: [source.id], relatedIds: target ? [target.id] : [],
            evidence: [context.pathById.get(source.id), `Target ID: ${link.targetId}`], action: "repair-link"
          });
        }
        const key = `${link.targetId}|${link.relationshipType || "related-to"}`;
        if (seen.has(key)) {
          kit.addFinding(findings, {
            type: "duplicate-link", severity: "review", title: "Duplicate typed relationship",
            summary: "The same authoritative relationship is stored more than once on this source.",
            targetIds: [source.id], relatedIds: [link.targetId],
            evidence: [context.pathById.get(source.id), `Relationship: ${link.relationshipType || "related-to"}`],
            action: "deduplicate-link"
          });
        }
        seen.add(key);
        if (!link.relationshipType || link.relationshipType === "related-to") {
          kit.addFinding(findings, {
            type: "generic-link", severity: "opportunity", title: "Generic link could explain itself",
            summary: "The connection works, but a typed relationship would preserve why these entries are connected.",
            targetIds: [source.id], relatedIds: [link.targetId],
            evidence: [context.pathById.get(source.id), target ? context.pathById.get(target.id) : "Missing target"],
            action: "type-link"
          });
        }
      });
    });
  });

  rules.push(function canonicalIdentity(_state, context, findings, kit) {
    const ids = new Map();
    context.canonical.forEach(node => {
      const key = String(node.canonicalId || node.id);
      if (ids.has(key)) {
        kit.addFinding(findings, {
          type: "duplicate-canonical-id", severity: "error", title: "Two entries claim one canonical identity",
          summary: "Canonical IDs must be unique or edits and shortcuts may resolve to the wrong source.",
          targetIds: [ids.get(key).id, node.id],
          evidence: [context.pathById.get(ids.get(key).id), context.pathById.get(node.id)],
          action: "repair-identity", detail: key
        });
      } else ids.set(key, node);
    });

    const groups = new Map();
    context.entityFolders.forEach(node => {
      const key = kit.normalizedName(node.name);
      if (key.length < 4 || kit.STRUCTURAL.has(key) || /\d$/.test(key)) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    });
    groups.forEach(group => {
      if (group.length < 2) return;
      kit.addFinding(findings, {
        type: "duplicate-canonical-name", severity: "review", title: "Possible duplicate canonical entries",
        summary: "These entity-like folders share a name. Confirm they are separate identities rather than copied homes.",
        targetIds: group.map(node => node.id), count: group.length,
        evidence: group.slice(0, 6).map(node => context.pathById.get(node.id)),
        action: "compare-duplicates", detail: kit.normalizedName(group[0].name)
      });
    });
  });

  function relationshipFacts(context, kit) {
    const patterns = [
      { type: "best-friend-of", regex: /\bbest\s+friend(?:\s+is|\s*:|\s+of)?\s+([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)?)/giu },
      { type: "love-interest-of", regex: /\b(?:current\s+main\s+)?love\s+interest(?:\s+is|\s*:|\s+of)?\s+([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)?)/giu }
    ];
    const facts = [];
    context.canonical.forEach(node => {
      const text = kit.factualText(node);
      if (!text) return;
      const subject = kit.nearestEntity(context, node);
      if (!subject) return;
      if (!/^\s*no\s+love\s+interest\b/i.test(text)) {
        patterns.forEach(def => {
          def.regex.lastIndex = 0;
          let match;
          while ((match = def.regex.exec(text))) {
            const target = kit.resolveNamedEntity(context, match[1]);
            if (target && target.id !== subject.id) {
              facts.push({ type: def.type, subject, target, sourceNode: node, excerpt: match[0] });
            }
          }
        });
      }
      const possessive = /\b([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)?)[’']s\s+love\s+interest\b/giu;
      let match;
      while ((match = possessive.exec(text))) {
        const owner = kit.resolveNamedEntity(context, match[1]);
        if (owner && owner.id !== subject.id) {
          facts.push({ type: "love-interest-of", subject: owner, target: subject, sourceNode: node, excerpt: match[0] });
        }
      }
    });
    return facts;
  }

  rules.push(function relationshipProse(state, context, findings, kit) {
    const groups = new Map();
    relationshipFacts(context, kit).forEach(fact => {
      const pair = [fact.subject.id, fact.target.id].sort();
      const key = `${fact.type}|${pair.join("|")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(fact);
    });
    groups.forEach(group => {
      const sources = new Set(group.map(fact => fact.sourceNode.id));
      const first = group[0];
      const linkExists = WB.Links.forEntry(state, first.subject.id).some(link => {
        const endpoint = link._incoming ? link._sourceId : link.targetId;
        return endpoint === first.target.id && link.relationshipType === first.type;
      });
      if (sources.size >= 2) {
        kit.addFinding(findings, {
          type: "mirrored-relationship-prose", severity: "review", title: "Relationship is mirrored in multiple files",
          summary: "One typed relationship can own this fact and display it from both characters without drift.",
          targetIds: [first.subject.id, first.target.id], relatedIds: [...sources], count: sources.size,
          evidence: group.slice(0, 6).map(fact => `${context.pathById.get(fact.sourceNode.id)} — ${fact.excerpt}`),
          action: "create-relationship", detail: first.type
        });
      } else if (linkExists) {
        kit.addFinding(findings, {
          type: "relationship-prose-after-link", severity: "opportunity", title: "Typed relationship is repeated in prose",
          summary: "The link already owns this relationship. Keep only character-specific context in the prose.",
          targetIds: [first.subject.id, first.target.id], relatedIds: [...sources],
          evidence: group.map(fact => `${context.pathById.get(fact.sourceNode.id)} — ${fact.excerpt}`),
          action: "review-prose", detail: first.type
        });
      }
    });
  });

  rules.push(function lensCopies(state, context, findings, kit) {
    context.canonical.forEach(node => {
      const lens = kit.lensAncestor(context, node);
      const name = kit.normalizedName(node.name);
      if (!lens || kit.STRUCTURAL.has(name) || name.length < 5) return;
      let best = null, bestScore = 0;
      context.canonical.forEach(candidate => {
        if (candidate.id === node.id || WB.isVirtualDescendant(state.virtualRoot, candidate.id, lens.id)) return;
        const score = kit.similarity(node.name, candidate.name);
        if (score > bestScore) { best = candidate; bestScore = score; }
      });
      if (!best || bestScore < 0.7) return;
      kit.addFinding(findings, {
        type: "lens-copy-candidate", severity: "opportunity", title: "Lens child may be better as a shortcut",
        summary: "This entry sits beneath a lens-style folder and closely matches another canonical source elsewhere.",
        targetIds: [node.id], relatedIds: [best.id],
        evidence: [context.pathById.get(node.id), context.pathById.get(best.id)],
        action: "convert-to-shortcut", detail: lens.id
      });
    });
  });

  function evidenceForEntity(context, entity, excluded, kit) {
    const targetWords = kit.words(entity.name).filter(word => word.length > 3);
    if (!targetWords.length) return [];
    const evidence = [];
    context.canonical.forEach(node => {
      if (excluded.has(node.id)) return;
      const text = kit.textOf(node).toLowerCase();
      if (!text) return;
      const exact = text.includes(String(entity.name).toLowerCase());
      const matched = targetWords.filter(word => text.includes(word)).length;
      if (exact || (targetWords.length >= 2 && matched / targetWords.length >= 0.66)) {
        evidence.push(context.pathById.get(node.id));
      }
    });
    return [...new Set(evidence)].slice(0, 6);
  }

  rules.push(function emptyCanonicalSources(_state, context, findings, kit) {
    const sourceNames = new Set(["info", "observed effects", "pledge", "formation", "roles", "last known status"]);
    context.canonical.forEach(node => {
      if (node.type !== "file" || kit.factualText(node) || !sourceNames.has(kit.normalizedName(node.name))) return;
      const entity = kit.nearestEntity(context, context.parentById.get(node.id) || node);
      if (!entity) return;
      const excluded = new Set();
      WB.walkVirtual(entity, child => excluded.add(child.id));
      const evidence = evidenceForEntity(context, entity, excluded, kit);
      if (!evidence.length) return;
      kit.addFinding(findings, {
        type: "empty-canonical-source", severity: "review", title: "Canonical source is empty while facts exist elsewhere",
        summary: `${entity.name} has a dedicated ${node.name} file, but other entries appear to carry its stable facts.`,
        targetIds: [node.id, entity.id], evidence: [context.pathById.get(node.id), ...evidence],
        action: "move-facts-to-owner", detail: entity.id
      });
    });
  });

  rules.push(function smartCollectionCandidates(_state, context, findings, kit) {
    context.canonical.forEach(node => {
      if (node.type !== "file" || !kit.SMART_CATEGORIES.has(kit.normalizedName(node.name))) return;
      let current = context.parentById.get(node.id), insideIntroduced = false;
      while (current) {
        if (kit.normalizedName(current.name) === "introduced elements") insideIntroduced = true;
        current = context.parentById.get(current.id);
      }
      if (!insideIntroduced) return;
      kit.addFinding(findings, {
        type: "smart-collection-candidate", severity: "opportunity", title: "Manual chapter index could become a smart collection",
        summary: "This category can display canonical entries from introduction links instead of owning a second list.",
        targetIds: [node.id], evidence: [context.pathById.get(node.id)], action: "convert-to-smart-collection"
      });
    });
  });

  rules.push(function scaffolding(state, context, findings, kit) {
    const marked = new Set(state.integrity.intentionalScaffoldingIds || []), candidates = [], statsCache = new Map();
    context.canonical.filter(node => node.type === "folder").forEach(node => {
      if ((context.pathById.get(node.id) || "").split(" › ").length < 5 || marked.has(node.id)) return;
      let ancestor = context.parentById.get(node.id);
      while (ancestor) {
        if (marked.has(ancestor.id)) return;
        ancestor = context.parentById.get(ancestor.id);
      }
      const stats = kit.emptyLeafStats(node, statsCache);
      if (stats.total >= 12 && stats.empty / Math.max(1, stats.total) >= 0.86) candidates.push({ node, stats });
    });
    const chosen = candidates.filter(item => !candidates.some(other => {
      return other.node.id !== item.node.id && WB.isVirtualDescendant(state.virtualRoot, item.node.id, other.node.id);
    }));
    chosen.forEach(({ node, stats }) => kit.addFinding(findings, {
      type: "possible-scaffolding", severity: "info", title: "Large mostly-empty branch may be intentional scaffolding",
      summary: "Marking this branch as intentional preserves its structural meaning and suppresses repeated empty-node warnings.",
      targetIds: [node.id], count: stats.empty,
      evidence: [context.pathById.get(node.id), `${stats.empty} of ${stats.total} leaf entries are empty`],
      action: "mark-scaffolding"
    }));
  });

  rules.push(function provenance(_state, context, findings, kit) {
    const missing = context.canonical.filter(node => kit.factualText(node) && !Object.keys(node.provenance || {}).length);
    if (!missing.length) return;
    kit.addFinding(findings, {
      type: "provenance-gap", severity: "info", title: "Factual entries are missing source provenance",
      summary: "Chapter and confirmation metadata are needed before the World Book can reliably answer what was known at a specific story point.",
      targetIds: missing.slice(0, 30).map(node => node.id), count: missing.length,
      evidence: missing.slice(0, 6).map(node => context.pathById.get(node.id)),
      action: "populate-provenance", detail: String(missing.length)
    });
  });
})();
