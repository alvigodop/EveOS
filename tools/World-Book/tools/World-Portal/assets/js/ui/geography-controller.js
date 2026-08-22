import { WORLD_PORTAL_STATE_EVENT } from "../world/world-events.js";
import { createGeographyLabels } from "./geography-labels.js";
import { createGeographyPanel } from "./geography-panel.js";

export function createGeographyController(
  sceneApi, state, uiApi, countryGeography, portal,
) {
  let labels;
  const panel = createGeographyPanel({
    onCountrySelect: selectCountry,
    onClear: clearSelection,
  });

  function stopSpin() {
    uiApi.setSpinSpeed(0);
  }

  function focusContinent(continent) {
    sceneApi.focusCoordinates(continent.latitude, continent.longitude, {
      distance: continent.focusDistance,
    });
  }

  function revealCountries(continent) {
    const countries = portal.getCountries(continent.id);
    panel.show(portal.world, continent, countries);
    labels.selectContinent(continent.id, true);
  }

  function activateContinent(continent) {
    portal.selectContinent(continent);
    countryGeography?.clearSelection();
    revealCountries(continent);
    focusContinent(continent);
  }

  function selectContinent(continent) {
    stopSpin();

    if (state.selectedContinentId === continent.id) {
      clearSelection();
      return;
    }

    activateContinent(continent);
  }

  function selectCountry(country) {
    stopSpin();
    portal.selectCountry(country);
    labels.selectCountry(country.code);
    sceneApi.focusCoordinates(country.latitude, country.longitude, { distance: 2.75 });
    countryGeography?.selectCountry(country);
  }

  function clearSelection() {
    sceneApi.cancelFocus?.();
    portal.clearSelection();
    panel.hide();
    labels.clearSelection();
    countryGeography?.clearSelection();
  }

  function rebuildLabels() {
    labels?.destroy();
    labels = createGeographyLabels(sceneApi, state, portal, {
      onContinentSelect: selectContinent,
      onCountrySelect: selectCountry,
    });
  }

  function onStateChange(event) {
    const key = event.detail?.key;
    if (key === "activeWorldId" || key === "activeWorldMetadata") {
      panel.hide();
      countryGeography?.clearSelection();
      rebuildLabels();
      return;
    }
    if (key !== "continentNamesVisible" || event.detail.value) return;
    clearSelection();
  }

  rebuildLabels();
  window.addEventListener(WORLD_PORTAL_STATE_EVENT, onStateChange);

  return {
    selectContinent,
    selectCountry,
    clearSelection,
    destroy() {
      window.removeEventListener(WORLD_PORTAL_STATE_EVENT, onStateChange);
      labels.destroy();
    },
  };
}
