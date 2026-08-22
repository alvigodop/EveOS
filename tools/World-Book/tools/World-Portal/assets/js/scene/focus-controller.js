import * as THREE from "three";
import { CONFIG } from "../core/config.js";
import { flatPosition, sphereNormal, smoothProjectionBlend } from "../geo/geo-position.js";

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function createFocusController({ camera, controls, earth, state }) {
  let animationToken = 0;

  function cancelFocus() {
    animationToken += 1;
  }

  function focusCoordinates(latitude, longitude, options = {}) {
    const token = ++animationToken;
    const blend = smoothProjectionBlend(state.projectionBlend);
    const duration = options.duration ?? 620;
    const distance = options.distance ?? (blend > 0.72 ? 4.8 : 3.05);
    const planetScale = THREE.MathUtils.clamp(state.planetScale ?? 1.0, 0.45, 2.0);
    const startCamera = camera.position.clone();
    const startTarget = controls.target.clone();
    const desiredTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();

    earth.group.updateWorldMatrix(true, false);
    if (blend > 0.72) {
      desiredTarget.copy(flatPosition(latitude, longitude, 0)).applyMatrix4(earth.group.matrixWorld);
      desiredCamera.copy(desiredTarget).add(new THREE.Vector3(0, 0, distance * planetScale));
    } else {
      const direction = sphereNormal(latitude, longitude)
        .applyQuaternion(earth.group.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      desiredCamera.copy(direction).multiplyScalar(distance * planetScale);
      desiredTarget.set(0, 0, 0);
    }

    const startTime = performance.now();
    function frame(now) {
      if (token !== animationToken) return;
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(progress);
      camera.position.lerpVectors(startCamera, desiredCamera, eased);
      controls.target.lerpVectors(startTarget, desiredTarget, eased);
      controls.update();
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return { focusCoordinates, cancelFocus };
}
