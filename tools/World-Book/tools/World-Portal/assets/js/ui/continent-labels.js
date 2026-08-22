import * as THREE from "three";
import { CONFIG } from "../core/config.js";

const CONTINENTS = Object.freeze([
  { name: "North America", latitude: 45, longitude: -105 },
  { name: "South America", latitude: -17, longitude: -60 },
  { name: "Europe", latitude: 53, longitude: 18 },
  { name: "Africa", latitude: 8, longitude: 20 },
  { name: "Asia", latitude: 38, longitude: 92 },
  { name: "Australia", latitude: -25, longitude: 134 },
  { name: "Antarctica", latitude: -77, longitude: 20 },
]);

function smoothBlend(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function localPosition(latitudeDegrees, longitudeDegrees, blend) {
  const latitude = THREE.MathUtils.degToRad(latitudeDegrees);
  const longitude = THREE.MathUtils.degToRad(longitudeDegrees);
  const cosLatitude = Math.cos(latitude);

  const sphereNormal = new THREE.Vector3(
    Math.sin(longitude) * cosLatitude,
    Math.sin(latitude),
    Math.cos(longitude) * cosLatitude,
  ).normalize();

  const spherePosition = sphereNormal
    .clone()
    .multiplyScalar(CONFIG.earthRadius * 1.028);

  const u = longitudeDegrees / 360 + 0.5;
  const v = latitudeDegrees / 180 + 0.5;
  const flatPosition = new THREE.Vector3(
    (u - 0.5) * CONFIG.flatWidth,
    (v - 0.5) * CONFIG.flatHeight,
    0.028,
  );

  return {
    position: spherePosition.lerp(flatPosition, blend),
    sphereNormal,
  };
}

function isInsideViewport(x, y, rectangle, margin = 72) {
  return (
    x >= rectangle.left - margin &&
    x <= rectangle.right + margin &&
    y >= rectangle.top - margin &&
    y <= rectangle.bottom + margin
  );
}

export function createContinentLabels(sceneApi, state) {
  const root = document.createElement("div");
  root.className = "continent-labels";
  root.setAttribute("aria-hidden", "true");
  document.body.appendChild(root);

  const labels = CONTINENTS.map((continent) => {
    const element = document.createElement("div");
    element.className = "continent-label";
    element.textContent = continent.name;
    root.appendChild(element);
    return { continent, element };
  });

  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let animationFrame = 0;
  let destroyed = false;

  function hide(element) {
    element.classList.remove("is-visible");
  }

  function update() {
    if (destroyed) return;
    animationFrame = requestAnimationFrame(update);

    if (!state.continentNamesVisible) {
      root.classList.remove("is-enabled");
      labels.forEach(({ element }) => hide(element));
      return;
    }

    const { renderer, camera, earth } = sceneApi;
    if (!renderer || !camera || !earth?.group) {
      labels.forEach(({ element }) => hide(element));
      return;
    }

    root.classList.add("is-enabled");

    earth.group.updateWorldMatrix(true, false);
    normalMatrix.getNormalMatrix(earth.group.matrixWorld);

    const rectangle = renderer.domElement.getBoundingClientRect();
    const blend = smoothBlend(state.projectionBlend ?? 0);
    const flatLike = blend > 0.62;

    for (const { continent, element } of labels) {
      const local = localPosition(
        continent.latitude,
        continent.longitude,
        blend,
      );

      worldPosition
        .copy(local.position)
        .applyMatrix4(earth.group.matrixWorld);

      if (!flatLike) {
        worldNormal
          .copy(local.sphereNormal)
          .applyMatrix3(normalMatrix)
          .normalize();
        toCamera
          .copy(camera.position)
          .sub(worldPosition)
          .normalize();

        // Hide labels on the far side of the sphere and soften them near
        // the limb. Flat and mostly-flat views do not need occlusion.
        const facing = worldNormal.dot(toCamera);
        if (facing < 0.12) {
          hide(element);
          continue;
        }
        element.style.setProperty(
          "--continent-label-facing",
          String(THREE.MathUtils.clamp((facing - 0.12) / 0.56, 0.38, 1)),
        );
      } else {
        element.style.setProperty("--continent-label-facing", "1");
      }

      const projected = worldPosition.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) {
        hide(element);
        continue;
      }

      const x = rectangle.left + (projected.x * 0.5 + 0.5) * rectangle.width;
      const y = rectangle.top + (-projected.y * 0.5 + 0.5) * rectangle.height;

      if (!isInsideViewport(x, y, rectangle)) {
        hide(element);
        continue;
      }

      const cameraDistance = camera.position.distanceTo(worldPosition);
      const zoomScale = THREE.MathUtils.clamp(4.4 / cameraDistance, 0.78, 1.18);
      const flatScale = THREE.MathUtils.lerp(1, 0.92, blend);

      element.style.transform = (
        `translate3d(${x}px, ${y}px, 0) ` +
        `translate(-50%, -50%) scale(${zoomScale * flatScale})`
      );
      element.classList.toggle("is-flat", flatLike);
      element.classList.add("is-visible");
    }
  }

  animationFrame = requestAnimationFrame(update);

  return {
    update,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      root.remove();
    },
  };
}
