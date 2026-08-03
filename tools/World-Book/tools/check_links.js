const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
global.window = { WorldBook: {} };
global.crypto = require("crypto").webcrypto;

function load(relative) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  vm.runInThisContext(source, { filename: relative });
}

[
  "app/assets/js/state.js",
  "app/assets/js/links.js",
  "app/assets/js/canon.js"
].forEach(load);

const WB = window.WorldBook;
const rootNode = WB.createVirtualNode("folder", "Root", { id: "root" });
const event = WB.createVirtualNode("file", "Thunderstorm Event", { id: "event" });
const location = WB.createVirtualNode("folder", "Great Logs", { id: "location" });
const chapter = WB.createVirtualNode("folder", "Chapter 1", { id: "chapter" });
rootNode.children.push(event, location, chapter);

const state = { virtualRoot: rootNode, fileMeta: {}, relationshipDefinitions: [] };
WB.Canon.normalizeState(state);
event.links = [{
  id: "link-event-location",
  targetType: "virtual",
  targetId: location.id,
  relationshipType: "occurs-at"
}];
chapter.links = [{
  id: "link-chapter-location",
  targetType: "virtual",
  targetId: location.id,
  relationshipType: "related-to"
}];
location.links = [{
  id: "link-location-event",
  targetType: "virtual",
  targetId: event.id,
  relationshipType: "introduced-in"
}];
WB.Links.normalizeState(state);

const locationLinks = WB.Links.forEntry(state, location.id);
const incoming = locationLinks.filter(link => link._incoming);
const outgoing = locationLinks.filter(link => !link._incoming);
if (incoming.length !== 2) throw new Error(`Expected 2 incoming links, received ${incoming.length}.`);
if (outgoing.length !== 1) throw new Error(`Expected 1 outgoing link, received ${outgoing.length}.`);
if (!incoming.some(link => link.targetId === event.id)) throw new Error("Incoming event backlink was not resolved.");
if (!incoming.some(link => link.targetId === chapter.id)) throw new Error("Incoming chapter backlink was not resolved.");
const eventBacklink = incoming.find(link => link.targetId === event.id);
if (WB.Links.relationLabel(state, eventBacklink) !== "location of") {
  throw new Error("Incoming relationship did not use its inverse label.");
}
if (WB.Links.resolveTarget(state, eventBacklink)?.id !== event.id) {
  throw new Error("Incoming backlink did not open its source entry.");
}

const editorSource = fs.readFileSync(path.join(root, "app/assets/js/editor.js"), "utf8");
if (!editorSource.includes("WB.Links.forEntry(taxonomyState, node.id)")) {
  throw new Error("Initial virtual-entry rendering does not request backlinks.");
}

console.log("BIDIRECTIONAL LINK CHECK PASSED");
