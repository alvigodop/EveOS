import { createCountryDetailMap } from "./country-detail-map.js";

const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function row(label, value, suffix = "") {
  return `<div class="country-detail-stat"><span>${label}</span><strong>${formatter.format(value ?? 0)}${suffix}</strong></div>`;
}

export function createCountryDetailOverlay(state) {
  const overlay = document.getElementById("countryDetailOverlay");
  const canvas = document.getElementById("countryDetailCanvas");
  const title = document.getElementById("countryDetailTitle");
  const subtitle = document.getElementById("countryDetailSubtitle");
  const stats = document.getElementById("countryDetailStats");
  const note = document.getElementById("countryDetailNote");
  const close = document.getElementById("closeCountryDetail");
  const riversToggle = document.getElementById("detailRiversToggle");
  const lakesToggle = document.getElementById("detailLakesToggle");
  const hexToggle = document.getElementById("detailHexToggle");
  const map = createCountryDetailMap(canvas, state);
  let currentData = null;
  let frame = 0;
  let lastSignature = "";

  const options = {
    riversVisible: true,
    lakesVisible: true,
    hexVisible: true,
  };

  function signature() {
    const rect = canvas.getBoundingClientRect();
    return [
      currentData?.code, rect.width, rect.height, map.revision,
      options.riversVisible, options.lakesVisible, options.hexVisible,
      state.hexDensity, state.hexStrength, state.hexBorderStrength,
      state.hexEdgeWidth, state.hexCohesion,
    ].join("|");
  }

  function renderLoop() {
    if (overlay.hidden || !currentData) return;
    const nextSignature = signature();
    if (nextSignature !== lastSignature) {
      map.render(currentData, options);
      lastSignature = nextSignature;
    }
    frame = requestAnimationFrame(renderLoop);
  }

  function fillStats(data) {
    const value = data.stats;
    stats.innerHTML = [
      row("Reference area", value.landAreaKm2, " km²"),
      row("Mapped geometry", value.mappedGeometryAreaKm2, " km²"),
      row("Area rank", value.areaRank),
      row("World land share", value.worldLandSharePercent, "%"),
      row("Boundary perimeter", value.boundaryPerimeterKm, " km"),
      row("Coastline estimate", value.coastlineEstimateKm, " km"),
      row("East–west span", value.eastWestSpanKm, " km"),
      row("North–south span", value.northSouthSpanKm, " km"),
      row("Mapped land pieces", value.mappedLandPieces),
      row("Largest land piece", value.largestLandPiecePercent, "%"),
      row("Mapped river segments", value.mappedRiverSegments),
      row("Mapped river length", value.mappedRiverLengthKm, " km"),
      row("Mapped lake polygons", value.mappedLakePolygons),
      row("Mapped lake area", value.mappedLakeAreaKm2, " km²"),
    ].join("");
  }

  function open(country, data, context = null) {
    currentData = data;
    title.textContent = country.name;
    subtitle.textContent = `${context?.world?.name ?? "Earth"} › ${context?.continent?.name ?? "World"} › ${country.name} · Focused physical-geography map`;
    fillStats(data);
    note.textContent = "River and lake counts describe mapped dataset features, not every watercourse or water body.";
    overlay.hidden = false;
    document.body.classList.add("country-detail-open");
    lastSignature = "";
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderLoop);
  }

  function closeOverlay() {
    overlay.hidden = true;
    document.body.classList.remove("country-detail-open");
    cancelAnimationFrame(frame);
  }

  function bindOption(element, key) {
    element.checked = options[key];
    element.addEventListener("change", () => {
      options[key] = element.checked;
      lastSignature = "";
    });
  }

  bindOption(riversToggle, "riversVisible");
  bindOption(lakesToggle, "lakesVisible");
  bindOption(hexToggle, "hexVisible");
  close?.addEventListener("click", closeOverlay);
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeOverlay();
  });

  return { open, close: closeOverlay };
}
