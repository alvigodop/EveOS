import * as THREE from "three";
import {
  insideViewport,
  localGeoPosition,
  projectWorldPosition,
  smoothProjectionBlend,
} from "../geo/geo-position.js";

function intersects(a, b, padding = 4) {
  return !(a.right + padding < b.left || a.left - padding > b.right
    || a.bottom + padding < b.top || a.top - padding > b.bottom);
}

export function createGeographyLabels(sceneApi, state, portal, handlers) {
  const root = document.createElement("div");
  root.className = "geography-labels";
  document.body.appendChild(root);

  const continentLabels = portal.getContinents().map((continent) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "continent-label";
    element.textContent = continent.shortName ?? continent.name;
    element.setAttribute("aria-pressed", "false");
    element.addEventListener("click", () => handlers.onContinentSelect(continent));
    root.appendChild(element);
    return { data: continent, element };
  });

  let countryLabels = [];
  let selectedContinentId = null;
  let selectedCountryCode = null;
  let animationFrame = 0;
  let destroyed = false;
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  function rebuildCountryLabels(continentId) {
    for (const item of countryLabels) item.element.remove();
    countryLabels = portal.getCountries(continentId).map((country) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "country-marker";
      element.innerHTML = `<span class="country-marker__dot"></span><span class="country-marker__name"></span>`;
      element.querySelector(".country-marker__name").textContent = country.name;
      element.title = country.name;
      element.addEventListener("click", () => handlers.onCountrySelect(country));
      root.appendChild(element);
      return { data: country, element };
    });
  }

  function placeItem(item, blend, rectangle, flatLike, kind) {
    const { renderer, camera, earth } = sceneApi;
    const local = localGeoPosition(item.data.latitude, item.data.longitude, blend, kind === "country" ? 1.04 : 1.028);
    worldPosition.copy(local.position).applyMatrix4(earth.group.matrixWorld);

    if (!flatLike) {
      worldNormal.copy(local.sphereNormal).applyMatrix3(normalMatrix).normalize();
      toCamera.copy(camera.position).sub(worldPosition).normalize();
      const facing = worldNormal.dot(toCamera);
      if (facing < (kind === "country" ? 0.05 : 0.12)) return false;
      item.element.style.setProperty("--label-facing", String(THREE.MathUtils.clamp((facing - 0.05) / 0.62, 0.32, 1)));
    } else {
      item.element.style.setProperty("--label-facing", "1");
    }

    const projected = projectWorldPosition(worldPosition, camera, rectangle);
    if (projected.depth < -1 || projected.depth > 1 || !insideViewport(projected.x, projected.y, rectangle)) {
      return false;
    }
    const cameraDistance = camera.position.distanceTo(worldPosition);
    const baseScale = kind === "country" ? 0.90 : 1.0;
    const zoomScale = THREE.MathUtils.clamp(4.4 / cameraDistance, 0.70, 1.22) * baseScale;
    item.element.style.transform = `translate3d(${projected.x}px, ${projected.y}px, 0) translate(-50%, -50%) scale(${zoomScale})`;
    item.element.classList.toggle("is-flat", flatLike);
    item.element.classList.add("is-visible");
    return true;
  }

  function declutterCountries() {
    const visible = countryLabels.filter((item) => item.element.classList.contains("is-visible"));
    visible.sort((a, b) => (b.data.priority ?? 0) - (a.data.priority ?? 0));
    const occupied = [];
    for (const item of visible) {
      const selected = item.data.code === selectedCountryCode;
      item.element.classList.remove("is-compact", "is-selected");
      item.element.classList.toggle("is-selected", selected);
      const rectangle = item.element.getBoundingClientRect();
      const collides = occupied.some((other) => intersects(rectangle, other));
      if (collides && !selected) item.element.classList.add("is-compact");
      else occupied.push(rectangle);
    }
  }

  function update() {
    if (destroyed) return;
    animationFrame = requestAnimationFrame(update);
    const { renderer, camera, earth } = sceneApi;
    if (!renderer || !camera || !earth?.group) return;

    earth.group.updateWorldMatrix(true, false);
    normalMatrix.getNormalMatrix(earth.group.matrixWorld);
    const rectangle = renderer.domElement.getBoundingClientRect();
    const blend = smoothProjectionBlend(state.projectionBlend);
    const flatLike = blend > 0.62;

    for (const item of continentLabels) {
      item.element.classList.remove("is-visible", "is-selected");
      item.element.setAttribute("aria-pressed", "false");
      if (!state.continentNamesVisible) continue;
      const selected = item.data.id === selectedContinentId;
      item.element.setAttribute("aria-pressed", String(selected));
      if (placeItem(item, blend, rectangle, flatLike, "continent")) {
        item.element.classList.toggle("is-selected", selected);
      }
    }

    for (const item of countryLabels) {
      item.element.classList.remove("is-visible");
      if (!state.continentNamesVisible) continue;
      placeItem(item, blend, rectangle, flatLike, "country");
    }
    if (state.continentNamesVisible) declutterCountries();
  }

  animationFrame = requestAnimationFrame(update);
  return {
    selectContinent(continentId, showCountries = false) {
      selectedContinentId = continentId;
      selectedCountryCode = null;
      rebuildCountryLabels(showCountries ? continentId : null);
    },
    showCountries(continentId) {
      rebuildCountryLabels(continentId);
    },
    hideCountries() {
      rebuildCountryLabels(null);
    },
    selectCountry(countryCode) {
      selectedCountryCode = countryCode;
    },
    clearSelection() {
      selectedContinentId = null;
      selectedCountryCode = null;
      rebuildCountryLabels(null);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      root.remove();
    },
  };
}
