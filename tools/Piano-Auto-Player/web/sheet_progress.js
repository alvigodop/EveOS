const STYLE_ID = "sheetProgressStyles";
const EDITOR_CLASS = "sheet-progress-editor";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${EDITOR_CLASS} { position: relative; width: 100%; min-height: 330px; }
    .${EDITOR_CLASS} .sheet-progress-layer {
      position: absolute; inset: 1px; z-index: 1; overflow: hidden; pointer-events: none;
      padding: 17px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: break-word;
      color: #eaf1f7; line-height: 1.65; font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 14px; letter-spacing: normal; tab-size: 4;
    }
    .${EDITOR_CLASS} .sheet-progress-layer.empty { color: #65717e; }
    .${EDITOR_CLASS} textarea.sheet-progress-input {
      position: relative; z-index: 2; background: transparent; color: rgba(234,241,247,0.004);
      caret-color: #eaf1f7; -webkit-text-fill-color: rgba(234,241,247,0.004);
    }
    .${EDITOR_CLASS} .sheet-progress-event { border-radius: 3px; transition: background-color .08s linear, color .08s linear; }
    .${EDITOR_CLASS} .sheet-progress-event.played {
      color: #cfe8ff; background: rgba(67,165,255,.16); box-shadow: inset 0 -1px 0 rgba(67,165,255,.28);
    }
    .${EDITOR_CLASS} .sheet-progress-event.current {
      color: #f4fbff; background: rgba(67,165,255,.38); box-shadow: inset 0 -1px 0 #43a5ff, 0 0 9px rgba(67,165,255,.16);
    }
  `;
  document.head.append(style);
}

function playable(char) {
  return /[A-Za-z0-9!@$%^*(]/.test(char);
}

function appendEvent(events, kind, start, end) {
  if (end > start) events.push({ index: events.length + 1, kind, start, end });
}

function consumeWhitespace(text, start) {
  let i = start, spaces = 0, newlines = 0;
  while (i < text.length && " \t\r\n".includes(text[i])) {
    if (text[i] === "\n") newlines += 1;
    else if (text[i] === " " || text[i] === "\t") spaces += 1;
    i += 1;
  }
  const kind = newlines >= 2 ? "paragraph" : "space";
  return { end: i, kind, visible: i > start };
}

function buildExpressiveRanges(text) {
  const events = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (" \t\r\n".includes(ch)) {
      const item = consumeWhitespace(text, i);
      appendEvent(events, item.kind, i, item.end);
      i = item.end;
      continue;
    }
    if (ch === "[") {
      const end = text.indexOf("]", i + 1);
      if (end !== -1) {
        const raw = text.slice(i + 1, end);
        if ([...raw].some(playable)) {
          if (/\s/.test(raw)) {
            for (let p = i + 1; p < end; p += 1) if (playable(text[p])) appendEvent(events, "fast", p, p + 1);
          } else {
            appendEvent(events, "chord", i, end + 1);
          }
        }
        i = end + 1;
        continue;
      }
    }
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end !== -1) {
        for (let p = i + 1; p < end; p += 1) if (playable(text[p])) appendEvent(events, "fast", p, p + 1);
        i = end + 1;
        continue;
      }
    }
    if (ch === "-" || ch === "|") {
      let end = i + 1;
      while (end < text.length && text[end] === ch) end += 1;
      appendEvent(events, "pause", i, end);
      i = end;
      continue;
    }
    if (playable(ch)) appendEvent(events, "note", i, i + 1);
    i += 1;
  }
  while (events.length && events[0].kind === "space") events.shift();
  while (events.length && events[events.length - 1].kind === "space") events.pop();
  events.forEach((event, index) => { event.index = index + 1; });
  return events;
}

function buildGridRanges(text) {
  const events = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "[") {
      const end = text.indexOf("]", i + 1);
      if (end !== -1) {
        if ([...text.slice(i + 1, end)].some(playable)) appendEvent(events, "chord", i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end !== -1) {
        for (let p = i + 1; p < end; p += 1) if (playable(text[p])) appendEvent(events, "fast", p, p + 1);
        i = end + 1;
        continue;
      }
    }
    if ("-_|".includes(ch)) {
      let end = i + 1;
      while (end < text.length && text[end] === ch) end += 1;
      appendEvent(events, "pause", i, end);
      i = end;
      continue;
    }
    if (playable(ch)) appendEvent(events, "note", i, i + 1);
    i += 1;
  }
  events.forEach((event, index) => { event.index = index + 1; });
  return events;
}

function buildLetterGridRanges(text) {
  return buildGridRanges(text);
}

export function buildSheetEventRanges(text, profile = "expressive") {
  const normalized = String(profile || "expressive").toLowerCase();
  if (normalized === "letter_grid") return buildLetterGridRanges(String(text || ""));
  if (["grid", "vpsheet", "roblox_grid"].includes(normalized)) return buildGridRanges(String(text || ""));
  return buildExpressiveRanges(String(text || ""));
}

function createSpan(text, event, state) {
  const span = document.createElement("span");
  span.className = "sheet-progress-event";
  if (event.index < state.currentIndex) span.classList.add("played");
  if (event.index === state.currentIndex) span.classList.add("current");
  span.dataset.eventIndex = String(event.index);
  span.textContent = text.slice(event.start, event.end);
  return span;
}

function renderLayer(layer, text, ranges, state, placeholder) {
  layer.replaceChildren();
  layer.classList.toggle("empty", !text);
  if (!text) {
    layer.textContent = placeholder || "";
    return;
  }
  let cursor = 0;
  for (const event of ranges) {
    if (event.start > cursor) layer.append(document.createTextNode(text.slice(cursor, event.start)));
    layer.append(createSpan(text, event, state));
    cursor = event.end;
  }
  if (cursor < text.length) layer.append(document.createTextNode(text.slice(cursor)));
}

function currentIndexFromStatus(status, fallback) {
  const current = Number(status?.current_index || 0);
  if (["playing", "countdown", "paused"].includes(status?.status) && current > 0) return current;
  if (status?.status === "complete") return Number(status.total_events || fallback || 0);
  return Math.max(0, Number(fallback || 0));
}

function setup(textarea) {
  if (!textarea || textarea.dataset.sheetProgressReady === "1") return;
  installStyles();
  textarea.dataset.sheetProgressReady = "1";
  const wrapper = document.createElement("div");
  wrapper.className = EDITOR_CLASS;
  textarea.parentNode.insertBefore(wrapper, textarea);
  wrapper.append(textarea);

  const layer = document.createElement("div");
  layer.className = "sheet-progress-layer";
  layer.setAttribute("aria-hidden", "true");
  wrapper.insertBefore(layer, textarea);

  let ranges = [];
  let state = { currentIndex: 0 };
  let renderQueued = false;

  function readText() { return String(textarea.value || ""); }
  function rebuild() {
    const profile = textarea.dataset.timingProfile || "expressive";
    ranges = buildSheetEventRanges(readText(), profile);
    queueRender();
  }
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderLayer(layer, readText(), ranges, state, textarea.getAttribute("placeholder"));
      layer.scrollTop = textarea.scrollTop;
      layer.scrollLeft = textarea.scrollLeft;
    });
  }
  function applyStatus(status) {
    state.currentIndex = currentIndexFromStatus(status, Number(textarea.value ? textarea.dataset.seekFallback || 0 : 0));
    queueRender();
  }

  textarea.addEventListener("input", () => { textarea.dataset.seekFallback = "0"; rebuild(); });
  textarea.addEventListener("scroll", queueRender);
  new MutationObserver(records => {
    if (records.some(record => record.type === "attributes" && record.attributeName === "data-timing-profile")) rebuild();
  }).observe(textarea, { attributes: true });

  window.addEventListener("piano:sheet-progress-seek", event => {
    const index = Number(event.detail?.index || 0);
    if (index > 0) { state.currentIndex = index; queueRender(); }
  });

  const statusLoop = async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.ok) {
        const status = await response.json();
        applyStatus(status);
      }
    } catch (_) {}
    window.setTimeout(statusLoop, 180);
  };

  window.addEventListener("piano:sheet-rebuild", rebuild);
  rebuild();
  statusLoop();
}

function boot() {
  const textarea = document.getElementById("sheetInput");
  if (textarea) setup(textarea);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
