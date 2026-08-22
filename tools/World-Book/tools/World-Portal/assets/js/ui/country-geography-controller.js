import { WORLD_PORTAL_STATE_EVENT } from "../world/world-events.js";
import { createCountryStatsPanel } from "./country-stats-panel.js";
import { createCountryDetailOverlay } from "./country-detail-overlay.js";

export function createCountryGeographyController(state, portal) {
  const detailOverlay = createCountryDetailOverlay(state);
  const statsPanel = createCountryStatsPanel({
    state,
    onOpenDetail: detailOverlay.open,
  });
  let selectionToken = 0;

  async function selectCountry(country) {
    const token = ++selectionToken;
    const context = portal.getCountryContext(country.code);
    statsPanel.showLoading(country, context);
    try {
      const record = await portal.loadCountryRecord(country.code);
      if (token !== selectionToken) return;
      statsPanel.show(record.country, record.geography, record);
    } catch (error) {
      console.error(error);
      statsPanel.clear();
    }
  }

  function clearSelection() {
    selectionToken += 1;
    statsPanel.clear();
    detailOverlay.close();
  }

  function onStateChange(event) {
    const key = event.detail?.key;
    if (key === "countryStatsVisible") statsPanel.syncVisibility();
    if (key === "activeWorldId" || key === "activeWorldMetadata") clearSelection();
  }

  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onStateChange);

  return {
    selectCountry,
    clearSelection,
    destroy() {
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onStateChange);
      clearSelection();
    },
  };
}
