import * as THREE from "three";
import { PROJECTION_VERTEX_SHADER } from "../shaders/projection-vertex.js";
import { CLOUD_FRAGMENT_SHADER } from "../shaders/cloud-fragment.js";

export function createCloudMaterial(texture, radius, flatWidth, flatHeight, state) {
  return new THREE.ShaderMaterial({
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCloudMap: { value: texture },
      uProjectionBlend: { value: state.projectionBlend },
      uRadius: { value: radius * 1.018 },
      uFlatWidth: { value: flatWidth },
      uFlatHeight: { value: flatHeight },
      uOpacity: { value: state.cloudOpacity },
      uSoftness: { value: state.cloudSoftness },
      uOffset: { value: 0 },
    },
    vertexShader: PROJECTION_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
  });
}

export function updateCloudMaterial(material, state) {
  material.uniforms.uProjectionBlend.value = state.projectionBlend;
  material.uniforms.uOpacity.value = state.cloudOpacity;
  material.uniforms.uSoftness.value = state.cloudSoftness;
}
