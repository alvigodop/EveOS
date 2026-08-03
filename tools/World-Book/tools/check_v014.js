const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
global.window = { WorldBook: {} };
global.crypto = require("crypto").webcrypto;
function load(relative) {
  vm.runInThisContext(fs.readFileSync(path.join(root, relative), "utf8"), { filename: relative });
}
[
  "app/assets/js/state.js",
  "app/assets/js/links.js",
  "app/assets/js/taxonomy/mentions.js",
  "app/assets/js/taxonomy/core.js",
  "app/assets/js/canon.js",
  "app/assets/js/smart-collections.js",
  "app/assets/js/integration/core.js",
  "app/assets/js/integration/operations.js",
  "app/assets/js/integration/planner.js"
].forEach(load);

const WB = window.WorldBook;
const rootNode = WB.createVirtualNode("folder", "World Book Manager", { id: "root" });
const book = WB.createVirtualNode("folder", "Book", { id: "book" });
const chapter = WB.createVirtualNode("folder", "Chapter 1", { id: "chapter" });
const character = WB.createVirtualNode("folder", "Leon", {
  id: "leon", semanticKind: "character", content: "Main character.", tags: ["Chapter 1"]
});
book.children.push(chapter, character);
rootNode.children.push(book);
character.links = [{
  id: "introduced", targetType: "virtual", targetId: chapter.id,
  relationshipType: "introduced-in", provenance: {}, createdAt: WB.nowISO(), updatedAt: WB.nowISO()
}];
const state = {
  schemaVersion: 10,
  appVersion: "0.14.0",
  virtualRoot: rootNode,
  tagDefinitions: [{ id: "chapter-1", name: "Chapter 1" }],
  statusDefinitions: [{ id: "draft", name: "Draft" }],
  tagAutomation: { pathTagsEnabled: true, mentionTagsEnabled: true },
  relationshipDefinitions: WB.Canon.DEFAULT_RELATIONSHIPS.map(item => ({ ...item })),
  integrations: { applied: [] },
  integrity: {}, ui: {}, fileMeta: {}, history: { deleted: [] }
};
WB.Taxonomy.normalizeState(state);
WB.Links.normalizeState(state);
WB.Canon.normalizeState(state);

const payload = {
  format: "eve-os-world-book-injection",
  formatVersion: 1,
  injection: { id: "provenance-test", revision: 1, title: "Set provenance" },
  operations: [{
    op: "provenance", path: "Book/Chapter 1", overrideProtected: true,
    provenance: { source: "Manuscript", knownAsOf: "End of Chapter 1", confidence: "confirmed" }
  }]
};
const plan = WB.Integration.Planner.plan(state, payload);
const plannedChapter = WB.findVirtual(plan.nextState.virtualRoot, "chapter");
if (plannedChapter.provenance.knownAsOf !== "End of Chapter 1") throw new Error("Provenance operation failed.");
if ((plannedChapter.tags || []).includes(WB.EVE_INJECTION_TAG)) throw new Error("Provenance transferred injection ownership.");

const collection = WB.SmartCollections.save(state, {
  parentId: book.id,
  name: "Chapter 1 Characters",
  rule: { semanticKinds: ["character"], relationshipType: "introduced-in", relationshipTargetId: chapter.id }
});
if (collection.nodeRole !== "smart-collection" || collection.children.length !== 1) throw new Error("Manual Smart Collection failed.");
if (collection.children[0].referenceTargetId !== character.id) throw new Error("Smart Collection shortcut target is wrong.");

const linkFromChapter = { id: "to-leon", targetType: "virtual", targetId: character.id, relationshipType: "related-to" };
chapter.links = [linkFromChapter];
const deleted = WB.deleteVirtualToHistory(state, character.id);
if (WB.findVirtual(state.virtualRoot, character.id)) throw new Error("Deleted entry remained active.");
if (!WB.ensureHistoryState(state).deleted.length) throw new Error("Deleted entry was not recorded.");
const restored = WB.restoreDeletedVirtual(state, deleted.id);
if (restored.node.id !== character.id || !WB.findVirtual(state.virtualRoot, character.id)) throw new Error("Deleted entry did not restore with its stable ID.");
if (chapter.links[0].targetId !== character.id) throw new Error("Restoration broke existing links.");

console.log("V0.14 FEATURE CHECK PASSED");
