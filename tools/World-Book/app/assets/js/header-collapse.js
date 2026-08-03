window.WorldBook = window.WorldBook || {};

(function (WB) {
  "use strict";

  const STORAGE_KEY = "eveWorldBookHeaderCollapsed";
  const header = document.querySelector(".topbar");
  const button = document.getElementById("topbar-collapse-btn");

  if (!header || !button) return;

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function writePreference(collapsed) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch (error) {
      // The control still works when browser storage is unavailable.
    }
  }

  function isCollapsed() {
    return header.classList.contains("is-collapsed");
  }

  function render(collapsed) {
    header.classList.toggle("is-collapsed", collapsed);
    document.body.classList.toggle("world-book-header-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.textContent = collapsed ? "Expand header" : "Collapse header";
    button.title = collapsed ? "Expand World Book header" : "Collapse World Book header";
  }

  function setCollapsed(collapsed, options = {}) {
    const value = Boolean(collapsed);
    render(value);
    if (options.persist !== false) writePreference(value);
    window.dispatchEvent(new CustomEvent("worldbook:header-collapse-change", {
      detail: { collapsed: value }
    }));
    return value;
  }

  function toggle() {
    return setCollapsed(!isCollapsed());
  }

  button.addEventListener("click", toggle);
  setCollapsed(readPreference(), { persist: false });

  WB.Header = Object.freeze({
    isCollapsed,
    setCollapsed,
    toggle,
    storageKey: STORAGE_KEY
  });
})(window.WorldBook);
