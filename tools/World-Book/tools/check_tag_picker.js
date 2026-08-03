const path = require("path");

class FakeElement {
  constructor() {
    this.value = "";
    this.hidden = true;
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
    this.innerHTML = "";
    this.textContent = "";
    this.className = "";
    this.attributes = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, extra = {}) {
    const event = {
      key: "",
      target: this,
      preventDefault() {},
      ...extra
    };
    for (const handler of this.listeners.get(type) || []) handler(event);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  prepend(child) {
    this.children.unshift(child);
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }
}

const documentListeners = new Map();
global.document = {
  addEventListener(type, handler) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(handler);
  },
  createElement() {
    return new FakeElement();
  }
};

global.window = {
  WorldBook: {
    normalizeTags(values) {
      const seen = new Set();
      return (values || []).map(value => String(value || "").trim()).filter(value => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }
};

require(path.resolve(__dirname, "../app/assets/js/taxonomy/picker.js"));

const chips = new FakeElement();
const input = new FakeElement();
const suggestions = new FakeElement();
let selected = [];
const picker = new window.WorldBook.TagPicker({
  chips,
  input,
  suggestions,
  getDefinitions: () => [{ id: "tag-leon", name: "Leon" }],
  onCreate: name => name,
  onChange: values => { selected = values; }
});

input.value = "Leon";
input.dispatch("input");
if (suggestions.hidden || suggestions.children.length !== 1) {
  throw new Error("Typing an existing tag did not show its suggestion.");
}

input.dispatch("keydown", { key: "Enter" });
if (selected.length !== 1 || selected[0] !== "Leon") {
  throw new Error("Pressing Enter did not apply the selected tag filter.");
}
if (input.value !== "") throw new Error("The tag input was not cleared after selection.");

console.log("TAG PICKER RUNTIME CHECK PASSED");
