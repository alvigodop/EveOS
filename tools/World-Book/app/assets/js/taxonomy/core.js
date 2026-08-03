(function () {
  const WB = window.WorldBook;

  const DEFAULT_STATUSES = [
    { id: "canon", name: "Canon" },
    { id: "draft", name: "Draft" },
    { id: "uncertain", name: "Uncertain canon" },
    { id: "recovered", name: "Recovered" },
    { id: "retired", name: "Retired canon" }
  ];

  function cleanName(value) {
    return String(value || "").trim();
  }

  function titleFromIdentifier(value) {
    const text = String(value || "draft").replaceAll("-", " ").replaceAll("_", " ").trim();
    return text ? text[0].toUpperCase() + text.slice(1) : "Draft";
  }

  function allVirtualNodes(state) {
    const nodes = [];
    WB.walkVirtual(state.virtualRoot, node => nodes.push(node));
    return nodes;
  }

  function rewriteTagArray(values, oldName, newName) {
    return WB.normalizeTags((values || []).map(tag =>
      tag.toLowerCase() === oldName.toLowerCase() ? newName : tag
    ));
  }

  function removeTagFromArray(values, name) {
    return WB.normalizeTags(values).filter(tag => tag.toLowerCase() !== name.toLowerCase());
  }

  function addSource(map, name, source) {
    const clean = cleanName(name);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: clean, sources: [] });
    }
    const record = map.get(key);
    if (!record.sources.some(existing => existing.type === source.type && existing.origin === source.origin)) {
      record.sources.push(source);
    }
  }

  function sourceRank(source) {
    if (source.type === "manual") return 0;
    if (source.type === "shared") return 1;
    if (source.type === "path") return 2;
    return 3;
  }



  WB.Taxonomy = {
    normalizeState(state) {
      let changed = false;
      const now = WB.nowISO();

      state.tagDefinitions = Array.isArray(state.tagDefinitions) ? state.tagDefinitions : [];
      state.statusDefinitions = Array.isArray(state.statusDefinitions) && state.statusDefinitions.length
        ? state.statusDefinitions
        : DEFAULT_STATUSES.map(item => ({ ...item, createdAt: now, updatedAt: now }));
      state.tagAutomation = state.tagAutomation && typeof state.tagAutomation === "object"
        ? state.tagAutomation
        : { pathTagsEnabled: true, mentionTagsEnabled: true };
      if (typeof state.tagAutomation.pathTagsEnabled !== "boolean") {
        state.tagAutomation.pathTagsEnabled = true;
        changed = true;
      }
      if (typeof state.tagAutomation.mentionTagsEnabled !== "boolean") {
        state.tagAutomation.mentionTagsEnabled = true;
        changed = true;
      }

      const statusIds = new Set();
      state.statusDefinitions = state.statusDefinitions.filter(definition => {
        if (!definition || typeof definition !== "object") {
          changed = true;
          return false;
        }
        definition.id = cleanName(definition.id) || WB.makeId("status");
        definition.name = cleanName(definition.name) || titleFromIdentifier(definition.id);
        definition.createdAt = definition.createdAt || now;
        definition.updatedAt = definition.updatedAt || now;
        if (statusIds.has(definition.id)) {
          changed = true;
          return false;
        }
        statusIds.add(definition.id);
        return true;
      });

      const tagNames = new Map();
      state.tagDefinitions = state.tagDefinitions.filter(definition => {
        if (typeof definition === "string") {
          definition = { id: WB.makeId("tag"), name: definition, createdAt: now, updatedAt: now };
          changed = true;
        }
        if (!definition || typeof definition !== "object") {
          changed = true;
          return false;
        }
        definition.name = cleanName(definition.name);
        if (!definition.name) {
          changed = true;
          return false;
        }
        const key = definition.name.toLowerCase();
        if (tagNames.has(key)) {
          changed = true;
          return false;
        }
        definition.id = cleanName(definition.id) || WB.makeId("tag");
        definition.createdAt = definition.createdAt || now;
        definition.updatedAt = definition.updatedAt || now;
        tagNames.set(key, definition);
        return true;
      });

      const usedStatuses = new Set();
      const usedTags = [];
      Object.values(state.fileMeta || {}).forEach(meta => {
        if (!meta || typeof meta !== "object") return;
        const oldTags = JSON.stringify(meta.tags || []);
        const oldShared = JSON.stringify(meta.sharedTags || []);
        const oldVisible = JSON.stringify(meta.visibleTags == null ? null : meta.visibleTags);
        meta.tags = WB.normalizeTags(meta.tags);
        meta.sharedTags = WB.normalizeTags(meta.sharedTags).filter(tag =>
          meta.tags.some(manual => manual.toLowerCase() === tag.toLowerCase())
        );
        meta.visibleTags = WB.normalizeTags(meta.visibleTags == null ? meta.tags : meta.visibleTags);
        if (oldTags !== JSON.stringify(meta.tags) || oldShared !== JSON.stringify(meta.sharedTags) || oldVisible !== JSON.stringify(meta.visibleTags)) {
          changed = true;
        }
        usedTags.push(...meta.tags);
        usedStatuses.add(meta.status || "draft");
      });

      allVirtualNodes(state).forEach(node => {
        const oldTags = JSON.stringify(node.tags || []);
        const oldShared = JSON.stringify(node.sharedTags || []);
        const oldVisible = JSON.stringify(node.visibleTags == null ? null : node.visibleTags);
        node.tags = WB.normalizeTags(node.tags);
        node.sharedTags = node.type === "folder"
          ? WB.normalizeTags(node.sharedTags).filter(tag =>
              node.tags.some(manual => manual.toLowerCase() === tag.toLowerCase())
            )
          : [];
        node.visibleTags = WB.normalizeTags(node.visibleTags == null ? node.tags : node.visibleTags);
        if (oldTags !== JSON.stringify(node.tags) || oldShared !== JSON.stringify(node.sharedTags) || oldVisible !== JSON.stringify(node.visibleTags)) {
          changed = true;
        }
        usedTags.push(...node.tags);
        usedStatuses.add(node.status || "draft");
      });

      usedTags.forEach(name => {
        const key = cleanName(name).toLowerCase();
        if (!key || tagNames.has(key)) return;
        const definition = {
          id: WB.makeId("tag"),
          name: cleanName(name),
          createdAt: now,
          updatedAt: now
        };
        state.tagDefinitions.push(definition);
        tagNames.set(key, definition);
        changed = true;
      });

      usedStatuses.forEach(id => {
        if (!id || statusIds.has(id)) return;
        state.statusDefinitions.push({
          id,
          name: titleFromIdentifier(id),
          createdAt: now,
          updatedAt: now
        });
        statusIds.add(id);
        changed = true;
      });

      state.tagDefinitions.sort((a, b) => a.name.localeCompare(b.name));
      return changed;
    },

    statusName(state, id) {
      const definition = (state.statusDefinitions || []).find(item => item.id === id);
      return definition ? definition.name : titleFromIdentifier(id);
    },

    ensureTag(state, name) {
      const clean = cleanName(name);
      if (!clean) return null;
      const existing = (state.tagDefinitions || []).find(
        item => item.name.toLowerCase() === clean.toLowerCase()
      );
      if (existing) return existing;
      const definition = {
        id: WB.makeId("tag"),
        name: clean,
        createdAt: WB.nowISO(),
        updatedAt: WB.nowISO()
      };
      state.tagDefinitions.push(definition);
      state.tagDefinitions.sort((a, b) => a.name.localeCompare(b.name));
      return definition;
    },

    createStatus(state, name) {
      const clean = cleanName(name);
      if (!clean) return null;
      const existing = (state.statusDefinitions || []).find(
        item => item.name.toLowerCase() === clean.toLowerCase()
      );
      if (existing) return existing;
      const definition = {
        id: WB.makeId("status"),
        name: clean,
        createdAt: WB.nowISO(),
        updatedAt: WB.nowISO()
      };
      state.statusDefinitions.push(definition);
      return definition;
    },

    renameTag(state, id, newName) {
      const definition = state.tagDefinitions.find(item => item.id === id);
      const clean = cleanName(newName);
      if (!definition || !clean) return false;
      const conflict = state.tagDefinitions.some(
        item => item.id !== id && item.name.toLowerCase() === clean.toLowerCase()
      );
      if (conflict) throw new Error(`The tag "${clean}" already exists.`);
      const oldName = definition.name;
      definition.name = clean;
      definition.updatedAt = WB.nowISO();

      Object.values(state.fileMeta || {}).forEach(meta => {
        meta.tags = rewriteTagArray(meta.tags, oldName, clean);
        meta.sharedTags = rewriteTagArray(meta.sharedTags, oldName, clean);
        meta.visibleTags = rewriteTagArray(meta.visibleTags, oldName, clean);
        meta.updatedAt = WB.nowISO();
      });
      allVirtualNodes(state).forEach(node => {
        node.tags = rewriteTagArray(node.tags, oldName, clean);
        node.sharedTags = rewriteTagArray(node.sharedTags, oldName, clean);
        node.visibleTags = rewriteTagArray(node.visibleTags, oldName, clean);
        node.updatedAt = WB.nowISO();
      });
      state.tagDefinitions.sort((a, b) => a.name.localeCompare(b.name));
      return true;
    },

    deleteTag(state, id) {
      const definition = state.tagDefinitions.find(item => item.id === id);
      if (!definition) return false;
      const name = definition.name;
      state.tagDefinitions = state.tagDefinitions.filter(item => item.id !== id);
      Object.values(state.fileMeta || {}).forEach(meta => {
        meta.tags = removeTagFromArray(meta.tags, name);
        meta.sharedTags = removeTagFromArray(meta.sharedTags, name);
        meta.visibleTags = removeTagFromArray(meta.visibleTags, name);
        meta.updatedAt = WB.nowISO();
      });
      allVirtualNodes(state).forEach(node => {
        node.tags = removeTagFromArray(node.tags, name);
        node.sharedTags = removeTagFromArray(node.sharedTags, name);
        node.visibleTags = removeTagFromArray(node.visibleTags, name);
        node.updatedAt = WB.nowISO();
      });
      return true;
    },

    renameStatus(state, id, newName) {
      const definition = state.statusDefinitions.find(item => item.id === id);
      const clean = cleanName(newName);
      if (!definition || !clean) return false;
      const conflict = state.statusDefinitions.some(
        item => item.id !== id && item.name.toLowerCase() === clean.toLowerCase()
      );
      if (conflict) throw new Error(`The status "${clean}" already exists.`);
      definition.name = clean;
      definition.updatedAt = WB.nowISO();
      return true;
    },

    statusUsage(state, id) {
      let count = 0;
      Object.values(state.fileMeta || {}).forEach(meta => {
        if ((meta.status || "draft") === id) count += 1;
      });
      allVirtualNodes(state).forEach(node => {
        if ((node.status || "draft") === id) count += 1;
      });
      return count;
    },

    deleteStatus(state, id) {
      if (this.statusUsage(state, id) > 0) {
        throw new Error("This status is still attached to entries. Reassign them before deleting it.");
      }
      if (state.statusDefinitions.length <= 1) {
        throw new Error("At least one status must remain.");
      }
      state.statusDefinitions = state.statusDefinitions.filter(item => item.id !== id);
      return true;
    },

    simpleTagInfo(manualTags, visibleTags) {
      const manual = WB.normalizeTags(manualTags);
      const visibleSet = new Set(WB.normalizeTags(visibleTags == null ? manual : visibleTags).map(tag => tag.toLowerCase()));
      const effective = manual.map(name => ({
        name,
        sources: [{ type: "manual", origin: "This entry" }],
        visible: visibleSet.has(name.toLowerCase())
      }));
      return {
        effective,
        visible: effective.filter(item => item.visible),
        manual,
        shared: [],
        visibleNames: [...visibleSet]
      };
    },

    virtualTagInfo(state, node, options) {
      const opts = options || {};
      const path = WB.virtualPath(state.virtualRoot, node.id);
      const map = new Map();
      const manual = WB.normalizeTags(opts.tags == null ? node.tags : opts.tags);
      const visibleTags = WB.normalizeTags(opts.visibleTags == null ? node.visibleTags : opts.visibleTags);
      const visibleSet = new Set(visibleTags.map(tag => tag.toLowerCase()));
      const pathEnabled = opts.pathTagsEnabled == null
        ? state.tagAutomation?.pathTagsEnabled !== false
        : Boolean(opts.pathTagsEnabled);

      manual.forEach(tag => addSource(map, tag, { type: "manual", origin: "This entry" }));

      path.slice(0, -1).forEach((ancestor, index) => {
        if (ancestor.id === state.virtualRoot.id) return;
        WB.normalizeTags(ancestor.sharedTags).forEach(tag => {
          addSource(map, tag, { type: "shared", origin: ancestor.name, depth: index });
        });
      });

      if (pathEnabled) {
        path.slice(2, -1).forEach(ancestor => {
          addSource(map, ancestor.name, { type: "path", origin: ancestor.name });
        });
      }

      const mentionEnabled = opts.mentionTagsEnabled == null
        ? state.tagAutomation?.mentionTagsEnabled !== false
        : Boolean(opts.mentionTagsEnabled);
      if (mentionEnabled) {
        WB.TagMentions.find(state, node.content || "", [...map.values()].map(item => item.name)).forEach(tag => {
          addSource(map, tag, { type: "mention", origin: "Connected notes" });
        });
      }

      const effective = [...map.values()].map(item => ({
        ...item,
        sources: item.sources.sort((a, b) => sourceRank(a) - sourceRank(b)),
        visible: visibleSet.has(item.name.toLowerCase())
      }));
      effective.sort((a, b) => {
        const aRank = Math.min(...a.sources.map(sourceRank));
        const bRank = Math.min(...b.sources.map(sourceRank));
        return aRank - bRank || a.name.localeCompare(b.name);
      });

      return {
        effective,
        visible: effective.filter(item => item.visible),
        manual,
        shared: WB.normalizeTags(opts.sharedTags == null ? node.sharedTags : opts.sharedTags),
        visibleNames: visibleTags,
        pathEnabled,
        mentionEnabled,
        path
      };
    },

    tagSourceLabel(source) {
      if (source.type === "manual") return "Manual";
      if (source.type === "shared") return `Shared from ${source.origin}`;
      if (source.type === "path") return "Path";
      return "Mentioned in connected notes";
    },

    virtualTaggedEntries(state) {
      const entries = [];
      WB.walkVirtual(state.virtualRoot, node => {
        const info = this.virtualTagInfo(state, node);
        const tags = info.effective.map(item => item.name);
        if (!tags.length) return;
        entries.push({
          source: "virtual",
          key: `virtual:${node.id}`,
          id: node.id,
          name: node.name,
          path: WB.virtualPath(state.virtualRoot, node.id).map(item => item.name).join(" › "),
          kind: node.type,
          tags,
          tagInfo: info.effective,
          status: node.status || "draft",
          updatedAt: node.updatedAt || node.createdAt || "",
          modifiedAt: node.updatedAt || "",
          metaUpdatedAt: node.updatedAt || ""
        });
      });
      return entries;
    }
  };


})();
