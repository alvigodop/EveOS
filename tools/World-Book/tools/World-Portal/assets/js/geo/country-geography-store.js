const BASE_PATH = "assets/data/country-geography";
const cache = new Map();
let indexPromise = null;

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Geography data unavailable (${response.status}).`);
  }
  return response.json();
}

export function loadCountryGeographyIndex() {
  if (!indexPromise) {
    indexPromise = fetchJson(`${BASE_PATH}/index.json`);
  }
  return indexPromise;
}

export async function loadCountryGeography(code) {
  const normalized = String(code || "").toUpperCase();
  if (!normalized) throw new Error("Country code is required.");
  if (!cache.has(normalized)) {
    cache.set(normalized, fetchJson(`${BASE_PATH}/${normalized}.json`));
  }
  return cache.get(normalized);
}
