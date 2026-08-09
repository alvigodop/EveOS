(function () {
  const WB = window.WorldBook;

  WB.APP_VERSION = "0.16.0";
  WB.EVE_INJECTION_TAG = "Injected from Eve";

  WB.nowISO = function () {
    return new Date().toISOString();
  };

  WB.makeId = function (prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix || "node"}-${Date.now().toString(36)}-${random}`;
  };

  WB.escapeHTML = function (value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  WB.normalizeTags = function (value) {
    const source = Array.isArray(value) ? value : String(value || "").split(",");
    const result = [];
    const seen = new Set();
    source.forEach(raw => {
      const tag = String(raw || "").trim();
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return;
      seen.add(key);
      result.push(tag);
    });
    return result;
  };

  WB.createVirtualNode = function (type, name, options) {
    const opts = options || {};
    const timestamp = WB.nowISO();
    const tags = WB.normalizeTags(opts.tags);

    return {
      id: opts.id || WB.makeId(type),
      type: type === "folder" ? "folder" : "file",
      name: String(name || (type === "folder" ? "New Folder" : "New File")),
      status: opts.status || "draft",
      tags,
      sharedTags: type === "folder" ? WB.normalizeTags(opts.sharedTags) : [],
      visibleTags: WB.normalizeTags(opts.visibleTags == null ? tags : opts.visibleTags),
      links: Array.isArray(opts.links) ? opts.links : [],
      semanticKind: String(opts.semanticKind || (type === "folder" ? "container" : "document")),
      nodeRole: String(opts.nodeRole || "canonical"),
      canonicalId: String(opts.canonicalId || opts.id || ""),
      referenceTargetId: String(opts.referenceTargetId || ""),
      collectionRule: opts.collectionRule && typeof opts.collectionRule === "object" ? opts.collectionRule : null,
      provenance: opts.provenance && typeof opts.provenance === "object" ? opts.provenance : {},
      content: String(opts.content || ""),
      open: opts.open !== false,
      createdAt: opts.createdAt || timestamp,
      updatedAt: opts.updatedAt || timestamp,
      children: type === "folder" ? (Array.isArray(opts.children) ? opts.children : []) : []
    };
  };

  WB.walkVirtual = function (node, callback, parent) {
    callback(node, parent || null);
    if (node.type === "folder") {
      node.children.forEach(child => WB.walkVirtual(child, callback, node));
    }
  };

  WB.findVirtual = function (root, id) {
    let found = null;
    WB.walkVirtual(root, node => {
      if (!found && node.id === id) found = node;
    });
    return found;
  };

  WB.findVirtualParent = function (root, id) {
    let found = null;
    WB.walkVirtual(root, (node, parent) => {
      if (!found && node.id === id) found = parent;
    });
    return found;
  };

  WB.virtualPath = function (root, id) {
    const path = [];

    function visit(node, current) {
      const next = [...current, node];
      if (node.id === id) {
        path.push(...next);
        return true;
      }
      if (node.type === "folder") {
        for (const child of node.children) {
          if (visit(child, next)) return true;
        }
      }
      return false;
    }

    visit(root, []);
    return path;
  };

  WB.isVirtualDescendant = function (root, possibleDescendantId, ancestorId) {
    const ancestor = WB.findVirtual(root, ancestorId);
    if (!ancestor || ancestor.type !== "folder") return false;
    let found = false;
    (ancestor.children || []).forEach(child => {
      if (found) return;
      WB.walkVirtual(child, node => {
        if (node.id === possibleDescendantId) found = true;
      });
    });
    return found;
  };

  WB.moveVirtualTo = function (root, nodeId, newParentId, requestedIndex) {
    if (!root || nodeId === root.id) throw new Error("The World Book root cannot be moved.");

    const node = WB.findVirtual(root, nodeId);
    const oldParent = WB.findVirtualParent(root, nodeId);
    const newParent = WB.findVirtual(root, newParentId);

    if (!node || !oldParent) throw new Error("The entry being moved was not found.");
    if (!newParent || newParent.type !== "folder") throw new Error("The destination must be a folder.");
    if (newParent.id === node.id || WB.isVirtualDescendant(root, newParent.id, node.id)) {
      throw new Error("A folder cannot be moved inside itself or one of its descendants.");
    }

    const oldIndex = oldParent.children.findIndex(child => child.id === nodeId);
    if (oldIndex < 0) throw new Error("The entry could not be detached from its current folder.");

    oldParent.children.splice(oldIndex, 1);

    let index = Number.isFinite(Number(requestedIndex)) ? Number(requestedIndex) : newParent.children.length;
    if (oldParent.id === newParent.id && oldIndex < index) index -= 1;
    index = Math.max(0, Math.min(newParent.children.length, index));

    newParent.children.splice(index, 0, node);
    const timestamp = WB.nowISO();
    oldParent.updatedAt = timestamp;
    newParent.updatedAt = timestamp;
    node.updatedAt = timestamp;
    newParent.open = true;

    return {
      nodeId,
      oldParentId: oldParent.id,
      oldIndex,
      newParentId: newParent.id,
      newIndex: index,
      movedAt: timestamp
    };
  };

  WB.moveVirtualRelative = function (root, nodeId, targetId, position) {
    if (nodeId === targetId) return null;
    const target = WB.findVirtual(root, targetId);
    if (!target) throw new Error("The drop target was not found.");

    if (position === "inside") {
      if (target.type !== "folder") throw new Error("Only folders can contain other entries.");
      return WB.moveVirtualTo(root, nodeId, target.id, target.children.length);
    }

    const parent = WB.findVirtualParent(root, targetId);
    if (!parent) throw new Error("The target has no movable parent.");
    const targetIndex = parent.children.findIndex(child => child.id === targetId);
    const index = position === "before" ? targetIndex : targetIndex + 1;
    return WB.moveVirtualTo(root, nodeId, parent.id, index);
  };

  WB.undoVirtualMove = function (root, record) {
    if (!record) return null;
    return WB.moveVirtualTo(root, record.nodeId, record.oldParentId, record.oldIndex);
  };

  WB.removeVirtual = function (root, id) {
    const parent = WB.findVirtualParent(root, id);
    if (!parent) return false;

    const index = parent.children.findIndex(child => child.id === id);
    if (index === -1) return false;

    parent.children.splice(index, 1);
    parent.updatedAt = WB.nowISO();
    return true;
  };

  WB.ensureHistoryState = function (state) {
    state.history = state.history && typeof state.history === "object" ? state.history : {};
    state.history.deleted = Array.isArray(state.history.deleted) ? state.history.deleted : [];
    state.history.deleted = state.history.deleted.filter(record => record && record.node && record.id);
    return state.history;
  };

  WB.deleteVirtualToHistory = function (state, id) {
    const root = state.virtualRoot;
    if (!root || id === root.id) throw new Error("The World Book root cannot be deleted.");
    const parent = WB.findVirtualParent(root, id);
    if (!parent) throw new Error("The entry being deleted was not found.");
    const index = parent.children.findIndex(child => child.id === id);
    if (index < 0) throw new Error("The entry could not be detached from its folder.");
    const [node] = parent.children.splice(index, 1);
    const timestamp = WB.nowISO();
    parent.updatedAt = timestamp;
    const history = WB.ensureHistoryState(state);
    const record = {
      id: WB.makeId("deleted"),
      node,
      parentId: parent.id,
      parentPath: WB.virtualPath(root, parent.id).map(item => item.name).join(" / "),
      index,
      deletedAt: timestamp
    };
    history.deleted.unshift(record);
    history.deleted = history.deleted.slice(0, 100);
    return record;
  };

  WB.restoreDeletedVirtual = function (state, recordId) {
    const history = WB.ensureHistoryState(state);
    const recordIndex = history.deleted.findIndex(record => record.id === recordId);
    if (recordIndex < 0) throw new Error("The deleted entry is no longer available.");
    const record = history.deleted[recordIndex];
    let parent = WB.findVirtual(state.virtualRoot, record.parentId);
    if (!parent || parent.type !== "folder") parent = state.virtualRoot;
    const existingIds = new Set();
    WB.walkVirtual(state.virtualRoot, node => existingIds.add(node.id));
    if (existingIds.has(record.node.id)) throw new Error("An active entry already uses this deleted entry ID.");
    const siblingNames = new Set((parent.children || []).map(node => String(node.name).toLowerCase()));
    if (siblingNames.has(String(record.node.name).toLowerCase())) {
      const base = `${record.node.name} (restored)`;
      let name = base;
      let counter = 2;
      while (siblingNames.has(name.toLowerCase())) name = `${base} ${counter++}`;
      record.node.name = name;
    }
    const index = Math.max(0, Math.min(parent.children.length, Number(record.index) || 0));
    parent.children.splice(index, 0, record.node);
    parent.open = true;
    const timestamp = WB.nowISO();
    parent.updatedAt = timestamp;
    record.node.updatedAt = timestamp;
    history.deleted.splice(recordIndex, 1);
    return { node: record.node, parent, restoredAt: timestamp };
  };

  WB.purgeDeletedVirtual = function (state, recordId) {
    const history = WB.ensureHistoryState(state);
    const index = history.deleted.findIndex(record => record.id === recordId);
    if (index < 0) return false;
    history.deleted.splice(index, 1);
    return true;
  };

  WB.fileMeta = function (state, path) {
    state.fileMeta = state.fileMeta || {};
    state.fileMeta[path] = state.fileMeta[path] || {
      status: "draft",
      tags: [],
      sharedTags: [],
      visibleTags: [],
      notes: "",
      links: [],
      updatedAt: WB.nowISO()
    };
    const meta = state.fileMeta[path];
    meta.tags = WB.normalizeTags(meta.tags);
    meta.sharedTags = WB.normalizeTags(meta.sharedTags);
    meta.visibleTags = WB.normalizeTags(meta.visibleTags == null ? meta.tags : meta.visibleTags);
    return meta;
  };

  WB.buildSnapshotTree = function (snapshot) {
    const rootName = snapshot.workspace && snapshot.workspace.rootName
      ? snapshot.workspace.rootName
      : "Imported Workspace";

    const root = {
      id: "snapshot-root",
      name: rootName,
      relativePath: "",
      kind: "folder",
      children: [],
      open: true,
      source: "import"
    };

    const byPath = new Map([["", root]]);
    const entries = snapshot.physicalSnapshot && Array.isArray(snapshot.physicalSnapshot.entries)
      ? snapshot.physicalSnapshot.entries
      : [];

    const sorted = [...entries].sort((a, b) => {
      const depthA = String(a.relativePath || "").split("/").length;
      const depthB = String(b.relativePath || "").split("/").length;
      return depthA - depthB || String(a.relativePath).localeCompare(String(b.relativePath));
    });

    for (const entry of sorted) {
      const rel = String(entry.relativePath || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
      if (!rel) continue;

      const parts = rel.split("/");
      const parentPath = parts.slice(0, -1).join("/");
      const parent = byPath.get(parentPath) || root;
      const node = {
        ...entry,
        id: `snapshot:${rel}`,
        name: entry.name || parts.at(-1),
        relativePath: rel,
        kind: entry.kind || "file",
        children: [],
        open: false,
        source: "import"
      };

      parent.children.push(node);
      byPath.set(rel, node);
    }

    function sortNode(node) {
      node.children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortNode);
    }

    sortNode(root);
    return root;
  };
})();
