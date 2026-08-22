import { CONTINENTS } from "../geo/continents.js";
import { COUNTRIES_BY_CONTINENT } from "../geo/countries/index.js";
import {
  loadCountryGeography,
  loadCountryGeographyIndex,
} from "../geo/country-geography-store.js";
import {
  deleteStoredWorld,
  listStoredWorlds,
  readActiveWorldId,
  saveStoredWorld,
  writeActiveWorldId,
} from "./world-library-store.js";
import { emitWorldStateChange } from "./world-events.js";
import { createDefaultCelestialBodies, normalizeCelestialBodies } from "./celestial-records.js";
import { ensureLayerAssets } from "./world-layer-store.js";
import { migrateWorldAssets } from "./world-assets.js";
const PROJECT_MANIFEST_PATH = "PROJECT-MANIFEST.json";
const EMPTY_LIST = Object.freeze([]);
function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}
function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}
function cloneJson(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return JSON.parse(JSON.stringify(fallback));
  }
}
async function fetchProjectManifest() {
  const response = await fetch(PROJECT_MANIFEST_PATH, { cache: "no-store" });
  if (!response.ok) throw new Error(`World Portal manifest unavailable (${response.status}).`);
  return response.json();
}
function createEarthRecord() {
  return {
    id: "earth",
    schemaVersion: 1,
    name: "Earth",
    kind: "world",
    builtin: true,
    createdAt: null,
    updatedAt: null,
    surface: {
      textureUrl: "assets/textures/earth-blue-marble.png",
      textureName: "earth-blue-marble.png",
      textureType: "image/png",
      projection: "equirectangular",
      rendering: "NASA texture-space hex mosaic",
    },
    metadata: {
      continents: CONTINENTS,
      countriesByContinent: COUNTRIES_BY_CONTINENT,
      countryGeography: null,
      subdivisionsByCountry: {},
      celestialBodies: createDefaultCelestialBodies(),
      source: "bundled-earth-geography",
    },
    viewState: {},
  };
}
function normalizeWorldRecord(source) {
  const record = source && typeof source === "object" ? source : {};
  const normalized = {
    ...record,
    id: normalizeId(record.id),
    name: String(record.name || "Unnamed World").trim() || "Unnamed World",
    kind: "world", builtin: false,
    surface: { ...(record.surface || {}) },
    metadata: {
      ...(record.metadata || {}),
      continents: Array.isArray(record.metadata?.continents) ? record.metadata.continents : [],
      countriesByContinent: record.metadata?.countriesByContinent || {},
      countryGeography: record.metadata?.countryGeography || {},
      subdivisionsByCountry: record.metadata?.subdivisionsByCountry || {},
      celestialBodies: normalizeCelestialBodies(record.metadata?.celestialBodies),
    },
    assets: record.assets && typeof record.assets === "object" ? record.assets : {},
    viewState: viewStateFrom(record.viewState),
  };
  migrateWorldAssets(normalized);
  return normalized;
}
function buildHierarchy(record) {
  const continentById = new Map();
  const countriesByContinent = new Map();
  const countryByCode = new Map();
  const sourceContinents = record.metadata?.continents || [];
  const sourceCountries = record.metadata?.countriesByContinent || {};
  for (const sourceContinent of sourceContinents) {
    const id = normalizeId(sourceContinent.id || sourceContinent.name);
    if (!id) continue;
    const continent = Object.freeze({
      ...sourceContinent,
      id,
      kind: "continent",
      parentId: record.id,
      worldId: record.id,
    });
    continentById.set(id, continent);
    const countries = Object.freeze((sourceCountries[id] || []).map((sourceCountry) => {
      const code = normalizeCode(sourceCountry.code);
      const country = Object.freeze({
        ...sourceCountry,
        code,
        kind: "country",
        parentId: id,
        continentId: id,
        worldId: record.id,
      });
      if (code) countryByCode.set(code, country);
      return country;
    }));
    countriesByContinent.set(id, countries);
  }
  return {
    continents: Object.freeze([...continentById.values()]),
    continentById,
    countriesByContinent,
    countryByCode,
  };
}
function buildRuntime(record, persisted = false) {
  const hierarchy = buildHierarchy(record);
  const world = {
    id: record.id,
    name: record.name,
    kind: "world",
    parentId: null,
    builtin: !!record.builtin,
    surface: record.surface,
    metadata: record.metadata,
    hierarchy: Object.freeze([
      "continents", "countries and territories", "focused maps", "boundaries",
      "measurements", "rivers", "lakes", "subdivisions and states",
    ]),
  };
  return { record, world, hierarchy, persisted, dirty: false };
}

