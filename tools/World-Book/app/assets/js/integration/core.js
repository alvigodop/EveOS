(function () {
  const WB = window.WorldBook;
  const OWNER_TAG = WB.EVE_INJECTION_TAG || "Injected from Eve";
  const FORMAT = "eve-os-world-book-injection";
  const FORMAT_VERSION = 1;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeName(value) {
    return String(value || "")
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizePath(value) {
    return String(value || "")
      .replaceAll("\\", "/")
      .split("/")
      .map(part => part.trim())
      .filter(Boolean)
      .join("/");
  }

  function pathSegments(state, value) {
    const segments = normalizePath(value).split("/").filter(Boolean);
    const rootName = normalizeName(state?.virtualRoot?.name);
    if (segments.length && normalizeName(segments[0]) === rootName) segments.shift();
    return segments;
  }

  function childMatches(parent, name) {
    const key = normalizeName(name);
    return (parent?.children || []).filter(child => normalizeName(child.name) === key);
  }

  function resolvePath(state, value) {
    const root = state?.virtualRoot;
    if (!root) throw new Error("The active World Book root is missing.");
    const segments = pathSegments(state, value);
    let node = root;
    let parent = null;

    for (const segment of segments) {
      if (node.type !== "folder") return { node: null, parent: node, missing: segment, segments };
      const matches = childMatches(node, segment);
      if (matches.length > 1) {
        throw new Error(`Path is ambiguous because "${segment}" appears more than once under "${node.name}".`);
      }
      if (!matches.length) return { node: null, parent: node, missing: segment, segments };
      parent = node;
      node = matches[0];
    }

    return { node, parent, missing: "", segments };
  }

  function pathForNode(state, node) {
    if (!node) return "";
    return WB.virtualPath(state.virtualRoot, node.id).map(item => item.name).join("/");
  }

  function manualTagSet(node) {
    return new Set(WB.normalizeTags(node?.tags).map(tag => normalizeName(tag)));
  }

  function isOwned(node) {
    return Boolean(
      node && (
        manualTagSet(node).has(normalizeName(OWNER_TAG)) ||
        node.eveIntegration?.managed === true
      )
    );
  }

  function markOwned(node, injection, created) {
    node.tags = WB.normalizeTags([...(node.tags || []), OWNER_TAG]);
    node.visibleTags = WB.normalizeTags(node.visibleTags).filter(
      tag => normalizeName(tag) !== normalizeName(OWNER_TAG)
    );
    node.eveIntegration = {
      ...(node.eveIntegration && typeof node.eveIntegration === "object" ? node.eveIntegration : {}),
      managed: true,
      owner: "Eve",
      createdByInjection: node.eveIntegration?.createdByInjection || (created ? injection.id : undefined),
      lastInjectionId: injection.id,
      lastRevision: injection.revision,
      updatedAt: WB.nowISO()
    };
  }

  function ensureOwnerTagDefinition(state) {
    WB.Taxonomy.ensureTag(state, OWNER_TAG);
  }

  function makeOwnedNode(type, name, injection) {
    const node = WB.createVirtualNode(type, name, {
      status: "draft",
      tags: [OWNER_TAG],
      visibleTags: [],
      open: type === "folder"
    });
    markOwned(node, injection, true);
    return node;
  }

  function ensureParents(state, segments, injection, changes) {
    let current = state.virtualRoot;
    for (const segment of segments) {
      const matches = childMatches(current, segment);
      if (matches.length > 1) {
        throw new Error(`Cannot create through ambiguous folder "${segment}" under "${current.name}".`);
      }
      if (matches.length) {
        if (matches[0].type !== "folder") {
          throw new Error(`Cannot create beneath "${segment}" because it is a file.`);
        }
        current = matches[0];
        continue;
      }
      const folder = makeOwnedNode("folder", segment, injection);
      current.children.push(folder);
      current.updatedAt = WB.nowISO();
      current.open = true;
      changes.push({ kind: "create-folder", path: pathForNode(state, folder), detail: "Created missing parent folder" });
      current = folder;
    }
    return current;
  }

  function injectionKey(injection) {
    return `${injection.id}@${injection.revision}`;
  }

  WB.Integration = WB.Integration || {};
  WB.Integration.Core = {
    OWNER_TAG,
    FORMAT,
    FORMAT_VERSION,
    deepClone,
    normalizeName,
    normalizePath,
    pathSegments,
    childMatches,
    resolvePath,
    pathForNode,
    isOwned,
    markOwned,
    ensureOwnerTagDefinition,
    makeOwnedNode,
    ensureParents,
    injectionKey
  };
})();
