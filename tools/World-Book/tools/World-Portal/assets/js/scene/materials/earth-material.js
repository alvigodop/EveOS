import * as THREE from "three";
import { PROJECTION_VERTEX_SHADER } from "../shaders/projection-vertex.js";
import { EARTH_FRAGMENT_SHADER } from "../shaders/earth-fragment.js";

export function createEarthMaterial(texture, radius, flatWidth, flatHeight, state) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uMap: { value: texture },
      uLightDirection: { value: new THREE.Vector3(-0.72, 0.38, 0.58).normalize() },
      uHexDensity: { value: state.hexDensity },
      uHexStrength: { value: state.hexStrength },
      uHexBorderStrength: { value: state.hexBorderStrength },
      uHexEdgeWidth: { value: state.hexEdgeWidth },
      uHexCohesion: { value: state.hexCohesion },
      uHexCoastSnap: { value: state.hexCoastSnap },
      uHexEqualArea: { value: state.hexEqualArea ? 1 : 0 },
      uCartoon: { value: state.cartoonStrength },
      uLandTintStrength: { value: state.landTintStrength },
      uSaturation: { value: state.saturation },
      uOceanShine: { value: state.oceanShine },
      uFullLight: { value: state.fullLight ? 1 : 0 },
      uProjectionBlend: { value: state.projectionBlend },
      uRadius: { value: radius },
      uFlatWidth: { value: flatWidth },
      uFlatHeight: { value: flatHeight },
      uGridVisible: { value: state.latLongGridVisible ? 1 : 0 },
      uGridOpacity: { value: state.gridOpacity },
    },
    vertexShader: PROJECTION_VERTEX_SHADER,
    fragmentShader: EARTH_FRAGMENT_SHADER,
  });
}

export function updateEarthMaterial(material, state) {
  const uniforms = material.uniforms;
  uniforms.uHexDensity.value = state.hexDensity;
  uniforms.uHexStrength.value = state.hexStrength;
  uniforms.uHexBorderStrength.value = state.hexBorderStrength;
  uniforms.uHexEdgeWidth.value = state.hexEdgeWidth;
  uniforms.uHexCohesion.value = state.hexCohesion;
  uniforms.uHexCoastSnap.value = state.hexCoastSnap;
  uniforms.uHexEqualArea.value = state.hexEqualArea ? 1 : 0;
  uniforms.uCartoon.value = state.cartoonStrength;
  uniforms.uLandTintStrength.value = state.landTintStrength;
  uniforms.uSaturation.value = state.saturation;
  uniforms.uOceanShine.value = state.oceanShine;
  uniforms.uFullLight.value = state.fullLight ? 1 : 0;
  uniforms.uProjectionBlend.value = state.projectionBlend;
  uniforms.uGridVisible.value = state.latLongGridVisible ? 1 : 0;
  uniforms.uGridOpacity.value = state.gridOpacity;
  if (state.lightDirection) {
    uniforms.uLightDirection.value.copy(state.lightDirection).normalize();
  }
}
