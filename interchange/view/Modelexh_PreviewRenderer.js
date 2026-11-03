/**
 * Modelexh_PreviewRenderer.js
 * Model Exchange namespaced geometry preview canvas.
 *
 * This renderer is isolated from the main 3D Viewer and only visualizes
 * canonical preview geometry produced by Model Exchange imports.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function _makeKey(point) {
  if (!point) return '';
  return `${Number(point.x).toFixed(4)}|${Number(point.y).toFixed(4)}|${Number(point.z).toFixed(4)}`;
}

function _collectSegmentPoints(project) {
  const nodeMap = new Map((project?.nodes || []).map((node) => [node.id, node]));
  const lines = [];
  for (const segment of project?.segments || []) {
    const from = nodeMap.get(segment.fromNodeId);
    const to = nodeMap.get(segment.toNodeId);
    if (!from || !to) continue;
    lines.push({ from: from.position, to: to.position, segment });
  }
  return lines;
}

export class ModelexhPreviewRenderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1522);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000000);
    this.camera.position.set(2500, 2500, 2500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this._group = new THREE.Group();
    this.scene.add(this._group);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const directional = new THREE.DirectionalLight(0xffffff, 0.85);
    directional.position.set(1200, 1800, 800);
    this.scene.add(ambient);
    this.scene.add(directional);

    this.scene.add(new THREE.AxesHelper(400));

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this._raf = 0;
    this._resizeObserver = new ResizeObserver(() => this.Modelexh_resize());
    this._resizeObserver.observe(this.container);
    this.Modelexh_resize();
    this._animate = this._animate.bind(this);
    this._animate();
  }

  Modelexh_resize() {
    const width = Math.max(1, this.container.clientWidth || 1);
    const height = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  Modelexh_clearGroup() {
    const children = [...this._group.children];
    for (const child of children) {
      this._group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
        else child.material.dispose();
      }
    }
  }

  Modelexh_renderProject(project, viewState = {}) {
    this.Modelexh_clearGroup();
    if (!project) return;

    const segmentLines = _collectSegmentPoints(project);
    const supportMode = String(viewState?.supportRenderMode || 'SYMBOL').toUpperCase();
    const segmentMaterial = new THREE.LineBasicMaterial({ color: 0x67c4ff });

    const positionBuffer = [];
    for (const line of segmentLines) {
      positionBuffer.push(line.from.x, line.from.y, line.from.z);
      positionBuffer.push(line.to.x, line.to.y, line.to.z);
    }

    if (positionBuffer.length >= 6) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionBuffer, 3));
      const lineSegments = new THREE.LineSegments(geometry, segmentMaterial);
      this._group.add(lineSegments);
    }

    const nodeSphere = new THREE.SphereGeometry(9, 8, 8);
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0x2fd16f, roughness: 0.35, metalness: 0.05 });
    for (const node of project.nodes || []) {
      const marker = new THREE.Mesh(nodeSphere, nodeMat);
      marker.position.set(node.position.x, node.position.y, node.position.z);
      this._group.add(marker);
    }

    const supportSphere = new THREE.SphereGeometry(14, 10, 10);
    const supportMat = new THREE.MeshStandardMaterial({ color: 0xff9e2a, roughness: 0.4, metalness: 0.1 });
    const supportMetaMat = new THREE.MeshStandardMaterial({ color: 0x9980ff, roughness: 0.5, metalness: 0.05 });

    for (const support of project.supports || []) {
      const coord = support?.normalized?.supportCoord;
      if (!coord) continue;
      const mesh = new THREE.Mesh(supportSphere, supportMode === 'METADATA_ONLY' ? supportMetaMat : supportMat);
      mesh.position.set(coord.x, coord.y, coord.z);
      if (supportMode === 'SIMPLIFIED_GEOMETRY') {
        mesh.scale.set(1.2, 0.6, 1.2);
      }
      this._group.add(mesh);
    }

    const annotationBox = new THREE.BoxGeometry(22, 22, 22);
    const annotationMat = new THREE.MeshStandardMaterial({ color: 0xc26dff, roughness: 0.5, metalness: 0.05 });
    for (const ann of project.annotations || []) {
      const anchor = ann?.normalized?.anchorPoint;
      if (!anchor) continue;
      const marker = new THREE.Mesh(annotationBox, annotationMat);
      marker.position.set(anchor.x, anchor.y, anchor.z);
      this._group.add(marker);
    }

    this.Modelexh_fit();
  }

  Modelexh_fit() {
    const box = new THREE.Box3().setFromObject(this._group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 1.9;

    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(0.1, distance / 5000);
    this.camera.far = Math.max(1000, distance * 50);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    try { this._resizeObserver?.disconnect(); } catch {}
    this.Modelexh_clearGroup();
    try { this.renderer?.dispose(); } catch {}
    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
