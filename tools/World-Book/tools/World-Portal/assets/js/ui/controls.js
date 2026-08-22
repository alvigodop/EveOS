import { emitWorldStateChange } from "../world/world-events.js";

let projectionAnimationToken = 0;
const FIRST_RUN_OPEN_SECTIONS = new Set([
  "world-library", "landmassPanel", "outerToolsPanel",
]);

function emitStateChange(key, value) {
  emitWorldStateChange(key, value);
}

function bindRange(id, state, key, sceneApi, formatter = Number) {
  const input = document.getElementById(id);
  if (!input) return null;
  input.value = state[key];
  input.addEventListener("input", () => {
    if (key === "projectionBlend") projectionAnimationToken += 1;
    state[key] = formatter(input.value);
    sceneApi.applyState(state);
    emitStateChange(key, state[key]);
  });
  return input;
}

function bindToggle(id, state, key, sceneApi) {
  const input = document.getElementById(id);
  if (!input) return null;
  input.checked = !!state[key];
  input.addEventListener("change", () => {
    state[key] = input.checked;
    sceneApi.applyState(state);
    emitStateChange(key, state[key]);
  });
  return input;
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;
}

function animateProjection({ state, sceneApi, slider, target, pureFlat, duration = 900 }) {
  const token = ++projectionAnimationToken;
  const startValue = state.projectionBlend;
  const startedAt = performance.now();
  const interactionRevision = sceneApi.getInteractionRevision?.() ?? 0;
  if (typeof pureFlat === "boolean") {
    state.pureFlat = pureFlat;
    const toggle = document.getElementById("pureFlatToggle");
    if (toggle) toggle.checked = pureFlat;
  }
  function frame(now) {
    if (token !== projectionAnimationToken) return;
    const elapsed = Math.min(1, (now - startedAt) / duration);
    state.projectionBlend = startValue + (target - startValue) * easeInOutCubic(elapsed);
    if (slider) slider.value = String(state.projectionBlend);
    sceneApi.applyState(state);
    if (elapsed < 1) requestAnimationFrame(frame);
    else {
      const interacted = (sceneApi.getInteractionRevision?.() ?? 0) !== interactionRevision;
      if (!interacted) sceneApi.resetView();
      emitStateChange("projectionBlend", state.projectionBlend);
      emitStateChange("pureFlat", state.pureFlat);
    }
  }
  requestAnimationFrame(frame);
}

function sectionKey(section, heading, index) {
  if (section.id) return section.id;
  const slug = heading.textContent.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `panel-${index + 1}`;
}

function createSectionCollapsing(state) {
  if (!Array.isArray(state.collapsedSections)) state.collapsedSections = [];
  const entries = [];
  const sections = document.querySelectorAll("#controlSections > section.panel");

  sections.forEach((section, index) => {
    const heading = section.querySelector(":scope > h2");
    if (!heading) return;
    const key = sectionKey(section, heading, index);
    const content = document.createElement("div");
    const header = document.createElement("div");
    const button = document.createElement("button");
    const contentId = `panel-content-${key}`;

    content.className = "panel-section-content";
    content.id = contentId;
    header.className = "panel-section-header";
    button.className = "panel-section-toggle";
    button.type = "button";
    button.setAttribute("aria-controls", contentId);
    button.setAttribute("aria-label", `Collapse or expand ${heading.textContent.trim()}`);

    const movable = [...section.children].filter((child) => child !== heading);
    section.replaceChildren(header, content);
    header.append(heading, button);
    for (const child of movable) content.appendChild(child);
    section.dataset.sectionKey = key;

    function sync() {
      const collapsed = state.collapsedSections.includes(key);
      section.classList.toggle("is-section-collapsed", collapsed);
      button.textContent = collapsed ? "+" : "−";
      button.title = collapsed ? "Expand section" : "Collapse section";
      button.setAttribute("aria-expanded", String(!collapsed));
    }

    button.addEventListener("click", () => {
      const collapsed = new Set(state.collapsedSections);
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      state.collapsedSections = [...collapsed];
      sync();
      emitStateChange("collapsedSections", state.collapsedSections);
    });
    entries.push({ key, sync });
  });

  // First run collapses every section so the viewport opens clear. Seeding is
  // recorded so a later deliberate expand-all is not undone on reload.
  if (!state.sectionsSeeded) {
    state.collapsedSections = entries
      .map((entry) => entry.key)
      .filter((key) => !FIRST_RUN_OPEN_SECTIONS.has(key));
    state.sectionsSeeded = true;
    emitStateChange("collapsedSections", state.collapsedSections);
  }

  // Always paint the stored state onto the freshly built sections. The returned
  // applier only runs on world switches, so without this a reload rendered every
  // section expanded regardless of what was saved.
  for (const entry of entries) entry.sync();

  return () => {
    if (!Array.isArray(state.collapsedSections)) state.collapsedSections = [];
    for (const entry of entries) entry.sync();
  };
}

