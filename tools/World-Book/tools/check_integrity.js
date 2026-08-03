const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
global.window = { WorldBook: {} };
for (const file of [
  "app/assets/js/state.js",
  "app/assets/js/links.js",
  "app/assets/js/canon.js",
  "app/assets/js/integrity/core.js",
  "app/assets/js/integrity/rules.js"
]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

const WB = window.WorldBook;
const folder = (name, children = [], options = {}) => WB.createVirtualNode("folder", name, { ...options, children });
const file = (name, content = "", options = {}) => WB.createVirtualNode("file", name, { ...options, content });

const leon = folder("Leon Kirumi", [
  file("Info", "Main character."),
  folder("Social", [file("Core-Relationship", "Current Main love Interest: Febe")])
]);
const febe = folder("Febe", [
  file("Info", "Leon’s love interest."),
  folder("Social", [file("Core-Relationship", "Love Interest: Leon")])
]);
const mike = folder("Mike", [
  file("Info", "Leon’s friend."),
  folder("Social", [folder("Base-Relationship", [file("Info", "Best Friend: Leon")])])
]);
leon.children[1].children.push(folder("Base-Relationships", [file("Info", "Best friend: Mike")]));

const greatLogs = folder("Great Logs Hotel Resort", [
  file("Info"),
  folder("Plot-Ties", [folder("Mountain Race")])
]);
const timeline = folder("Chapter 1", [
  folder("Introduced-Elements", [file("Locations")]),
  folder("Event Timeline", [
    folder("Mountain race", [file("Continuity-List", "The race happened at Great Logs Hotel Resort.")])
  ])
]);

const brokenReference = WB.createVirtualNode("file", "Broken", {
  nodeRole: "reference", referenceTargetId: "missing-id", canonicalId: "missing-id"
});
const scaffolding = folder("Template Families", Array.from({ length: 12 }, (_, i) => folder(`House ${i + 1}`)));
const deep = folder("Worlds", [folder("Realm", [folder("Continent", [folder("Factions", [scaffolding])])])]);
const rootNode = folder("World Book Manager", [
  folder("The Book", [folder("Characters", [leon, febe, mike]), greatLogs, timeline, deep, brokenReference])
], { id: "root" });

leon.links = [
  { id: "l1", targetType: "virtual", targetId: febe.id, relationshipType: "related-to" },
  { id: "l2", targetType: "virtual", targetId: febe.id, relationshipType: "related-to" },
  { id: "l3", targetType: "virtual", targetId: "gone", relationshipType: "occurs-at" }
];

const state = {
  virtualRoot: rootNode,
  relationshipDefinitions: [],
  integrity: {},
  fileMeta: {},
  ui: {},
  tagDefinitions: [],
  statusDefinitions: [],
  tagAutomation: { pathTagsEnabled: true }
};
WB.Taxonomy = { virtualTagInfo: () => ({ effective: [] }) };
WB.Canon.normalizeState(state);
WB.Links.normalizeState(state);
const report = WB.Integrity.scan(state);
const types = new Set(report.findings.map(finding => finding.type));
for (const expected of [
  "broken-reference", "broken-link", "duplicate-link", "generic-link",
  "mirrored-relationship-prose", "lens-copy-candidate", "empty-canonical-source",
  "smart-collection-candidate", "possible-scaffolding", "provenance-gap"
]) {
  if (!types.has(expected)) throw new Error(`Missing integrity detector: ${expected}`);
}

const mirrored = report.findings.find(finding => finding.type === "mirrored-relationship-prose");
state.integrity.ignored[mirrored.fingerprint] = { ignoredAt: WB.nowISO() };
if (!WB.Integrity.scan(state).findings.find(f => f.fingerprint === mirrored.fingerprint)?.ignored) {
  throw new Error("Ignored finding did not remain ignored.");
}
state.integrity.intentionalScaffoldingIds.push(scaffolding.id);
if (WB.Integrity.scan(state).findings.some(f => f.type === "possible-scaffolding" && f.targetIds.includes(scaffolding.id))) {
  throw new Error("Intentional scaffolding was not suppressed.");
}
console.log(`Canon Integrity checks passed (${report.findings.length} findings).`);
