import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let localSpace = null;

let measurementPoints = [];
let meshes = [];
let line = null;

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Add AR button
  const button = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
  });
  document.body.appendChild(button);

  // Reticle for hit testing
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Controller for input taps
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  window.addEventListener('resize', onWindowResize);

  // Initial info message
  document.getElementById('info').textContent = 'Tap first point on a surface.';
}

async function onSessionStart(session) {
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  localSpace = await session.requestReferenceSpace('local');
}

function onSelect() {
  if (reticle.visible) {
    if (measurementPoints.length >= 2) {
      // Reset measurement on third tap
      clearMeasurement();
      return;
    }

    // Place marker cube
    const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.setFromMatrixPosition(reticle.matrix);
    scene.add(mesh);

    measurementPoints.push(mesh.position.clone());
    meshes.push(mesh);

    if (measurementPoints.length === 2) {
      // Draw line
      if (line) scene.remove(line);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(measurementPoints);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);

      const dist = measurementPoints[0].distanceTo(measurementPoints[1]);
      document.getElementById('info').textContent = `Distance: ${dist.toFixed(2)} meters. Tap anywhere to reset.`;
    } else {
      document.getElementById('info').textContent = 'Tap the second point to measure distance.';
    }
  }
}

function clearMeasurement() {
  measurementPoints = [];
  if (line) {
    scene.remove(line);
    line = null;
  }
  meshes.forEach(m => scene.remove(m));
  meshes = [];
  document.getElementById('info').textContent = 'Tap first point on a surface.';
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  const session = renderer.xr.getSession();
  if (!session) return;

  if (!hitTestSource) {
    onSessionStart(session);
    return;
  }

  const referenceSpace = renderer.xr.getReferenceSpace();
  const hitTestResults = frame.getHitTestResults(hitTestSource);

  if (hitTestResults.length > 0) {
    const hit = hitTestResults[0];
    const pose = hit.getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
  } else {
    reticle.visible = false;
  }

  renderer.render(scene, camera);
}
