import * as THREE from 'three';

const MIN_RADIUS = 0.05;
const MAX_RADIUS = 100000;
const MIN_PITCH = -Math.PI / 2 + 0.05;
const MAX_PITCH = Math.PI / 2 - 0.05;

export function attachStagePreviewCameraControls(rendererState) {
  if (!rendererState || rendererState.cameraControls) return rendererState?.cameraControls;
  const canvas = rendererState.renderer.domElement;
  const controls = createControls(rendererState);
  controls.onPointerDown = (event) => pointerDown(event, controls);
  controls.onPointerMove = (event) => pointerMove(event, controls);
  controls.onPointerUp = (event) => pointerUp(event, controls);
  controls.onWheel = (event) => wheel(event, controls);
  canvas.addEventListener('pointerdown', controls.onPointerDown);
  window.addEventListener('pointermove', controls.onPointerMove);
  window.addEventListener('pointerup', controls.onPointerUp);
  canvas.addEventListener('wheel', controls.onWheel, { passive: false });
  rendererState.cameraControls = controls;
  return controls;
}

export function detachStagePreviewCameraControls(rendererState) {
  const controls = rendererState?.cameraControls;
  if (!controls) return;
  const canvas = rendererState.renderer.domElement;
  canvas.removeEventListener('pointerdown', controls.onPointerDown);
  window.removeEventListener('pointermove', controls.onPointerMove);
  window.removeEventListener('pointerup', controls.onPointerUp);
  canvas.removeEventListener('wheel', controls.onWheel);
  rendererState.cameraControls = null;
}

export function fitStagePreviewCamera(rendererState, bbox) {
  const controls = rendererState?.cameraControls || attachStagePreviewCameraControls(rendererState);
  if (!controls) return;
  const sphere = bboxSphere(bbox);
  controls.target.copy(sphere.target);
  controls.radius = clamp(sphere.radius * 2.8, MIN_RADIUS, MAX_RADIUS);
  controls.defaultTarget.copy(controls.target);
  controls.defaultRadius = controls.radius;
  controls.yaw = Math.PI / 4;
  controls.pitch = Math.PI / 6;
  controls.initialized = true;
  updateCamera(controls);
}

export function resetStagePreviewCamera(rendererState) {
  const controls = rendererState?.cameraControls;
  if (!controls) return;
  controls.target.copy(controls.defaultTarget);
  controls.radius = controls.defaultRadius || controls.radius || 10;
  controls.yaw = Math.PI / 4;
  controls.pitch = Math.PI / 6;
  updateCamera(controls);
}

function createControls(rendererState) {
  return {
    rendererState,
    target: new THREE.Vector3(),
    defaultTarget: new THREE.Vector3(),
    radius: 10,
    defaultRadius: 10,
    yaw: Math.PI / 4,
    pitch: Math.PI / 6,
    active: false,
    lastX: 0,
    lastY: 0,
    initialized: false,
  };
}

function pointerDown(event, controls) {
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  event.preventDefault();
  controls.active = true;
  controls.lastX = event.clientX;
  controls.lastY = event.clientY;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function pointerMove(event, controls) {
  if (!controls.active) return;
  event.preventDefault();
  const dx = event.clientX - controls.lastX;
  const dy = event.clientY - controls.lastY;
  controls.lastX = event.clientX;
  controls.lastY = event.clientY;
  controls.yaw -= dx * 0.008;
  controls.pitch = clamp(controls.pitch - dy * 0.008, MIN_PITCH, MAX_PITCH);
  updateCamera(controls);
}

function pointerUp(event, controls) {
  if (!controls.active) return;
  event.preventDefault();
  controls.active = false;
}

function wheel(event, controls) {
  event.preventDefault();
  const factor = Math.exp(Math.sign(event.deltaY) * 0.12);
  controls.radius = clamp(controls.radius * factor, MIN_RADIUS, MAX_RADIUS);
  updateCamera(controls);
}

function updateCamera(controls) {
  const { camera, renderer, scene } = controls.rendererState;
  const x = Math.cos(controls.pitch) * Math.cos(controls.yaw) * controls.radius;
  const y = Math.sin(controls.pitch) * controls.radius;
  const z = Math.cos(controls.pitch) * Math.sin(controls.yaw) * controls.radius;
  camera.position.copy(controls.target).add(new THREE.Vector3(x, y, z));
  camera.near = Math.max(controls.radius / 1000, 0.01);
  camera.far = Math.max(controls.radius * 1000, 1000);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function bboxSphere(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 6) return { target: new THREE.Vector3(), radius: 4 };
  const target = new THREE.Vector3((bbox[0] + bbox[3]) / 2, (bbox[1] + bbox[4]) / 2, (bbox[2] + bbox[5]) / 2);
  const size = new THREE.Vector3(bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2]);
  return { target, radius: Math.max(size.length() / 2, 1) };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
