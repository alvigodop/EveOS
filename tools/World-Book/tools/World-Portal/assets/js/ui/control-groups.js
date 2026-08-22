import { emitWorldStateChange } from "../world/world-events.js";

// Runtime grouping keeps every existing panel and control ID intact. The
// definitions are exported so the complete 17-panel assignment can be checked
// without needing a browser DOM.
export const CONTROL_GROUPS = Object.freeze([
  Object.freeze({
    key: "group-world",
    label: "World",
    hint: "The active planet, its library, and measurements derived from it",
    sections: Object.freeze([
      "world-library", "landmassPanel", "geographyPanel", "accurate-source",
    ]),
  }),
  Object.freeze({
    key: "group-terrain",
    label: "Terrain workflow",
    hint: "Forge, Orogen exchange, refinement, and guided workflows",
    sections: Object.freeze([
      "heightmapForgePanel", "outerToolsPanel", "orogenLabPanel",
      "refinementMissionPanel", "eveGuidedPanel",
    ]),
  }),
  Object.freeze({
    key: "group-appearance",
    label: "Map appearance",
    hint: "Surface style, hex mosaic, overlays, clouds, and lighting",
    sections: Object.freeze([
      "planet-style", "hex-conversion", "map-overlays", "cloud-layer", "lighting",
    ]),
  }),
  Object.freeze({
    key: "group-view",
    label: "View and space",
    hint: "Projection, planet scale, motion, and orbital bodies",
    sections: Object.freeze([
      "projection", "planet-and-orbital-layers", "celestialSystemPanel",
    ]),
  }),
]);

export const DEFAULT_COLLAPSED_GROUPS = Object.freeze([
  "group-appearance", "group-view",
]);

export function planControlGroups(sectionKeys) {
  const available = new Set(sectionKeys || []);
  const claimed = new Set();
  const groups = CONTROL_GROUPS.map((definition) => {
    const sections = definition.sections.filter((key) => available.has(key));
    for (const key of sections) claimed.add(key);
    return { ...definition, sections };
  }).filter((group) => group.sections.length);
  return {
    groups,
    unclaimed: [...available].filter((key) => !claimed.has(key)),
  };
}

export function normalizeCollapsedGroups(value, fallback = DEFAULT_COLLAPSED_GROUPS) {
  const valid = new Set(CONTROL_GROUPS.map((group) => group.key));
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.filter((key) => valid.has(key)))];
}

function stabilizeLayout(container) {
  container.classList.add("is-layout-stabilizing");
  const release = () => window.setTimeout(() => {
    container.classList.remove("is-layout-stabilizing");
  }, 120);
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(release);
  } else release();
}

export function createControlGroups(state) {
  const container = document.getElementById("controlSections");
  if (!container) return () => {};

  const sections = new Map(
    [...container.querySelectorAll(":scope > section.panel")]
      .map((section) => [section.dataset.sectionKey, section])
      .filter(([key]) => key),
  );
  const plan = planControlGroups(sections.keys());
  const entries = [];

  for (const definition of plan.groups) {
    const group = document.createElement("section");
    const header = document.createElement("header");
    const heading = document.createElement("h2");
    const count = document.createElement("span");
    const button = document.createElement("button");
    const hint = document.createElement("p");
    const body = document.createElement("div");

    group.className = "control-group";
    group.dataset.groupKey = definition.key;
    heading.id = `control-heading-${definition.key}`;
    heading.textContent = definition.label;
    group.setAttribute("aria-labelledby", heading.id);
    header.className = "control-group__header";
    count.className = "control-group__count";
    count.textContent = String(definition.sections.length);
    count.setAttribute("aria-label", `${definition.sections.length} panels`);
    button.className = "control-group__toggle";
    button.type = "button";
    body.className = "control-group__body";
    body.id = `control-body-${definition.key}`;
    button.setAttribute("aria-controls", body.id);
    hint.className = "control-group__hint";
    hint.id = `control-hint-${definition.key}`;
    hint.textContent = definition.hint;
    group.setAttribute("aria-describedby", hint.id);

    header.append(heading, count, button);
    group.append(header, hint, body);
    for (const key of definition.sections) body.appendChild(sections.get(key));
    container.appendChild(group);

    function sync() {
      const collapsed = state.collapsedGroups.includes(definition.key);
      group.classList.toggle("is-group-collapsed", collapsed);
      body.hidden = collapsed;
      hint.hidden = collapsed;
      button.textContent = collapsed ? "+" : "−";
      button.title = collapsed ? `Expand ${definition.label}` : `Collapse ${definition.label}`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-expanded", String(!collapsed));
    }

    function onToggle() {
      const collapsed = new Set(state.collapsedGroups);
      if (collapsed.has(definition.key)) collapsed.delete(definition.key);
      else collapsed.add(definition.key);
      state.collapsedGroups = normalizeCollapsedGroups([...collapsed]);
      sync();
      stabilizeLayout(container);
      emitWorldStateChange("collapsedGroups", state.collapsedGroups);
    }

    button.addEventListener("click", onToggle);
    entries.push({ sync, destroy: () => button.removeEventListener("click", onToggle) });
  }

  for (const key of plan.unclaimed) container.appendChild(sections.get(key));

  function syncFromState() {
    const seeded = state.groupsSeeded !== false;
    state.collapsedGroups = normalizeCollapsedGroups(
      seeded ? state.collapsedGroups : DEFAULT_COLLAPSED_GROUPS,
    );
    if (!seeded) {
      state.groupsSeeded = true;
      emitWorldStateChange("collapsedGroups", state.collapsedGroups);
    }
    for (const entry of entries) entry.sync();
    stabilizeLayout(container);
  }

  syncFromState();
  syncFromState.destroy = () => entries.forEach((entry) => entry.destroy());
  return syncFromState;
}
