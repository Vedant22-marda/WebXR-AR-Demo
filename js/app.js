import * as THREE from '[https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js](https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js)';
import { ARButton } from '[https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js](https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js)';

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

// Setup hit-test source immediately on session start
renderer.xr.addEventListener('sessionstart', async () => {
const session = renderer.xr.getSession();
const viewerSpace = await session.requestReferenceSpace('viewer');
hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
localSpace = await session.requestReferenceSpace('local');
document.getElementById('info').textContent =
'Move your phone to detect surfaces, then tap first point.';
});

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

document.getElementById('info').textContent = 'Initializing AR session...';
}

function onSelect() {
if (!reticle.visible) return;

// Create red dot at tap point
const dotGeo = new THREE.SphereGeometry(0.01, 16, 16);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const dot = new THREE.Mesh(dotGeo, dotMat);
dot.position.setFromMatrixPosition(reticle.matrix);
scene.add(dot);

measurementPoints.push(dot.position.clone());
meshes.push(dot);

if (measurementPoints.length === 2) {
// Draw line between points
const lineGeo = new THREE.BufferGeometry().setFromPoints(measurementPoints);
const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
line = new THREE.Line(lineGeo, lineMat);
scene.add(line);

const dist = measurementPoints[0].distanceTo(measurementPoints[1]);
document.getElementById('info').textContent =
  `Distance: ${dist.toFixed(2)} m (tap again to start new measurement)`;

} else {
document.getElementById('info').textContent = 'Tap second point to measure distance.';
}

// Reset automatically on third tap
if (measurementPoints.length > 2) {
clearMeasurement();
}
}

function clearMeasurement() {
meshes.forEach((m) => scene.remove(m));
if (line) scene.remove(line);
meshes = [];
measurementPoints = [];
line = null;
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
if (!session || !hitTestSource) {
renderer.render(scene, camera);
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
