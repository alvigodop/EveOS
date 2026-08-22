import { WORLD_PORTAL_STATE_EVENT, emitWorldStateChange } from "../world/world-events.js";
import {
  createCelestialBody, normalizeCelestialBodies,
} from "../world/celestial-records.js";

function element(id) {
  return document.getElementById(id);
}

export function createCelestialManager({ portal, sceneApi, autosave }) {
  const select = element("celestialBodySelect");
  const kind = element("celestialKind");
  const name = element("celestialName");
  const radius = element("celestialRadius");
  const orbitRadius = element("celestialOrbitRadius");
  const orbitSpeed = element("celestialOrbitSpeed");
  const inclination = element("celestialInclination");
  const color = element("celestialColor");
  const visible = element("celestialVisible");
  const add = element("addCelestialBody");
  const remove = element("removeCelestialBody");
  const summary = element("celestialSummary");
  let selectedId = "";
  let syncing = false;

  function bodies() {
    const metadata = portal.getActiveRecord().metadata;
    metadata.celestialBodies = normalizeCelestialBodies(metadata.celestialBodies);
    return metadata.celestialBodies;
  }

  function selected() {
    return bodies().find((body) => body.id === selectedId) || bodies()[0] || null;
  }

  function applyBodies(reason) {
    const normalized = normalizeCelestialBodies(bodies(), false);
    portal.getActiveRecord().metadata.celestialBodies = normalized;
    portal.getActiveWorld().metadata.celestialBodies = normalized;
    sceneApi.setCelestialBodies(normalized);
    emitWorldStateChange("celestialSystem", portal.activeWorldId, { bodies: normalized });
    autosave.schedule(reason);
  }

  function syncFields() {
    const body = selected();
    syncing = true;
    if (body) {
      kind.value = body.kind;
      name.value = body.name;
      radius.value = body.radius;
      orbitRadius.value = body.orbitRadius;
      orbitSpeed.value = body.orbitSpeed;
      inclination.value = body.inclination;
      color.value = body.color;
      visible.checked = body.visible;
    }
    for (const control of [kind, name, radius, orbitRadius, orbitSpeed, inclination, color, visible, remove]) {
      if (control) control.disabled = !body;
    }
    syncing = false;
  }

  function refresh() {
    const list = bodies();
    const previous = selectedId;
    select.replaceChildren(...list.map((body) => {
      const option = document.createElement("option");
      option.value = body.id;
      option.textContent = `${body.name} · ${body.kind}`;
      return option;
    }));
    selectedId = list.some((body) => body.id === previous) ? previous : list[0]?.id || "";
    select.value = selectedId;
    if (summary) {
      const rings = list.filter((body) => body.kind === "ring").length;
      summary.textContent = `${list.length} orbital object${list.length === 1 ? "" : "s"}${rings ? ` · ${rings} ring system${rings === 1 ? "" : "s"}` : ""}`;
    }
    syncFields();
  }

  function updateSelected() {
    if (syncing) return;
    const body = selected();
    if (!body) return;
    body.kind = kind.value;
    body.name = name.value.trim() || body.name;
    body.radius = Number(radius.value);
    body.orbitRadius = Number(orbitRadius.value);
    body.orbitSpeed = Number(orbitSpeed.value);
    body.inclination = Number(inclination.value);
    body.color = color.value;
    body.visible = visible.checked;
    applyBodies("Celestial system updated");
    refresh();
  }

  select?.addEventListener("change", () => {
    selectedId = select.value;
    syncFields();
  });
  for (const control of [kind, name, radius, orbitRadius, orbitSpeed, inclination, color, visible]) {
    control?.addEventListener("change", updateSelected);
  }
  add?.addEventListener("click", () => {
    const list = bodies();
    const body = createCelestialBody(kind?.value || "moon", list.length);
    list.push(body);
    selectedId = body.id;
    applyBodies("Orbital object added");
    refresh();
  });
  remove?.addEventListener("click", () => {
    const list = bodies();
    const index = list.findIndex((body) => body.id === selectedId);
    if (index < 0) return;
    list.splice(index, 1);
    selectedId = list[0]?.id || "";
    applyBodies("Orbital object removed");
    refresh();
  });

  function onWorldEvent(event) {
    if (event.detail?.key === "activeWorldId") {
      selectedId = "";
      sceneApi.setCelestialBodies(bodies());
      refresh();
    }
  }
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
  sceneApi.setCelestialBodies(bodies());
  refresh();
  return {
    refresh,
    destroy() {
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
    },
  };
}
