import * as THREE from 'three';
import { STAGE_RENDER_PLAN_SCHEMA } from './StageRenderPlan.js';
import { createPreviewObject, createSelectionBox } from './StagePreviewGeometry.js';
import { disposeObjectTree } from './StagePreviewDisposal.js';
import {
  attachStagePreviewCameraControls,
  detachStagePreviewCameraControls,
  fitStagePreviewCamera,
  resetStagePreviewCamera,
} from './StagePreviewCameraControls.js';
import { attachStagePreviewPicking, detachStagePreviewPicking } from './StagePreviewPicking.js';

const SUPPORTED_RENDER_KINDS = ['CYLINDER', 'BOX', 'ELBOW', 'FACET_GROUP', 'UNKNOWN_DIAGNOSTIC', 'hidden'];

export function createStageThreePreviewRenderer(canvasHost) {
  canvasHost.querySelector('.json-viewer-webgl-canvas')?.remove();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.domElement.className = 'json-viewer-webgl-canvas';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const rootGroup = new THREE.Group();
  const selectionGroup = new THREE.Group();
  scene.add(rootGroup, selectionGroup, new THREE.AmbientLight(0xffffff, 0.7));
  const light = new THREE.DirectionalLight(0xffffff, 0.85);
  light.position.set(3, 4, 5);
  scene.add(light);

  canvasHost.appendChild(renderer.domElement);
  const state = createState(canvasHost, scene, camera, renderer, rootGroup, selectionGroup);
  state.onResize = () => resizeStagePreview(state);
  window.addEventListener('resize', state.onResize);
  attachStagePreviewCameraControls(state);
  attachStagePreviewPicking(state, (ref) => state.selectionCallback?.(ref));
  resizeStagePreview(state);
  return state;
}

export function renderStagePreview(rendererState, model, renderPlan) {
  if (!rendererState || rendererState.disposed) return;
  disposeObjectTree(rendererState.rootGroup);
  disposeObjectTree(rendererState.selectionGroup);
  resetObjectIndex(rendererState);
  if (!model || renderPlan?.schema !== STAGE_RENDER_PLAN_SCHEMA) return draw(rendererState);

  const primitiveById = new Map((model.primitives || []).map((primitive) => [primitive.id, primitive]));
  const visibleBboxes = [];
  for (const entry of renderPlan.entries || []) addRenderEntry(rendererState, entry, primitiveById, visibleBboxes);
  rendererState.currentBbox = mergeBboxes(visibleBboxes) || modelBbox(model);
  rendererState.lastModel = model;
  rendererState.lastRenderPlan = renderPlan;
  updateStagePreviewSelection(rendererState, model);
  if (rendererState.forceFit || !rendererState.cameraControls?.initialized) fitStagePreviewCamera(rendererState, rendererState.currentBbox);
  rendererState.forceFit = false;
  draw(rendererState);
}

export function setStagePreviewSelectionCallback(rendererState, callback) {
  if (!rendererState || rendererState.disposed) return;
  rendererState.selectionCallback = callback;
}

export function updateStagePreviewSelection(rendererState, model = rendererState?.lastModel) {
  if (!rendererState || rendererState.disposed) return;
  disposeObjectTree(rendererState.selectionGroup);
  if (rendererState.lastRenderPlan?.source?.quality === 'hidden') return draw(rendererState);
  const box = createSelectionBox(selectedBbox(model, rendererState.selectedRef));
  if (box) rendererState.selectionGroup.add(box);
  draw(rendererState);
}

export function fitStagePreviewToModel(rendererState, model = rendererState?.lastModel) {
  fitStagePreviewCamera(rendererState, modelBbox(model));
}

export function fitStagePreviewToRenderPlan(rendererState, renderPlan = rendererState?.lastRenderPlan) {
  const bboxes = (renderPlan?.entries || []).filter((entry) => entry.output !== 'hidden').map((entry) => entry.bboxWorld).filter(Boolean);
  fitStagePreviewCamera(rendererState, mergeBboxes(bboxes) || rendererState?.currentBbox);
}

export function resetStagePreview(rendererState) {
  resetStagePreviewCamera(rendererState);
}

export function disposeStageThreePreviewRenderer(rendererState) {
  if (!rendererState || rendererState.disposed) return;
  detachStagePreviewPicking(rendererState);
  detachStagePreviewCameraControls(rendererState);
  window.removeEventListener('resize', rendererState.onResize);
  disposeObjectTree(rendererState.rootGroup);
  disposeObjectTree(rendererState.selectionGroup);
  rendererState.renderer.dispose();
  rendererState.renderer.domElement.remove();
  rendererState.disposed = true;
}

function createState(canvasHost, scene, camera, renderer, rootGroup, selectionGroup) {
  return {
    canvasHost, scene, camera, renderer, rootGroup, selectionGroup,
    selectedRef: null,
    selectionCallback: null,
    disposed: false,
    forceFit: true,
    currentBbox: null,
    lastModel: null,
    lastRenderPlan: null,
    objectIndex: createObjectIndex(),
  };
}

function addRenderEntry(state, entry, primitiveById, visibleBboxes) {
  if (entry.output === 'hidden') return;
  const object = createPreviewObject(entry, primitiveById.get(entry.primitiveId));
  if (!object) return;
  object.userData.renderEntryId = entry.id;
  object.userData.stageRenderEntryId = entry.id;
  object.userData.primitiveId = entry.primitiveId || '';
  object.userData.componentId = entry.componentId || '';
  object.userData.nodeId = entry.nodeId || '';
  state.rootGroup.add(object);
  addToIndex(state.objectIndex, entry, object);
  if (entry.bboxWorld) visibleBboxes.push(entry.bboxWorld);
}

function addToIndex(index, entry, object) {
  if (entry.primitiveId) index.primitiveId.set(entry.primitiveId, object);
  pushIndex(index.componentId, entry.componentId, object);
  pushIndex(index.nodeId, entry.nodeId, object);
}

function selectedBbox(model, ref) {
  if (!model || !ref) return null;
  if (ref.type === 'node') return model.hierarchy?.nodes?.find((item) => item.id === ref.id)?.bboxWorld;
  if (ref.type === 'component') return model.components?.find((item) => item.id === ref.id)?.bboxWorld;
  if (ref.type === 'primitive') return model.primitives?.find((item) => item.id === ref.id)?.transform?.bboxWorld;
  return modelBbox(model);
}

function modelBbox(model) {
  const bboxes = [...(model?.components || []), ...(model?.hierarchy?.nodes || [])].map((item) => item.bboxWorld).filter(Boolean);
  return mergeBboxes(bboxes);
}

function mergeBboxes(bboxes) {
  if (!bboxes?.length) return null;
  return bboxes.reduce((box, next) => [
    Math.min(box[0], next[0]), Math.min(box[1], next[1]), Math.min(box[2], next[2]),
    Math.max(box[3], next[3]), Math.max(box[4], next[4]), Math.max(box[5], next[5]),
  ]);
}

function resizeStagePreview(state) {
  const width = Math.max(state.canvasHost.clientWidth || 1, 1);
  const height = Math.max(state.canvasHost.clientHeight || 1, 1);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
  draw(state);
}

function draw(state) {
  state.renderer.render(state.scene, state.camera);
}

function createObjectIndex() {
  return { primitiveId: new Map(), componentId: new Map(), nodeId: new Map() };
}

function resetObjectIndex(state) {
  state.objectIndex = createObjectIndex();
}

function pushIndex(map, key, object) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(object);
}

export { SUPPORTED_RENDER_KINDS };
