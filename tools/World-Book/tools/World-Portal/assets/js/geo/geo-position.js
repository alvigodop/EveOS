import * as THREE from "three";
import { CONFIG } from "../core/config.js";

export function smoothProjectionBlend(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function sphereNormal(latitudeDegrees, longitudeDegrees) {
  const latitude = THREE.MathUtils.degToRad(latitudeDegrees);
  const longitude = THREE.MathUtils.degToRad(longitudeDegrees);
  const cosLatitude = Math.cos(latitude);
  return new THREE.Vector3(
    Math.sin(longitude) * cosLatitude,
    Math.sin(latitude),
    Math.cos(longitude) * cosLatitude,
  ).normalize();
}

export function flatPosition(latitudeDegrees, longitudeDegrees, z = 0.03) {
  const u = longitudeDegrees / 360 + 0.5;
  const v = latitudeDegrees / 180 + 0.5;
  return new THREE.Vector3(
    (u - 0.5) * CONFIG.flatWidth,
    (v - 0.5) * CONFIG.flatHeight,
    z,
  );
}

export function localGeoPosition(latitude, longitude, blend, radiusScale = 1.03) {
  const normal = sphereNormal(latitude, longitude);
  const sphere = normal.clone().multiplyScalar(CONFIG.earthRadius * radiusScale);
  const flat = flatPosition(latitude, longitude);
  return {
    position: sphere.lerp(flat, smoothProjectionBlend(blend)),
    sphereNormal: normal,
  };
}

export function projectWorldPosition(worldPosition, camera, rectangle) {
  const projected = worldPosition.clone().project(camera);
  return {
    x: rectangle.left + (projected.x * 0.5 + 0.5) * rectangle.width,
    y: rectangle.top + (-projected.y * 0.5 + 0.5) * rectangle.height,
    depth: projected.z,
  };
}

export function insideViewport(x, y, rectangle, margin = 72) {
  return x >= rectangle.left - margin && x <= rectangle.right + margin
    && y >= rectangle.top - margin && y <= rectangle.bottom + margin;
}
