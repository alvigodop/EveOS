const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
global.window = { WorldBook: {} };
global.document = {};
global.crypto = require("crypto").webcrypto;

function load(relative) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  vm.runInThisContext(source, { filename: relative });
}

[
  "app/assets/js/state.js",
  "app/assets/js/links.js",
  "app/assets/js/taxonomy/mentions.js",
  "app/assets/js/taxonomy/core.js",
  "app/assets/js/canon.js",
  "app/assets/js/integration/core.js",
  "app/assets/js/integration/operations.js",
  "app/assets/js/integration/planner.js"
].forEach(load);

const WB = window.WorldBook;
const rootNode = WB.createVirtualNode("folder", "World Book Manager", { id: "root" });
const book = WB.createVirtualNode("folder", "Book");
const characters = WB.createVirtualNode("folder", "Characters");
const archive = WB.createVirtualNode("folder", "Archive");
const userInfo = WB.createVirtualNode("file", "Info", { content: "User text" });
characters.children.push(userInfo);
book.children.push(characters, archive);
rootNode.children.push(book);
const state = {
  schemaVersion: 6,
  appVersion: "0.10.2",
  project: { id: "p", title: "Test", createdAt: WB.nowISO(), updatedAt: WB.nowISO() },
  virtualRoot: rootNode,
  fileMeta: {},
  imports: [],
  tagDefinitions: [],
  statusDefinitions: [{ id: "draft", name: "Draft" }],
  tagAutomation: { pathTagsEnabled: true, mentionTagsEnabled: true },
  ui: {}
};
WB.Taxonomy.normalizeState(state);
WB.Links.normalizeState(state);

const payload = {
  format: "eve-os-world-book-injection",
  formatVersion: 1,
  injection: { id: "test-create", revision: 1, title: "Create managed entry" },
  operations: [{
    op: "upsert",
    path: "Book/Characters/Leon/Stats",
    type: "file",
    content: "Injected stats",
    addTags: ["Stats"],
    links: [{ targetPath: "Book/Characters/Info", label: "Source info" }]
  }]
};

const before = JSON.stringify(state);
const plan = WB.Integration.Planner.plan(state, payload);
if (JSON.stringify(state) !== before) throw new Error("Planning mutated the active state.");
const stats = WB.Integration.Core.resolvePath(plan.nextState, "Book/Characters/Leon/Stats").node;
const leon = WB.Integration.Core.resolvePath(plan.nextState, "Book/Characters/Leon").node;
if (!stats || stats.content !== "Injected stats") throw new Error("Injected file was not created.");
if (!leon || !WB.Integration.Core.isOwned(leon)) throw new Error("Missing parent folder was not injection-owned.");
if (!WB.Integration.Core.isOwned(stats)) throw new Error("Injected file lacks ownership.");
if (stats.visibleTags.some(tag => tag === "Injected from Eve")) throw new Error("Ownership tag is visible.");
if (stats.links.length !== 1 || stats.links[0].targetId !== userInfo.id) throw new Error("Link resolution failed.");
if (!plan.nextState.integrations.applied.some(record => record.key === "test-create@1")) throw new Error("Injection history was not recorded.");

let protectedFailure = false;
try {
  WB.Integration.Planner.plan(state, {
    format: payload.format,
    formatVersion: 1,
    injection: { id: "test-protect", revision: 1, title: "Protect user entry" },
    operations: [{ op: "patch", path: "Book/Characters/Info", content: "Overwrite" }]
  });
} catch (error) {
  protectedFailure = /Protected entry/.test(error.message);
}
if (!protectedFailure) throw new Error("User-owned entry protection failed.");

userInfo.tags = ["Injected from Eve"];
userInfo.visibleTags = [];
const optedIn = WB.Integration.Planner.plan(state, {
  format: payload.format,
  formatVersion: 1,
  injection: { id: "test-opt-in", revision: 1, title: "Update opted-in entry" },
  operations: [{ op: "patch", path: "Book/Characters/Info", content: "Approved update" }]
});
if (WB.Integration.Core.resolvePath(optedIn.nextState, "Book/Characters/Info").node.content !== "Approved update") {
  throw new Error("Opt-in update failed.");
}

const movedState = plan.nextState;
const movePlan = WB.Integration.Planner.plan(movedState, {
  format: payload.format,
  formatVersion: 1,
  injection: { id: "test-move", revision: 1, title: "Move managed entry" },
  operations: [{ op: "move", path: "Book/Characters/Leon/Stats", destinationPath: "Book/Archive" }]
});
if (!WB.Integration.Core.resolvePath(movePlan.nextState, "Book/Archive/Stats").node) throw new Error("Managed move failed.");

let duplicateFailure = false;
try {
  WB.Integration.Planner.plan(plan.nextState, payload);
} catch (error) {
  duplicateFailure = /already applied/.test(error.message);
}
if (!duplicateFailure) throw new Error("Duplicate revision protection failed.");

console.log("INJECTION CHECK PASSED");

const classifyPlan = WB.Integration.Planner.plan(plan.nextState, {
  format: payload.format,
  formatVersion: 1,
  injection: { id: "test-classify", revision: 1, title: "Classify protected entry" },
  operations: [{
    op: "classify",
    path: "Book/Archive",
    semanticKind: "archive",
    overrideProtected: true
  }]
});
const classifiedArchive = WB.Integration.Core.resolvePath(classifyPlan.nextState, "Book/Archive").node;
if (classifiedArchive.semanticKind !== "archive") throw new Error("Protected classification did not apply.");
if (WB.Integration.Core.isOwned(classifiedArchive)) throw new Error("Classification unexpectedly transferred entry ownership.");

const smartPlan = WB.Integration.Planner.plan(classifyPlan.nextState, {
  format: payload.format,
  formatVersion: 1,
  injection: { id: "test-smart", revision: 1, title: "Smart introduced characters" },
  operations: [
    { op: "upsert", path: "Book/Chapters/Chapter 1", type: "folder" },
    {
      op: "relationship",
      sourcePath: "Book/Characters/Leon",
      targetPath: "Book/Chapters/Chapter 1",
      relationshipType: "introduced-in"
    },
    {
      op: "smart-collection",
      path: "Book/Chapters/Chapter 1/Introduced Characters",
      rule: {
        relationshipType: "introduced-in",
        relationshipTargetPath: "Book/Chapters/Chapter 1",
        tagsAny: ["Characters"]
      }
    }
  ]
});
const smart = WB.Integration.Core.resolvePath(smartPlan.nextState, "Book/Chapters/Chapter 1/Introduced Characters").node;
if (!smart || smart.nodeRole !== "smart-collection" || smart.type !== "folder") throw new Error("Smart collection was not created.");
if (smart.collectionRule.relationshipTargetPath) throw new Error("Smart collection target path was not resolved to an ID.");
if (!smart.collectionRule.relationshipTargetId) throw new Error("Smart collection lacks a relationship target ID.");
if (smart.children.length !== 1 || smart.children[0].referenceTargetId !== leon.id) throw new Error("Tag-filtered smart collection did not generate the expected reference.");

console.log("SMART COLLECTION CHECK PASSED");
