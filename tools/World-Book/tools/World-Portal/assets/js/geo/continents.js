export const CONTINENTS = Object.freeze([
  { id: "north-america", name: "North America", latitude: 45, longitude: -105, focusDistance: 3.35 },
  { id: "south-america", name: "South America", latitude: -17, longitude: -60, focusDistance: 3.25 },
  { id: "europe", name: "Europe", latitude: 53, longitude: 18, focusDistance: 2.85 },
  { id: "africa", name: "Africa", latitude: 8, longitude: 20, focusDistance: 3.15 },
  { id: "asia", name: "Asia", latitude: 38, longitude: 92, focusDistance: 3.55 },
  { id: "australia", name: "Australia / Oceania", shortName: "Australia", latitude: -25, longitude: 134, focusDistance: 2.95 },
  { id: "antarctica", name: "Antarctica", latitude: -77, longitude: 20, focusDistance: 3.2 },
]);

export const CONTINENT_BY_ID = Object.freeze(
  Object.fromEntries(CONTINENTS.map((continent) => [continent.id, continent])),
);
