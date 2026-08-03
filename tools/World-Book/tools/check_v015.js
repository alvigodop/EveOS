const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function classList() {
  const values = new Set();
  return {
    contains: value => values.has(value),
    toggle(value, force) {
      const enabled = force === undefined ? !values.has(value) : Boolean(force);
      if (enabled) values.add(value);
      else values.delete(value);
      return enabled;
    }
  };
}

function element() {
  const attributes = new Map();
  const listeners = new Map();
  return {
    classList: classList(),
    textContent: "",
    title: "",
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name); },
    addEventListener(name, handler) { listeners.set(name, handler); },
    click() { listeners.get("click")?.(); }
  };
}

const header = element();
const button = element();
const body = element();
const storage = new Map([["eveWorldBookHeaderCollapsed", "true"]]);
const events = [];

global.CustomEvent = class CustomEvent {
  constructor(type, options) { this.type = type; this.detail = options?.detail; }
};
global.document = {
  body,
  querySelector(selector) { return selector === ".topbar" ? header : null; },
  getElementById(id) { return id === "topbar-collapse-btn" ? button : null; }
};
global.window = {
  WorldBook: {},
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  },
  dispatchEvent(event) { events.push(event); }
};

const source = fs.readFileSync(path.join(root, "app/assets/js/header-collapse.js"), "utf8");
vm.runInThisContext(source, { filename: "header-collapse.js" });

if (!header.classList.contains("is-collapsed")) throw new Error("Saved collapsed preference was not restored.");
if (button.getAttribute("aria-expanded") !== "false") throw new Error("Collapsed accessibility state is wrong.");
if (button.textContent !== "Expand header") throw new Error("Collapsed button label is wrong.");

button.click();
if (header.classList.contains("is-collapsed")) throw new Error("Header did not expand.");
if (storage.get("eveWorldBookHeaderCollapsed") !== "false") throw new Error("Expanded preference was not saved.");
if (button.getAttribute("aria-expanded") !== "true") throw new Error("Expanded accessibility state is wrong.");

window.WorldBook.Header.setCollapsed(true);
if (!window.WorldBook.Header.isCollapsed()) throw new Error("Public header controller did not collapse.");
if (!events.some(event => event.type === "worldbook:header-collapse-change")) {
  throw new Error("Header preference change event was not emitted.");
}

const html = fs.readFileSync(path.join(root, "app/index.html"), "utf8");
const cssIndex = fs.readFileSync(path.join(root, "app/assets/css/app.css"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "app/assets/js/bootstrap.js"), "utf8");
const state = fs.readFileSync(path.join(root, "app/assets/js/state.js"), "utf8");
const foundation = fs.readFileSync(path.join(root, "worldbook_runtime/layers/00_foundation.py"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.txt"), "utf8");
if (!html.includes('id="topbar-collapse-btn"')) throw new Error("Header toggle is missing from HTML.");
if (!html.includes('aria-controls="workspace-controls topbar-actions"')) throw new Error("Header toggle controls are not declared.");
if (!cssIndex.includes("67-header-collapse.css")) throw new Error("Header CSS layer is not imported.");
if (!bootstrap.includes("header-collapse.js")) throw new Error("Header controller is not loaded.");
if (!state.includes('WB.APP_VERSION = "0.15.0"')) throw new Error("Browser app version is not 0.15.0.");
if (!foundation.includes('APP_VERSION = "0.15.0"')) throw new Error("Server app version is not 0.15.0.");
if (!readme.includes("http://127.0.0.1:8766/")) throw new Error("README does not use the World Book port.");

console.log("V0.15 HEADER COLLAPSE CHECK PASSED");
