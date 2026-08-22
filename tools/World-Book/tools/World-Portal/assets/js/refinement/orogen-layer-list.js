import { markLayerCanonical, removeLayer } from "../world/world-layer-store.js";
import { LAYER_TYPE_OPTIONS } from "./orogen-lab-view.js";
import { evidenceProfile } from "./evidence-profile.js";

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function layerMeta(layer) {
  const size = layer.width && layer.height ? `${layer.width} × ${layer.height}` : "size unknown";
  const profile = evidenceProfile(layer);
  const trust = Math.max(...Object.values(profile.trust || {}).map(Number));
  return `${layer.sourceTool || "Unknown source"} · ${size} · ${profile.status} · trust ${Math.round(trust * 100)}%`;
}

function actionButton(label, title = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (title) button.title = title;
  return button;
}

export function renderOrogenLayerList({
  source, view, record, autosave, engine, refresh, renderComparison,
}) {
  view.layerCount.textContent = `${source.length} layer${source.length === 1 ? "" : "s"}`;
  view.layerList.replaceChildren();
  for (const layer of source) {
    const card = document.createElement("article");
    card.className = `orogen-layer-card${layer.isCanonical ? " is-canonical" : ""}`;
    const title = document.createElement("strong");
    title.textContent = layer.name;
    const meta = document.createElement("span");
    meta.textContent = layerMeta(layer);
    const role = document.createElement("select");
    role.setAttribute("aria-label", `Role for ${layer.name}`);
    role.replaceChildren(...LAYER_TYPE_OPTIONS.map(([value, label]) => option(value, label)));
    role.value = layer.type;
    const actions = document.createElement("div");
    actions.className = "orogen-layer-actions";
    const useA = actionButton("A", "Use as Layer A");
    const useB = actionButton("B", "Use as Layer B");
    const edit = actionButton("Edit");
    const canonical = actionButton(layer.isCanonical ? "Canonical" : "Make canonical");
    const remove = actionButton("Remove");
    remove.className = "button--danger";

    role.addEventListener("change", () => {
      layer.type = role.value;
      layer.updatedAt = new Date().toISOString();
      if (layer.isCanonical) markLayerCanonical(record(), layer.id);
      autosave.schedule("Layer role updated");
      refresh();
    });
    useA.addEventListener("click", () => {
      view.compareA.value = layer.id;
      renderComparison();
    });
    useB.addEventListener("click", () => {
      view.compareB.value = layer.id;
      renderComparison();
    });
    edit.addEventListener("click", () => {
      const nextName = window.prompt("Layer name", layer.name);
      if (nextName === null) return;
      const nextNotes = window.prompt("Layer notes", layer.notes || "");
      if (nextNotes === null) return;
      Object.assign(layer, {
        name: nextName.trim() || layer.name,
        notes: nextNotes,
        updatedAt: new Date().toISOString(),
      });
      autosave.schedule("Layer metadata updated");
      refresh();
    });
    canonical.addEventListener("click", async () => {
      markLayerCanonical(record(), layer.id);
      await autosave.flush("Canonical layer selected");
      refresh();
    });
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Remove “${layer.name}” from this world?`)) return;
      removeLayer(record(), layer.id);
      await autosave.flush("Derived layer removed");
      engine.clearCache();
      refresh();
    });

    actions.append(useA, useB, edit, canonical, remove);
    card.append(title, meta, role, actions);
    if (layer.analysis?.anomaly) {
      const warning = document.createElement("em");
      warning.textContent = layer.analysis.anomaly;
      card.append(warning);
    }
    view.layerList.append(card);
  }
}