function viewStateFrom(state) {
  return Object.fromEntries(Object.entries(state || {}).filter(([key]) => (
    key !== "selectedContinentId" && key !== "selectedCountryCode"
  )));
}
async function fetchTextureBlob(surface) {
  if (surface.textureBlob instanceof Blob) return surface.textureBlob;
  if (!surface.textureUrl) throw new Error("World surface image is unavailable.");
  const response = await fetch(surface.textureUrl);
  if (!response.ok) throw new Error(`World image unavailable (${response.status}).`);
  return response.blob();
}
async function mapWithConcurrency(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
      completed += 1;
      onProgress?.(completed / Math.max(items.length, 1));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
export function createWorldPortal(state) {
  const runtimes = new Map();
  runtimes.set("earth", buildRuntime(createEarthRecord(), true));
  let activeWorldId = "earth";
  let projectManifest = null;
  let geographyIndex = null;
  let initializationPromise = null;

  function activeRuntime() {
    return runtimes.get(activeWorldId) || runtimes.get("earth");
  }

  async function initialize() {
    if (!initializationPromise) {
      initializationPromise = Promise.allSettled([
        fetchProjectManifest(), loadCountryGeographyIndex(), listStoredWorlds(),
      ]).then(([manifestResult, indexResult, worldsResult]) => {
        if (manifestResult.status === "fulfilled") projectManifest = manifestResult.value;
        else console.warn(manifestResult.reason);
        if (indexResult.status === "fulfilled") geographyIndex = indexResult.value;
        else console.warn(indexResult.reason);
        if (worldsResult.status === "fulfilled") {
          for (const source of worldsResult.value) {
            const record = normalizeWorldRecord(source);
            if (record.id && record.id !== "earth") runtimes.set(record.id, buildRuntime(record, true));
          }
        } else console.warn(worldsResult.reason);
        const savedActiveId = normalizeId(readActiveWorldId());
        activeWorldId = runtimes.has(savedActiveId) ? savedActiveId : "earth";
        clearSelection();
        return api;
      });
    }
    return initializationPromise;
  }

  function getWorlds() {
    return [...runtimes.values()].map((runtime) => ({
      id: runtime.world.id,
      name: runtime.world.name,
      builtin: runtime.world.builtin,
      saved: runtime.persisted,
      dirty: runtime.dirty,
      active: runtime.world.id === activeWorldId,
      continentCount: runtime.hierarchy.continents.length,
      countryCount: runtime.hierarchy.countryByCode.size,
      layerCount: ensureLayerAssets(runtime.record).layers.length,
      analysisSessionCount: ensureLayerAssets(runtime.record).analysisSessions.length,
      refinementPassCount: ensureLayerAssets(runtime.record).refinementPasses.length,
    }));
  }

  function getContinent(continentOrId) {
    const id = normalizeId(continentOrId?.id ?? continentOrId);
    return activeRuntime().hierarchy.continentById.get(id) ?? null;
  }

  function getCountries(continentOrId) {
    const continent = getContinent(continentOrId);
    return continent
      ? activeRuntime().hierarchy.countriesByContinent.get(continent.id) ?? EMPTY_LIST
      : EMPTY_LIST;
  }

  function getCountry(countryOrCode) {
    const code = normalizeCode(countryOrCode?.code ?? countryOrCode);
    return activeRuntime().hierarchy.countryByCode.get(code) ?? null;
  }
  function getCountryContext(countryOrCode) {
    const country = getCountry(countryOrCode);
    if (!country) return null;
    return { world: activeRuntime().world, continent: getContinent(country.continentId), country };
  }
  function clearSelection() {
    state.selectedContinentId = null;
    state.selectedCountryCode = null;
  }
  function activateWorld(worldId) {
    const id = normalizeId(worldId);
    if (!runtimes.has(id)) throw new Error("World is not present in this portal.");
    if (id === activeWorldId) return activeRuntime().world;
    activeWorldId = id;
    clearSelection();
    writeActiveWorldId(id);
    emitWorldStateChange("activeWorldId", id, { world: activeRuntime().world });
    return activeRuntime().world;
  }
  async function addWorld(source, { persist = false, activate = true } = {}) {
    const record = normalizeWorldRecord(source);
    if (!record.id || record.id === "earth") throw new Error("Custom world ID is invalid.");
    const runtime = buildRuntime(record, false);
    runtimes.set(record.id, runtime);
    if (persist) {
      await saveStoredWorld(record);
      runtime.persisted = true;
    }
    if (activate) activateWorld(record.id);
    emitWorldStateChange("worldLibrary", getWorlds(), { action: "add", world: runtime.world });
    return runtime.world;
  }

  function updateActiveViewState(sourceState, { markDirty = true } = {}) {
    const runtime = activeRuntime();
    runtime.record.viewState = viewStateFrom(sourceState);
    if (markDirty && !runtime.world.builtin) runtime.dirty = true;
    return runtime.record.viewState;
  }
  function renameActiveWorld(name) {
    const runtime = activeRuntime();
    if (runtime.world.builtin) throw new Error("The built-in Earth name is fixed.");
    const nextName = String(name || "").trim();
    if (!nextName) throw new Error("World name cannot be empty.");
    runtime.record.name = nextName;
    runtime.world.name = nextName;
    runtime.record.updatedAt = new Date().toISOString();
    runtime.dirty = true;
    emitWorldStateChange("worldLibrary", getWorlds(), { action: "rename", world: runtime.world });
    return runtime.world;
  }

  async function saveActiveWorld() {
    const runtime = activeRuntime();
    if (runtime.world.builtin) throw new Error("Earth is built in; export it to make a portable copy.");
    runtime.record.updatedAt = new Date().toISOString();
    await saveStoredWorld(runtime.record);
    runtime.persisted = true;
    runtime.dirty = false;
    emitWorldStateChange("worldLibrary", getWorlds(), { action: "save", world: runtime.world });
    return runtime.world;
  }

  async function removeWorld(worldId) {
    const id = normalizeId(worldId);
    const runtime = runtimes.get(id);
    if (!runtime || runtime.world.builtin) throw new Error("The built-in Earth cannot be removed.");
    if (id === activeWorldId) activateWorld("earth");
    await deleteStoredWorld(id);
    runtimes.delete(id);
    emitWorldStateChange("worldLibrary", getWorlds(), { action: "remove", worldId: id });
  }

  function replaceActiveMetadata(metadata) {
    const runtime = activeRuntime();
    if (runtime.world.builtin) throw new Error("Built-in Earth metadata is read-only.");
    runtime.record.metadata = cloneJson(metadata, runtime.record.metadata);
    runtime.world.metadata = runtime.record.metadata;
    runtime.hierarchy = buildHierarchy(runtime.record);
    runtime.dirty = true;
    clearSelection();
    emitWorldStateChange("activeWorldMetadata", runtime.world.id, { world: runtime.world });
  }

  async function loadCountryRecord(countryOrCode) {
    const context = getCountryContext(countryOrCode);
    if (!context) throw new Error("Country is not owned by the active world.");
    const runtime = activeRuntime();
    const geography = runtime.world.builtin
      ? await loadCountryGeography(context.country.code)
      : runtime.record.metadata.countryGeography?.[context.country.code];
    if (!geography) throw new Error("This world does not contain geography for that country.");
    return {
      ...context,
      geography,
      layers: {
        boundaries: geography.polygons ?? [],
        rivers: geography.rivers ?? [],
        lakes: geography.lakes ?? [],
        measurements: geography.stats ?? {},
        subdivisions: geography.subdivisions
          ?? runtime.record.metadata.subdivisionsByCountry?.[context.country.code] ?? [],
      },
    };
  }

  async function materializeActiveWorld(onProgress) {
    const runtime = activeRuntime();
    updateActiveViewState(state);
    if (!runtime.world.builtin) {
      return { ...runtime.record, surface: { ...runtime.record.surface } };
    }
    const countries = [...runtime.hierarchy.countryByCode.values()];
    const records = await mapWithConcurrency(
      countries, 8, (country) => loadCountryGeography(country.code), onProgress,
    );
    const countryGeography = Object.fromEntries(countries.map((country, index) => [
      country.code, records[index],
    ]));
    return {
      ...runtime.record,
      id: "earth-portable",
      name: "Earth",
      builtin: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      surface: {
        ...runtime.record.surface,
        textureBlob: await fetchTextureBlob(runtime.record.surface),
      },
      metadata: {
        continents: cloneJson(CONTINENTS),
        countriesByContinent: cloneJson(COUNTRIES_BY_CONTINENT),
        countryGeography,
        subdivisionsByCountry: {},
        celestialBodies: cloneJson(runtime.record.metadata.celestialBodies),
        source: "portable-earth-geography",
      },
      viewState: viewStateFrom(state),
    };
  }

  function describe() {
    const runtime = activeRuntime();
    return {
      world: runtime.world,
      worlds: getWorlds(),
      project: projectManifest,
      geographyIndex: runtime.world.builtin ? geographyIndex : null,
      continentCount: runtime.hierarchy.continents.length,
      countryCount: runtime.hierarchy.countryByCode.size,
      selection: {
        continent: getContinent(state.selectedContinentId),
        country: getCountry(state.selectedCountryCode),
      },
    };
  }

  const api = {
    initialize,
    get world() { return activeRuntime().world; },
    get activeWorldId() { return activeWorldId; },
    getWorlds,
    getWorld: (worldId) => runtimes.get(normalizeId(worldId))?.world ?? null,
    getActiveWorld: () => activeRuntime().world,
    getActiveSurface: () => ({
      ...activeRuntime().record.surface,
      textureSource: activeRuntime().record.surface.textureBlob
        ?? activeRuntime().record.surface.textureUrl,
    }),
    getActiveRecord: () => activeRuntime().record,
    getActiveViewState: () => cloneJson(activeRuntime().record.viewState),
    updateActiveViewState,
    renameActiveWorld,
    activateWorld,
    addWorld,
    saveActiveWorld,
    removeWorld,
    replaceActiveMetadata,
    materializeActiveWorld,
    getContinents: () => activeRuntime().hierarchy.continents,
    getContinent,
    getCountries,
    getCountry,
    getCountryContext,
    selectContinent(continentOrId) {
      const continent = getContinent(continentOrId);
      state.selectedContinentId = continent?.id ?? null;
      state.selectedCountryCode = null;
      return continent;
    },
    selectCountry(countryOrCode) {
      const country = getCountry(countryOrCode);
      state.selectedContinentId = country?.continentId ?? null;
      state.selectedCountryCode = country?.code ?? null;
      return country;
    },
    clearSelection,
    loadCountryRecord,
    loadCountryGeographyIndex: () => activeRuntime().world.builtin
      ? loadCountryGeographyIndex() : Promise.resolve(null),
    getProjectManifest: () => projectManifest,
    getGeographyIndex: () => activeRuntime().world.builtin ? geographyIndex : null,
    describe,
  };

  return Object.freeze(api);
}
