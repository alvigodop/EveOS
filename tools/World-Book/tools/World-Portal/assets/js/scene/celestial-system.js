import * as THREE from "three";
import { normalizeCelestialBodies } from "../world/celestial-records.js";

function materialFor(body) {
  if (body.kind === "ring") {
    return new THREE.MeshStandardMaterial({
      color: body.color,
      roughness: 0.82,
      metalness: 0.08,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: body.color,
    roughness: body.kind === "ice" ? 0.48 : 0.88,
    metalness: body.kind === "asteroid" ? 0.08 : 0,
    emissive: body.kind === "gas" ? new THREE.Color(body.color).multiplyScalar(0.035) : 0x000000,
  });
}

function geometryFor(body) {
  if (body.kind === "ring") {
    return new THREE.TorusGeometry(body.orbitRadius, body.radius, 10, 160);
  }
  if (body.kind === "asteroid") {
    return new THREE.IcosahedronGeometry(body.radius, 2);
  }
  return new THREE.SphereGeometry(body.radius, 40, 32);
}

function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose?.());
    else object.material?.dispose?.();
  });
  group.clear();
}

export function createCelestialSystem(scene, initialBodies = []) {
  const root = new THREE.Group();
  root.name = "World Portal celestial system";
  scene.add(root);
  let entries = [];

  function setBodies(source) {
    disposeGroup(root);
    entries = [];
    const bodies = normalizeCelestialBodies(source);
    for (const body of bodies) {
      if (body.kind === "ring") {
        const mesh = new THREE.Mesh(geometryFor(body), materialFor(body));
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.y = THREE.MathUtils.degToRad(body.inclination);
        mesh.visible = body.visible;
        mesh.name = body.name;
        root.add(mesh);
        entries.push({ body, mesh, orbit: null, bobPhase: 0 });
        continue;
      }
      const orbit = new THREE.Group();
      orbit.rotation.z = THREE.MathUtils.degToRad(body.inclination);
      orbit.rotation.y = THREE.MathUtils.degToRad(body.phase);
      const mesh = new THREE.Mesh(geometryFor(body), materialFor(body));
      mesh.position.x = body.orbitRadius;
      mesh.visible = body.visible;
      mesh.name = body.name;
      orbit.add(mesh);
      root.add(orbit);
      entries.push({
        body,
        mesh,
        orbit,
        bobPhase: THREE.MathUtils.degToRad(body.phase),
      });
    }
    return bodies;
  }

  function update(delta) {
    for (const entry of entries) {
      if (!entry.orbit || !entry.body.visible) continue;
      entry.orbit.rotation.y = (entry.orbit.rotation.y + entry.body.orbitSpeed * delta)
        % (Math.PI * 2);
      entry.bobPhase = (entry.bobPhase + delta * Math.max(0.25, Math.abs(entry.body.orbitSpeed)))
        % (Math.PI * 2);
      entry.mesh.position.y = Math.sin(entry.bobPhase) * entry.body.bobAmplitude;
      entry.mesh.rotation.y += delta * 0.12;
    }
  }

  function setVisible(visible) {
    root.visible = !!visible;
  }

  function setScale(scale) {
    root.scale.setScalar(scale);
  }

  function dispose() {
    disposeGroup(root);
    root.removeFromParent();
  }

  setBodies(initialBodies);
  return { root, setBodies, setVisible, setScale, update, dispose };
}
