import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let hitTestSourceRequested = false;

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
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // AR button
  const button = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  document.body.appendChild(button);

  // Reticle
  const ring = new THREE.RingGeometry(0.08, 0.1, 32);
  ring.rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Controller for select (tap)
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Session start / end handlers
  renderer.xr.addEventListener('sessionstart', onXRSessionStart);
  renderer.xr.addEventListener('sessionend', onXRSessionEnd);

  window.addEventListener('resize', onWindowResize);

  const info = document.getElementById('info');
  if (info) info.textContent = 'Tap "Enter AR" to start. Move your phone slowly to help detection.';
}

async function onXRSessionStart() {
  // We don't call requestHitTestSource here directly because we need a session+viewer space and
  // a stable lifecycle; instead we flag and request inside render when frame is available.
  hitTestSourceRequested = false; // ensure fresh
  const info = document.getElementById('info');
  if (info) info.textContent = 'Move your phone slowly to detect surfaces...';
}

function onXRSessionEnd() {
  hitTestSourceRequested = false;
  hitTestSource = null;
  // clear any reticle / measurement state optionally:
  reticle.visible = false;
}

async function ensureHitTestSource(session) {
  if (hitTestSource || hitTestSourceRequested === true) return;
  hitTestSourceRequested = true;

  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    // optional: you could also request a local-referenceSpace here if you need it
    console.log('Hit test source created');
  } catch (err) {
    console.warn('Failed to create hit test source:', err);
    hitTestSourceRequested = false; // allow retry
  }
}

function onSelect() {
  // Only allow placing points when reticle is visible (i.e. there's a valid hit)
  if (!reticle.visible) {
    const info = document.getElementById('info');
    if (info) info.textContent = 'No surface detected. Move the device slowly and try again.';
    return;
  }

  // Create a small red dot at the reticle position
  const dotGeo = new THREE.SphereGeometry(0.01, 12, 12);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.setFromMatrixPosition(reticle.matrix);
  scene.add(dot);

  measurementPoints.push(dot.position.clone());
  meshes.push(dot);

  if (measurementPoints.length === 2) {
    // Remove old line if present
    if (line) {
      scene.remove(line);
      line.geometry.dispose?.();
      line.material.dispose?.();
      line = null;
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints(measurementPoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);

    const dist = measurementPoints[0].distanceTo(measurementPoints[1]);
    const info = document.getElementById('info');
    if (info) info.textContent = `Distance: ${dist.toFixed(2)} m — tap anywhere to reset.`;
  } else {
    const info = document.getElementById('info');
    if (info) info.textContent = 'Tap second point to measure distance.';
  }

  // If user taps again (third tap), reset measurement
  if (measurementPoints.length > 2) {
    clearMeasurement();
  }
}

function clearMeasurement() {
  meshes.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose?.();
    if (m.material) m.material.dispose?.();
  });
  meshes = [];

  if (line) {
    scene.remove(line);
    if (line.geometry) line.geometry.dispose?.();
    if (line.material) line.material.dispose?.();
    line = null;
  }

  measurementPoints = [];
  const info = document.getElementById('info');
  if (info) info.textContent = 'Tap first point on a surface.';
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, xrFrame) {
  // xrFrame is only available when an XR session is running & an XR frame is being produced.
  const session = renderer.xr.getSession();

  // If no XR session, just render the scene (or return)
  if (!session) {
    renderer.render(scene, camera);
    return;
  }

  // Ensure hit test source is requested and created (but only once)
  if (!hitTestSource && !hitTestSourceRequested) {
    // request it now using the session
    ensureHitTestSource(session);
  }

  // Only query hit-test results if we have a frame and a hitTestSource
  if (xrFrame && hitTestSource) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    try {
      const hitTestResults = xrFrame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          reticle.visible = true;
          // pose.transform.matrix is a DOMFloat32Array; fromArray accepts it fine
          reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          reticle.visible = false;
        }
      } else {
        reticle.visible = false;
      }
    } catch (err) {
      // If hit-test throws, clear source and allow re-request attempt
      console.warn('Hit test error:', err);
      hitTestSource = null;
      hitTestSourceRequested = false;
    }
  }

  renderer.render(scene, camera);
}