export function wireUi(state, sceneApi, options = {}) {
  const rangeInputs = new Map();
  const toggleInputs = new Map();
  const stateSyncListeners = new Set();
  const syncSectionCollapsing = createSectionCollapsing(state);
  const rangeBindings = [
    ["hexDensity", "hexDensity"], ["hexStrength", "hexStrength"],
    ["hexBorderStrength", "hexBorderStrength"], ["hexEdgeWidth", "hexEdgeWidth"],
    ["hexCohesion", "hexCohesion"], ["hexCoastSnap", "hexCoastSnap"],
    ["cartoonStrength", "cartoonStrength"], ["landTintStrength", "landTintStrength"],
    ["saturation", "saturation"], ["oceanShine", "oceanShine"],
    ["spinSpeed", "spinSpeed"], ["planetScale", "planetScale"],
    ["lightAzimuth", "lightAzimuthDegrees"], ["lightElevation", "lightElevationDegrees"],
    ["gridOpacity", "gridOpacity"], ["cloudOpacity", "cloudOpacity"],
    ["cloudDriftSpeed", "cloudDriftSpeed"], ["cloudSoftness", "cloudSoftness"],
  ];
  for (const [id, key] of rangeBindings) {
    const input = bindRange(id, state, key, sceneApi, Number);
    if (input) rangeInputs.set(key, input);
  }
  const projectionSlider = bindRange("projectionBlend", state, "projectionBlend", sceneApi, Number);
  if (projectionSlider) rangeInputs.set("projectionBlend", projectionSlider);

  const toggles = [
    ["cloudsToggle", "cloudsVisible"], ["atmosphereToggle", "atmosphereVisible"],
    ["outlineToggle", "outlineVisible"], ["fullLightToggle", "fullLight"],
    ["satellitesToggle", "satellitesVisible"],
    ["pureFlatToggle", "pureFlat"], ["latLongGridToggle", "latLongGridVisible"],
    ["continentNamesToggle", "continentNamesVisible"],
    ["countryStatsToggle", "countryStatsVisible"],
    ["hexEqualAreaToggle", "hexEqualArea"],
  ];
  for (const [id, key] of toggles) {
    const input = bindToggle(id, state, key, sceneApi);
    if (input) toggleInputs.set(key, input);
  }

  const spinSpeedInput = document.getElementById("spinSpeed");
  const pauseButton = document.getElementById("pauseSpin");
  let spinPaused = false;
  pauseButton?.addEventListener("click", () => {
    spinPaused = !spinPaused;
    sceneApi.setPaused(spinPaused);
    pauseButton.textContent = spinPaused ? "Resume spin" : "Pause spin";
  });
  document.getElementById("resetView")?.addEventListener("click", sceneApi.resetView);
  document.getElementById("resetSettings")?.addEventListener("click", () => {
    options.onResetSettings?.();
  });

  const hud = document.getElementById("hud");
  const collapseButton = document.getElementById("collapseHud");
  function syncHudCollapsed() {
    const collapsed = !!state.hudCollapsed;
    hud?.classList.toggle("is-collapsed", collapsed);
    if (!collapseButton) return;
    collapseButton.textContent = collapsed ? "+" : "−";
    collapseButton.title = collapsed ? "Expand controls" : "Collapse controls";
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
  }
  syncHudCollapsed();
  collapseButton?.addEventListener("click", () => {
    state.hudCollapsed = !state.hudCollapsed;
    syncHudCollapsed();
    emitStateChange("hudCollapsed", state.hudCollapsed);
  });

  const presets = [
    ["viewGlobe", 0, false], ["viewTransform", 0.56, false], ["viewFlat", 1, true],
  ];
  for (const [id, target, pureFlat] of presets) {
    document.getElementById(id)?.addEventListener("click", () => animateProjection({
      state, sceneApi, slider: projectionSlider, target, pureFlat,
    }));
  }

  return {
    syncFromState() {
      for (const [key, input] of rangeInputs) input.value = String(state[key]);
      for (const [key, input] of toggleInputs) input.checked = !!state[key];
      syncHudCollapsed();
      syncSectionCollapsing();
      for (const listener of stateSyncListeners) listener();
    },
    addStateSync(listener) {
      if (typeof listener !== "function") return () => {};
      stateSyncListeners.add(listener);
      return () => stateSyncListeners.delete(listener);
    },
    setSpinSpeed(value) {
      state.spinSpeed = Number(value);
      if (spinSpeedInput) spinSpeedInput.value = String(state.spinSpeed);
      sceneApi.applyState(state);
      emitStateChange("spinSpeed", state.spinSpeed);
    },
  };
}
