import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBounds } from './fitBounds.js';

export function createCameraController(camera, domElement) {
  const perspectiveCamera = camera;
  const initialAspect = Math.max(1, domElement.clientWidth / Math.max(1, domElement.clientHeight));

  perspectiveCamera.aspect = initialAspect;
  perspectiveCamera.fov = perspectiveCamera.fov || 60;
  perspectiveCamera.near = perspectiveCamera.near || 0.1;
  perspectiveCamera.far = perspectiveCamera.far || 10000000;
  perspectiveCamera.updateProjectionMatrix();

  const orthoCamera = new THREE.OrthographicCamera(
    -100 * initialAspect,
     100 * initialAspect,
     100,
    -100,
    perspectiveCamera.near,
    perspectiveCamera.far
  );
  orthoCamera.position.copy(perspectiveCamera.position);
  orthoCamera.quaternion.copy(perspectiveCamera.quaternion);
  orthoCamera.up.copy(perspectiveCamera.up);
  orthoCamera.updateProjectionMatrix();

  const controls = new OrbitControls(perspectiveCamera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.25;
  controls.maxDistance = 1000000;
  controls.minPolarAngle = 0.03;
  controls.maxPolarAngle = Math.PI - 0.03;

  let activeCamera = perspectiveCamera;
  let projectionMode = 'PERSPECTIVE';
  let currentCenter = new THREE.Vector3(0, 0, 0);
  let currentDistance = 100;
  let currentPreset = 'ISO';
  let smoothTime = 0.35;

  const homePosition = new THREE.Vector3(100, 100, 100);
  const homeTarget = new THREE.Vector3(0, 0, 0);
  let homeMode = 'PERSPECTIVE';

  return {
    controls,

    update() {
      controls.update();
    },

    fitScene(sceneRoot) {
      if (!sceneRoot || sceneRoot.children.length === 0) return;
      const box = computeBounds(sceneRoot, false);
      if (box.isEmpty()) return;
      fitBox(box);
    },

    fitObject(object3D) {
      if (!object3D) return;
      const box = computeBounds(object3D, true);
      if (box.isEmpty()) return;
      fitBox(box);
    },

    resetTarget() {
      controls.target.copy(currentCenter);
      controls.update();
    },

    resetHome() {
      setProjection(homeMode);
      activeCamera.position.copy(homePosition);
      controls.target.copy(homeTarget);
      activeCamera.lookAt(homeTarget);
      syncInactiveCamera();
      controls.update();
    },

    setPresetView(name) {
      currentPreset = String(name || 'ISO').toUpperCase();
      const center = currentCenter.clone();
      const distance = Math.max(1, currentDistance);

      let dir = new THREE.Vector3(1, 1, 1);
      let up = new THREE.Vector3(0, 1, 0);

      switch (currentPreset) {
        case 'TOP':
          dir.set(0, 1, 0);
          up.set(0, 0, -1);
          break;
        case 'BOTTOM':
          dir.set(0, -1, 0);
          up.set(0, 0, 1);
          break;
        case 'FRONT':
          dir.set(0, 0, 1);
          up.set(0, 1, 0);
          break;
        case 'BACK':
          dir.set(0, 0, -1);
          up.set(0, 1, 0);
          break;
        case 'LEFT':
          dir.set(-1, 0, 0);
          up.set(0, 1, 0);
          break;
        case 'RIGHT':
          dir.set(1, 0, 0);
          up.set(0, 1, 0);
          break;
        case 'ISO':
        default:
          dir.set(1, 1, 1).normalize();
          up.set(0, 1, 0);
      }

      controls.target.copy(center);
      activeCamera.position.copy(center).add(dir.normalize().multiplyScalar(distance));
      activeCamera.up.copy(up);
      activeCamera.lookAt(center);
      syncInactiveCamera();
      controls.update();
    },

    getPresetView() {
      return currentPreset;
    },

    setProjection(mode) {
      setProjection(mode);
    },

    toggleProjection() {
      setProjection(projectionMode === 'PERSPECTIVE' ? 'ORTHOGRAPHIC' : 'PERSPECTIVE');
    },

    getProjectionMode() {
      return projectionMode;
    },

    getActiveCamera() {
      return activeCamera;
    },

    setPerspectiveFov(value) {
      const next = Math.max(20, Math.min(120, Number(value) || perspectiveCamera.fov));
      perspectiveCamera.fov = next;
      perspectiveCamera.updateProjectionMatrix();
      updateOrthoFrustum(activeCamera.position.distanceTo(controls.target) || currentDistance);
    },

    getPerspectiveFov() {
      return perspectiveCamera.fov;
    },

    setSmoothTime(value) {
      smoothTime = Math.max(0, Math.min(2, Number(value) || 0));
      if (smoothTime === 0) {
        controls.enableDamping = false;
        controls.dampingFactor = 1;
      } else {
        controls.enableDamping = true;
        controls.dampingFactor = Math.max(0.01, Math.min(0.25, 1 / (1 + smoothTime * 25)));
      }
    },

    getSmoothTime() {
      return smoothTime;
    },

    onResize(width, height) {
      const safeW = Math.max(1, width || domElement.clientWidth || 1);
      const safeH = Math.max(1, height || domElement.clientHeight || 1);
      perspectiveCamera.aspect = safeW / safeH;
      perspectiveCamera.updateProjectionMatrix();
      updateOrthoFrustum(activeCamera.position.distanceTo(controls.target) || currentDistance);
    },

    dispose() {
      controls.dispose();
    }
  };

  function fitBox(box) {
    currentCenter = box.getCenter(new THREE.Vector3());

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fovRad = THREE.MathUtils.degToRad(perspectiveCamera.fov);
    currentDistance = ((maxDim * 0.5) / Math.tan(fovRad * 0.5)) * 1.35;
    currentDistance = Math.max(1, currentDistance);

    const dir = activeCamera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
    dir.normalize();

    controls.target.copy(currentCenter);
    activeCamera.position.copy(currentCenter).add(dir.multiplyScalar(currentDistance));

    const near = Math.max(0.1, currentDistance / 1000);
    const far = Math.max(1000, currentDistance * 20 + maxDim * 10);
    perspectiveCamera.near = near;
    perspectiveCamera.far = far;
    perspectiveCamera.updateProjectionMatrix();

    orthoCamera.near = near;
    orthoCamera.far = far;
    updateOrthoFrustum(currentDistance);

    homePosition.copy(activeCamera.position);
    homeTarget.copy(controls.target);
    homeMode = projectionMode;

    syncInactiveCamera();
    controls.update();
  }

  function setProjection(mode) {
    const next = String(mode || 'PERSPECTIVE').toUpperCase();
    if (next === projectionMode) return;

    if (next === 'ORTHOGRAPHIC') {
      orthoCamera.position.copy(activeCamera.position);
      orthoCamera.quaternion.copy(activeCamera.quaternion);
      orthoCamera.up.copy(activeCamera.up);
      updateOrthoFrustum(activeCamera.position.distanceTo(controls.target) || currentDistance);

      activeCamera = orthoCamera;
      controls.object = orthoCamera;
      projectionMode = 'ORTHOGRAPHIC';
    } else {
      perspectiveCamera.position.copy(activeCamera.position);
      perspectiveCamera.quaternion.copy(activeCamera.quaternion);
      perspectiveCamera.up.copy(activeCamera.up);
      perspectiveCamera.updateProjectionMatrix();

      activeCamera = perspectiveCamera;
      controls.object = perspectiveCamera;
      projectionMode = 'PERSPECTIVE';
    }

    controls.update();
  }

  function updateOrthoFrustum(distance) {
    const width = Math.max(1, domElement.clientWidth || 1);
    const height = Math.max(1, domElement.clientHeight || 1);
    const aspect = width / height;
    const fovRad = THREE.MathUtils.degToRad(perspectiveCamera.fov);
    const halfHeight = Math.max(1, distance * Math.tan(fovRad * 0.5));

    orthoCamera.left = -halfHeight * aspect;
    orthoCamera.right = halfHeight * aspect;
    orthoCamera.top = halfHeight;
    orthoCamera.bottom = -halfHeight;
    orthoCamera.updateProjectionMatrix();
  }

  function syncInactiveCamera() {
    if (activeCamera !== perspectiveCamera) {
      perspectiveCamera.position.copy(activeCamera.position);
      perspectiveCamera.quaternion.copy(activeCamera.quaternion);
      perspectiveCamera.up.copy(activeCamera.up);
      perspectiveCamera.updateProjectionMatrix();
    }
    if (activeCamera !== orthoCamera) {
      orthoCamera.position.copy(activeCamera.position);
      orthoCamera.quaternion.copy(activeCamera.quaternion);
      orthoCamera.up.copy(activeCamera.up);
      updateOrthoFrustum(activeCamera.position.distanceTo(controls.target) || currentDistance);
    }
  }
}
