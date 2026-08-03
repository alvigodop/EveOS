(function () {
  const WB = window.WorldBook;
  const Core = WB.Integration.Core;

  function asObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    return value;
  }

  function asString(value, label, required) {
    const text = String(value == null ? "" : value).trim();
    if (required && !text) throw new Error(`${label} is required.`);
    return text;
  }


  function provenanceObject(value, label) {
    const source = asObject(value || {}, label);
    const result = {};
    Object.entries(source).forEach(([key, raw]) => {
      if (raw == null) return;
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        result[String(key)] = String(raw).trim();
      }
    });
    return result;
  }

  function addUniqueTags(node, values) {
    node.tags = WB.normalizeTags([...(node.tags || []), ...WB.normalizeTags(values)]);
  }

  function removeTags(node, values) {
    const remove = new Set(WB.normalizeTags(values).map(Core.normalizeName));
    remove.delete(Core.normalizeName(Core.OWNER_TAG));
    node.tags = WB.normalizeTags(node.tags).filter(tag => !remove.has(Core.normalizeName(tag)));
    node.sharedTags = WB.normalizeTags(node.sharedTags).filter(tag => !remove.has(Core.normalizeName(tag)));
    node.visibleTags = WB.normalizeTags(node.visibleTags).filter(tag => !remove.has(Core.normalizeName(tag)));
  }

  function updateVisibility(node, showTags, hideTags) {
    const shown = WB.normalizeTags([...(node.visibleTags || []), ...WB.normalizeTags(showTags)]);
    const hidden = new Set(WB.normalizeTags(hideTags).map(Core.normalizeName));
    hidden.add(Core.normalizeName(Core.OWNER_TAG));
    node.visibleTags = shown.filter(tag => !hidden.has(Core.normalizeName(tag)));
  }

  function updateSharing(node, shareTags, unshareTags) {
    if (node.type !== "folder") return;
    const manual = new Map(WB.normalizeTags(node.tags).map(tag => [Core.normalizeName(tag), tag]));
    const shared = new Map(WB.normalizeTags(node.sharedTags).map(tag => [Core.normalizeName(tag), tag]));
    WB.normalizeTags(shareTags).forEach(tag => {
      const key = Core.normalizeName(tag);
      if (!manual.has(key)) {
        node.tags = WB.normalizeTags([...(node.tags || []), tag]);
        manual.set(key, tag);
      }
      shared.set(key, manual.get(key));
    });
    WB.normalizeTags(unshareTags).forEach(tag => shared.delete(Core.normalizeName(tag)));
    node.sharedTags = [...shared.values()];
  }

  function normalizeLinkSpec(raw) {
    const link = asObject(raw, "Link");
    const targetPath = asString(link.targetPath, "Link targetPath", true);
    return { targetPath, label: asString(link.label, "Link label", false) };
  }

  function applyFields(state, node, spec, injection, created, pendingLinks, changes, path) {
    const before = JSON.stringify(node);
    if (Object.prototype.hasOwnProperty.call(spec, "status")) {
      node.status = asString(spec.status, "status", true);
    }
    if (Object.prototype.hasOwnProperty.call(spec, "content") && Object.prototype.hasOwnProperty.call(spec, "notes")) {
      throw new Error(`Use either content or notes, not both, for "${path}".`);
    }
    if (Object.prototype.hasOwnProperty.call(spec, "content")) node.content = String(spec.content ?? "");
    if (Object.prototype.hasOwnProperty.call(spec, "notes")) node.content = String(spec.notes ?? "");
    if (Object.prototype.hasOwnProperty.call(spec, "open") && node.type === "folder") node.open = Boolean(spec.open);
    if (Object.prototype.hasOwnProperty.call(spec, "provenance")) {
      const next = provenanceObject(spec.provenance, "provenance");
      node.provenance = spec.replaceProvenance === true ? next : { ...(node.provenance || {}), ...next };
    }

    addUniqueTags(node, spec.addTags || spec.tags || []);
    removeTags(node, spec.removeTags || []);
    updateVisibility(node, spec.showTags || [], spec.hideTags || []);
    updateSharing(node, spec.shareTags || [], spec.unshareTags || []);
    Core.markOwned(node, injection, created);

    if (Array.isArray(spec.links) || spec.replaceLinks === true) {
      pendingLinks.push({
        node,
        path,
        replace: spec.replaceLinks === true,
        links: Array.isArray(spec.links) ? spec.links.map(normalizeLinkSpec) : []
      });
    }

    node.updatedAt = WB.nowISO();
    if (before !== JSON.stringify(node) && !created) {
      changes.push({ kind: "update", path, detail: "Updated injection-owned entry" });
    }
  }

  function applyUpsert(state, operation, injection, context) {
    const path = Core.normalizePath(asString(operation.path, "upsert path", true));
    const type = String(operation.type || "file").toLowerCase();
    if (!['file', 'folder'].includes(type)) throw new Error(`Invalid type for "${path}".`);
    const segments = Core.pathSegments(state, path);
    if (!segments.length) throw new Error("The World Book root cannot be upserted.");

    const existing = Core.resolvePath(state, path).node;
    let node = existing;
    let created = false;
    if (node) {
      if (node.type !== type) throw new Error(`"${path}" exists as a ${node.type}, not a ${type}.`);
      if (!Core.isOwned(node) && !overrideAllowed(node, operation)) {
        throw new Error(`Protected entry "${path}" is not tagged ${Core.OWNER_TAG}. Use overrideProtected with expectedUpdatedAt for a deliberate exception.`);
      }
    } else {
      const parent = Core.ensureParents(state, segments.slice(0, -1), injection, context.changes);
      const name = segments.at(-1);
      const matches = Core.childMatches(parent, name);
      if (matches.length) throw new Error(`"${path}" appeared while the injection was being planned.`);
      node = Core.makeOwnedNode(type, name, injection);
      parent.children.push(node);
      parent.open = true;
      parent.updatedAt = WB.nowISO();
      created = true;
      context.changes.push({ kind: `create-${type}`, path: Core.pathForNode(state, node), detail: `Created injected ${type}` });
    }
    applyFields(state, node, operation, injection, created, context.pendingLinks, context.changes, Core.pathForNode(state, node));
  }

  function overrideAllowed(node, operation) {
    if (!operation.overrideProtected) return false;
    if (operation.expectedUpdatedAt && String(node.updatedAt || "") !== String(operation.expectedUpdatedAt)) {
      throw new Error("Protected override is stale: updatedAt no longer matches.");
    }
    return true;
  }

  function requireOwnedTarget(state, operation, label) {
    const path = Core.normalizePath(asString(operation.path, `${label} path`, true));
    const record = Core.resolvePath(state, path);
    if (!record.node) throw new Error(`Target "${path}" does not exist.`);
    if (record.node.id === state.virtualRoot.id) throw new Error("The World Book root is protected.");
    if (!Core.isOwned(record.node) && !overrideAllowed(record.node, operation)) throw new Error(`Protected entry "${path}" is not tagged ${Core.OWNER_TAG}. Use a narrow overrideProtected operation with expectedUpdatedAt.`);
    return { path, node: record.node, parent: record.parent };
  }

  function applyPatch(state, operation, injection, context) {
    const target = requireOwnedTarget(state, operation, "patch");
    applyFields(state, target.node, operation, injection, false, context.pendingLinks, context.changes, target.path);
  }

  function applyMove(state, operation, injection, context) {
    const target = requireOwnedTarget(state, operation, "move");
    const destinationPath = Core.normalizePath(asString(operation.destinationPath, "move destinationPath", true));
    const destination = Core.resolvePath(state, destinationPath).node;
    if (!destination || destination.type !== "folder") throw new Error(`Move destination "${destinationPath}" is not a folder.`);
    const position = operation.position == null ? "end" : operation.position;
    let index = destination.children.length;
    if (position === "start") index = 0;
    else if (position !== "end") {
      const numeric = Number(position);
      if (!Number.isInteger(numeric) || numeric < 0) throw new Error("Move position must be start, end, or a non-negative index.");
      index = numeric;
    }
    WB.moveVirtualTo(state.virtualRoot, target.node.id, destination.id, index);
    Core.markOwned(target.node, injection, false);
    context.changes.push({
      kind: "move",
      path: Core.pathForNode(state, target.node),
      detail: `Moved from ${target.path}`
    });
  }

  function applyRename(state, operation, injection, context) {
    const target = requireOwnedTarget(state, operation, "rename");
    const newName = asString(operation.newName, "rename newName", true);
    if (/[\\/]/.test(newName) || [".", ".."].includes(newName)) throw new Error("Rename newName must be one entry name.");
    const siblings = Core.childMatches(target.parent, newName).filter(node => node.id !== target.node.id);
    if (siblings.length) throw new Error(`A sibling named "${newName}" already exists.`);
    const oldPath = Core.pathForNode(state, target.node);
    target.node.name = newName;
    target.node.updatedAt = WB.nowISO();
    Core.markOwned(target.node, injection, false);
    context.changes.push({ kind: "rename", path: Core.pathForNode(state, target.node), detail: `Renamed from ${oldPath}` });
  }

  function resolvePendingLinks(state, pendingLinks, injection, changes) {
    pendingLinks.forEach(item => {
      const links = item.replace ? [] : WB.Links.normalizeList(item.node.links);
      item.links.forEach(spec => {
        const target = Core.resolvePath(state, spec.targetPath).node;
        if (!target) throw new Error(`Link target "${spec.targetPath}" was not found.`);
        const duplicate = links.some(link => link.targetId === target.id && String(link.label || "") === spec.label);
        if (!duplicate) {
          links.push({
            id: WB.makeId("link"),
            targetType: "virtual",
            targetId: target.id,
            label: spec.label,
            createdAt: WB.nowISO(),
            updatedAt: WB.nowISO()
          });
          changes.push({ kind: "link", path: Core.pathForNode(state, item.node), detail: `Linked to ${Core.pathForNode(state, target)}` });
        }
      });
      item.node.links = WB.Links.normalizeList(links);
      Core.markOwned(item.node, injection, false);
    });
  }

  function applyCreateStatus(state, operation, injection, context) {
    const name = asString(operation.name, "status name", true);
    const existing = (state.statusDefinitions || []).find(x => x.name.toLowerCase() === name.toLowerCase());
    if (existing) { context.changes.push({kind:"status", path:name, detail:"Status already exists"}); return; }
    const def = WB.Taxonomy.createStatus(state, name);
    if (operation.id) def.id = asString(operation.id, "status id", true);
    def.color = asString(operation.color, "status color", false);
    def.description = asString(operation.description, "status description", false);
    context.changes.push({kind:"create-status", path:name, detail:"Created custom status"});
  }

  function applyClassify(state, operation, injection, context) {
    const target = requireOwnedTarget(state, operation, "classify");
    if (target.node.nodeRole === "reference" || target.node.nodeRole === "smart-collection") {
      throw new Error("Only canonical entries and components can be classified.");
    }
    const semanticKind = asString(operation.semanticKind, "semanticKind", true);
    if (target.node.semanticKind !== semanticKind) {
      target.node.semanticKind = semanticKind;
      target.node.updatedAt = WB.nowISO();
      context.changes.push({kind:"classify",path:target.path,detail:`Semantic kind → ${semanticKind}`});
    }
  }

  function applyProvenance(state, operation, injection, context) {
    const target = requireOwnedTarget(state, operation, "provenance");
    const next = provenanceObject(operation.provenance, "provenance");
    const before = JSON.stringify(target.node.provenance || {});
    target.node.provenance = operation.replaceProvenance === true
      ? next
      : { ...(target.node.provenance || {}), ...next };
    target.node.updatedAt = WB.nowISO();
    if (before !== JSON.stringify(target.node.provenance)) {
      context.changes.push({ kind: "provenance", path: target.path, detail: "Added source and knowledge-boundary metadata" });
    }
  }

  function applyRelationship(state, operation, injection, context) {
    const source = Core.resolvePath(state, asString(operation.sourcePath, "relationship sourcePath", true)).node;
    const target = Core.resolvePath(state, asString(operation.targetPath, "relationship targetPath", true)).node;
    if (!source || !target) throw new Error("Relationship source or target was not found.");
    const relationshipType = asString(operation.relationshipType || "related-to", "relationshipType", true);
    if (!(state.relationshipDefinitions || []).some(x => x.id === relationshipType)) throw new Error(`Unknown relationship type "${relationshipType}".`);
    source.links = WB.Links.normalizeList(source.links);
    if (!source.links.some(x => x.targetId === target.id && x.relationshipType === relationshipType)) {
      source.links.push({id:WB.makeId("link"),targetType:"virtual",targetId:target.id,relationshipType,label:asString(operation.label,"label",false),provenance:operation.provenance||{source:injection.title},createdAt:WB.nowISO(),updatedAt:WB.nowISO()});
      context.changes.push({kind:"relationship",path:Core.pathForNode(state,source),detail:`${relationshipType} → ${Core.pathForNode(state,target)}`});
    }
  }

  function applyReference(state, operation, injection, context) {
    const parent = Core.resolvePath(state, asString(operation.parentPath, "reference parentPath", true)).node;
    const target = Core.resolvePath(state, asString(operation.targetPath, "reference targetPath", true)).node;
    if (!parent || parent.type !== "folder" || !target) throw new Error("Reference parent folder or target was not found.");
    if (parent.children.some(x => x.nodeRole === "reference" && x.referenceTargetId === target.id)) return;
    const ref = WB.Canon.createReference(target, asString(operation.alias,"alias",false), "eve-injection");
    ref.relationshipType = asString(operation.relationshipType || "related-to", "relationshipType", true);
    Core.markOwned(ref, injection, true); parent.children.push(ref); parent.open = true;
    context.changes.push({kind:"reference",path:Core.pathForNode(state,parent),detail:`Mounted shortcut to ${Core.pathForNode(state,target)}`});
  }

  function applySmartCollection(state, operation, injection, context) {
    const path = Core.normalizePath(asString(operation.path, "smart collection path", true));
    const segments = Core.pathSegments(state,path); const parent=Core.ensureParents(state,segments.slice(0,-1),injection,context.changes);
    let node=Core.resolvePath(state,path).node;
    if (node && !Core.isOwned(node) && !overrideAllowed(node,operation)) throw new Error("Protected collection requires overrideProtected.");
    if (!node) { node=Core.makeOwnedNode("folder",segments.at(-1),injection); parent.children.push(node); }
    const rule = {...asObject(operation.rule||{},"collection rule")};
    if (rule.relationshipTargetPath) {
      const targetPath = Core.normalizePath(asString(rule.relationshipTargetPath, "collection relationshipTargetPath", true));
      const target = Core.resolvePath(state, targetPath).node;
      if (!target) throw new Error(`Collection relationship target "${targetPath}" was not found.`);
      rule.relationshipTargetId = target.id;
      delete rule.relationshipTargetPath;
    }
    node.nodeRole="smart-collection"; node.semanticKind="collection"; node.collectionRule=rule; node.updatedAt=WB.nowISO();
    context.changes.push({kind:"smart-collection",path,detail:"Created or updated generated collection"});
  }

  function applyOperations(state, operations, injection) {
    const context = { changes: [], pendingLinks: [] };
    operations.forEach((raw, index) => {
      const operation = asObject(raw, `Operation ${index + 1}`);
      const op = String(operation.op || "").toLowerCase();
      try {
        if (op === "upsert" || op === "create") applyUpsert(state, operation, injection, context);
        else if (op === "patch" || op === "update") applyPatch(state, operation, injection, context);
        else if (op === "move") applyMove(state, operation, injection, context);
        else if (op === "rename") applyRename(state, operation, injection, context);
        else if (op === "create-status") applyCreateStatus(state, operation, injection, context);
        else if (op === "classify" || op === "set-semantic-kind") applyClassify(state, operation, injection, context);
        else if (op === "provenance" || op === "set-provenance") applyProvenance(state, operation, injection, context);
        else if (op === "relationship" || op === "typed-link") applyRelationship(state, operation, injection, context);
        else if (op === "reference" || op === "mount-shortcut") applyReference(state, operation, injection, context);
        else if (op === "smart-collection") applySmartCollection(state, operation, injection, context);
        else throw new Error(`Unsupported operation "${op || "(missing)"}".`);
      } catch (error) {
        throw new Error(`Operation ${index + 1}: ${error.message}`);
      }
    });
    resolvePendingLinks(state, context.pendingLinks, injection, context.changes);
    WB.Canon.normalizeState(state);
    return context.changes;
  }

  WB.Integration.Operations = { applyOperations };
})();
