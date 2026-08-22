import { NORTH_AMERICA_COUNTRIES } from "./north-america.js";
import { SOUTH_AMERICA_COUNTRIES } from "./south-america.js";
import { EUROPE_COUNTRIES } from "./europe.js";
import { AFRICA_COUNTRIES } from "./africa.js";
import { ASIA_COUNTRIES } from "./asia.js";
import { AUSTRALIA_COUNTRIES } from "./australia.js";

export const COUNTRIES_BY_CONTINENT = Object.freeze({
  "north-america": NORTH_AMERICA_COUNTRIES,
  "south-america": SOUTH_AMERICA_COUNTRIES,
  europe: EUROPE_COUNTRIES,
  africa: AFRICA_COUNTRIES,
  asia: ASIA_COUNTRIES,
  australia: AUSTRALIA_COUNTRIES,
  antarctica: Object.freeze([]),
});

export function countriesForContinent(continentId) {
  return COUNTRIES_BY_CONTINENT[continentId] ?? [];
}
