import { CONFIG } from "../core/config.js";
import { WORLD_PORTAL_STATE_EVENT, emitWorldStateChange } from "../world/world-events.js";
import {
  createWorldRecordFromImage,
  exportWorldPackage,
  importWorldPackage,
} from "../world/world-package.js";

function element(id) {
  return document.getElementById(id);
}

async function readImageDimensions(file) {
  if (!window.createImageBitmap) return null;
  try {
    const bitmap = await window.createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export function createWorldManager({ portal, state, sceneApi, uiApi, autosave }) {
  const worldSelect = element("worldSelect");
  const worldName = element("worldName");
  const mapFile = element("worldMapFile");
  const packageFile = element("worldPackageFile");
  const addButton = element("addWorldMap");
  const saveButton = element("saveWorldMap");
  const exportButton = element("exportWorldMap");
  const importButton = element("importWorldMap");
  const removeButton = element("removeWorldMap");
  const summary = element("worldMetadataSummary");
  const status = element("worldManagerStatus");
  const saveState = element("worldSaveState");
  const brandSubtitle = document.querySelector(".brand-copy p");
  const controls = [worldSelect, worldName, mapFile, packageFile,
    addButton, saveButton, exportButton, importButton, removeButton];
  let busy = false;

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
  }

  function setBusy(nextBusy) {
    busy = !!nextBusy;
    for (const control of controls) {
      if (control) control.disabled = busy;
    }
    if (!busy) refresh();
  }

  function currentSummary() {
    return portal.getWorlds().find((world) => world.id === portal.activeWorldId) || null;
  }

  function restoreActiveViewState() {
    const defaults = Object.fromEntries(Object.entries(CONFIG.defaults).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value]
        : value && typeof value === "object" ? { ...value } : value,
    ]));
    Object.assign(state, defaults, portal.getActiveViewState());
  }

  function refresh() {
    const worlds = portal.getWorlds();
    const current = currentSummary();
    if (worldSelect) {
      const previous = portal.activeWorldId;
      worldSelect.replaceChildren(...worlds.map((world) => {
        const option = document.createElement("option");
        option.value = world.id;
        option.textContent = `${world.name}${world.builtin ? " · built in" : world.dirty ? " · unsaved" : ""}`;
        return option;
      }));
      worldSelect.value = previous;
      worldSelect.disabled = busy;
    }
    if (!current) return;
    const activeWorld = portal.getActiveWorld();
    if (worldName) {
      if (document.activeElement !== worldName) worldName.value = activeWorld.name;
      worldName.disabled = busy;
    }
    if (saveButton) saveButton.disabled = busy || current.builtin;
    if (removeButton) removeButton.disabled = busy || current.builtin;
    if (exportButton) exportButton.disabled = busy;
    if (summary) {
      summary.textContent = `${current.continentCount} continents · ${current.countryCount} countries/territories · ${current.layerCount || 0} map layers · ${current.analysisSessionCount || 0} Orogen sessions · ${
        current.builtin ? "bundled metadata" : current.saved ? "saved locally" : "not saved"
      }`;
    }
    if (brandSubtitle) brandSubtitle.textContent = `${activeWorld.name} · owned geography · relational world system`;
    document.title = `World Portal — ${activeWorld.name}`;
  }

  async function activateWorldSurface(worldId) {
    const previousId = portal.activeWorldId;
    portal.updateActiveViewState(state);
    await autosave.flush("World switch checkpoint");
    portal.activateWorld(worldId);
    restoreActiveViewState();
    try {
      await sceneApi.setWorldSurface(portal.getActiveSurface(), (fraction) => {
        setStatus(`Loading world map… ${Math.round(fraction * 100)}%`);
      });
    } catch (error) {
      portal.activateWorld(previousId);
      restoreActiveViewState();
      throw error;
    }
    sceneApi.setCelestialBodies(portal.getActiveWorld().metadata.celestialBodies || []);
    sceneApi.applyState(state);
    uiApi.syncFromState();
    emitWorldStateChange("worldViewState", portal.activeWorldId);
  }

  async function showWorld(worldId) {
    if (busy || worldId === portal.activeWorldId) return;
    setBusy(true);
    setStatus("Switching world surface…");
    try {
      await activateWorldSurface(worldId);
      setStatus(`${portal.getActiveWorld().name} is now active.`);
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function addWorld() {
    const file = mapFile?.files?.[0];
    if (!file) {
      setStatus("Choose a 2:1 equirectangular world map image first.", true);
      return;
    }
    setBusy(true);
    setStatus("Reading world map…");
    try {
      portal.updateActiveViewState(state);
      const enteredName = worldName?.value.trim();
      const newWorldName = enteredName && enteredName !== portal.getActiveWorld().name
        ? enteredName : file.name;
      const record = createWorldRecordFromImage(
        file, newWorldName, portal.getActiveViewState(),
      );
      const dimensions = await readImageDimensions(file);
      if (dimensions) {
        Object.assign(record.surface, dimensions);
        const sourceLayer = record.assets?.layers?.find((layer) => layer.type === "visual-map");
        if (sourceLayer) Object.assign(sourceLayer, dimensions);
      }
      await portal.addWorld(record, { persist: true, activate: false });
      await activateWorldSurface(record.id);
      if (dimensions && Math.abs(dimensions.width / dimensions.height - 2) > 0.08) {
        setStatus("World added, but the image is not close to 2:1 and may distort on the globe.", true);
      } else {
        setStatus("World added and saved locally. Reloading the browser will restore it.");
      }
      if (mapFile) mapFile.value = "";
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function saveWorld() {
    if (busy) return;
    setBusy(true);
    setStatus("Saving map and owned metadata…");
    try {
      if (worldName?.value.trim() !== portal.getActiveWorld().name) {
        portal.renameActiveWorld(worldName.value);
      }
      portal.updateActiveViewState(state);
      await autosave.flush("Manual world checkpoint");
      setStatus("World map, metadata, layers, and view settings saved locally.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function exportWorld() {
    if (busy) return;
    setBusy(true);
    setStatus("Preparing portable world package…");
    try {
      if (!portal.getActiveWorld().builtin && worldName?.value.trim()) {
        portal.renameActiveWorld(worldName.value);
      }
      portal.updateActiveViewState(state);
      const record = await portal.materializeActiveWorld((fraction) => {
        setStatus(`Collecting owned geography… ${Math.round(fraction * 100)}%`);
      });
      await exportWorldPackage(record);
      setStatus("Portable world package exported.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function importWorld() {
    const file = packageFile?.files?.[0];
    if (!file) {
      setStatus("Choose a .world-portal.json package first.", true);
      return;
    }
    setBusy(true);
    setStatus("Importing world package…");
    try {
      const ids = new Set(portal.getWorlds().map((world) => world.id));
      const record = await importWorldPackage(file, ids);
      await portal.addWorld(record, { persist: true, activate: false });
      await activateWorldSurface(record.id);
      setStatus("World map and all packaged metadata imported and saved.");
      if (packageFile) packageFile.value = "";
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function removeWorld() {
    const current = currentSummary();
    if (!current || current.builtin || busy) return;
    if (!window.confirm(`Remove “${current.name}” and all metadata it owns?`)) return;
    setBusy(true);
    setStatus("Removing world and owned metadata…");
    try {
      await portal.removeWorld(current.id);
      await sceneApi.setWorldSurface(portal.getActiveSurface());
      restoreActiveViewState();
      sceneApi.setCelestialBodies(portal.getActiveWorld().metadata.celestialBodies || []);
      sceneApi.applyState(state);
      uiApi.syncFromState();
      emitWorldStateChange("worldViewState", portal.activeWorldId);
      setStatus("World map and its complete owned metadata were removed.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  worldSelect?.addEventListener("change", () => showWorld(worldSelect.value));
  worldName?.addEventListener("change", () => {
    if (busy || portal.getActiveWorld().builtin) return;
    try {
      portal.renameActiveWorld(worldName.value);
      autosave.schedule("World renamed");
    } catch (error) {
      setStatus(error?.message || String(error), true);
    }
  });
  addButton?.addEventListener("click", addWorld);
  saveButton?.addEventListener("click", saveWorld);
  exportButton?.addEventListener("click", exportWorld);
  importButton?.addEventListener("click", importWorld);
  removeButton?.addEventListener("click", removeWorld);
  function onWorldEvent(event) {
    const key = event.detail?.key;
    if (["activeWorldId", "worldLibrary", "activeWorldMetadata", "worldViewState", "worldAssets"].includes(key)) {
      refresh();
    }
    if (key === "worldSaveState" && saveState) {
      saveState.dataset.status = event.detail?.value || "";
      saveState.textContent = event.detail?.message || "Persistence ready.";
    }
  }

  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
  refresh();

  return {
    refresh,
    showWorld,
    destroy() {
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onWorldEvent);
    },
  };
}
