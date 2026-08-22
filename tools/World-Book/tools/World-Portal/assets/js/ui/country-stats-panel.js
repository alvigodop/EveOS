import { emitWorldStateChange } from "../world/world-events.js";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function metric(label, value, suffix = "") {
  return `
    <div class="country-stat">
      <span class="country-stat__label">${label}</span>
      <strong class="country-stat__value">${number.format(value ?? 0)}${suffix}</strong>
    </div>`;
}

function setText(element, value) {
  if (element) element.textContent = value;
}

export function createCountryStatsPanel({ state, onOpenDetail }) {
  const panel = document.getElementById("countryStatsPanel");
  const title = document.getElementById("countryStatsTitle");
  const subtitle = document.getElementById("countryStatsSubtitle");
  const metrics = document.getElementById("countryStatsMetrics");
  const note = document.getElementById("countryStatsNote");
  const openButton = document.getElementById("openCountryDetail");
  const closeButton = document.getElementById("closeCountryStats");
  let currentCountry = null;
  let currentData = null;
  let currentContext = null;

  function syncVisibility() {
    if (!panel) return;
    panel.hidden = !state.countryStatsVisible || !currentData;
  }

  function restorePanelPreference() {
    if (state.countryStatsVisible) return;
    state.countryStatsVisible = true;
    const toggle = document.getElementById("countryStatsToggle");
    if (toggle) toggle.checked = true;
    emitWorldStateChange("countryStatsVisible", true);
  }

  function showLoading(country, context = null) {
    currentCountry = country;
    currentData = null;
    currentContext = context;
    restorePanelPreference();
    panel.hidden = false;
    setText(title, country.name);
    setText(subtitle, `${context?.world?.name ?? "Earth"} › ${context?.continent?.name ?? "World"} · Loading physical geography…`);
    metrics.replaceChildren();
    setText(note, "Preparing mapped land and water measurements.");
    if (openButton) openButton.disabled = true;
  }

  function show(country, data, context = null) {
    currentCountry = country;
    currentData = data;
    currentContext = context;
    const stats = data.stats;
    setText(title, country.name);
    setText(
      subtitle,
      `${context?.world?.name ?? "Earth"} › ${context?.continent?.name ?? "World"} · Area rank #${stats.areaRank} · ${percent.format(stats.worldLandSharePercent)}% of mapped world land`,
    );
    metrics.innerHTML = [
      metric("Reference area", stats.landAreaKm2, " km²"),
      metric("East–west span", stats.eastWestSpanKm, " km"),
      metric("North–south span", stats.northSouthSpanKm, " km"),
      metric("Coastline estimate", stats.coastlineEstimateKm, " km"),
      metric("Mapped river segments", stats.mappedRiverSegments),
      metric("Mapped river length", stats.mappedRiverLengthKm, " km"),
      metric("Mapped lakes", stats.mappedLakePolygons),
      metric("Mapped lake area", stats.mappedLakeAreaKm2, " km²"),
    ].join("");
    setText(
      note,
      "Hydrology counts are mapped dataset features, not a census of every river or lake.",
    );
    if (openButton) openButton.disabled = false;
    syncVisibility();
  }

  function clear() {
    currentCountry = null;
    currentData = null;
    currentContext = null;
    panel.hidden = true;
  }

  openButton?.addEventListener("click", () => {
    if (currentCountry && currentData) onOpenDetail(currentCountry, currentData, currentContext);
  });
  closeButton?.addEventListener("click", () => {
    state.countryStatsVisible = false;
    const toggle = document.getElementById("countryStatsToggle");
    if (toggle) toggle.checked = false;
    panel.hidden = true;
    emitWorldStateChange("countryStatsVisible", false);
  });

  return { showLoading, show, clear, syncVisibility };
}
