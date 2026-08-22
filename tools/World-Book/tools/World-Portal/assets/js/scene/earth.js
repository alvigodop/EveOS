import * as THREE from "three";
import { createCloudTexture } from "./clouds.js";
import { createAtmosphere } from "./atmosphere.js";
import { createEarthMaterial, updateEarthMaterial } from "./materials/earth-material.js";
import { createCloudMaterial, updateCloudMaterial } from "./materials/cloud-material.js";

function createProjectionGeometry() {
  return new THREE.PlaneGeometry(1, 1, 256, 128);
}

export function createEarth(texture, radius, flatWidth, flatHeight, state) {
  const group = new THREE.Group();
  const geometry = createProjectionGeometry();
  const material = createEarthMaterial(texture, radius, flatWidth, flatHeight, state);
  const surface = new THREE.Mesh(geometry, material);
  // The vertex shader expands the source 1x1 plane to the full world map.
  // Disable CPU frustum culling so close flat-map pans do not hide it based
  // on the geometry's smaller, undisplaced bounds.
  surface.frustumCulled = false;
  surface.renderOrder = 2;
  group.add(surface);

  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.018, 96, 72),
    new THREE.MeshBasicMaterial({
      color: 0x2aa8ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  outline.renderOrder = 0;
  group.add(outline);

  const atmosphere = createAtmosphere(radius);
  atmosphere.renderOrder = 0;
  group.add(atmosphere);

  const cloudMaterial = createCloudMaterial(
    createCloudTexture(), radius, flatWidth, flatHeight, state,
  );
  const clouds = new THREE.Mesh(geometry, cloudMaterial);
  clouds.frustumCulled = false;
  clouds.position.z = 0.008;
  clouds.renderOrder = 3;
  group.add(clouds);

  return {
    group,
    surface,
    material,
    outline,
    clouds,
    cloudMaterial,
    atmosphere,
    setTexture(nextTexture) {
      material.uniforms.uMap.value = nextTexture;
      material.needsUpdate = true;
    },
    updateCloudOffset(offset) {
      cloudMaterial.uniforms.uOffset.value = offset;
    },
    updateFromState(nextState) {
      updateEarthMaterial(material, nextState);
      updateCloudMaterial(cloudMaterial, nextState);
      const blend = nextState.projectionBlend;
      const pureFlat = nextState.pureFlat && blend > 0.92;
      outline.visible = nextState.outlineVisible && !pureFlat && blend < 0.97;
      atmosphere.visible = nextState.atmosphereVisible && !pureFlat && blend < 0.97;
      clouds.visible = nextState.cloudsVisible;
      outline.material.opacity = THREE.MathUtils.lerp(0.18, 0.02, blend);
    },
  };
}
