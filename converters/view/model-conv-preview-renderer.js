/**
 * 3DModelConv_PreviewRenderer.js
 * Dedicated 3D canvas renderer for the "3D Model Converters" tab.
 *
 * Functionality:
 * - Render canonical project geometry (segments, nodes, supports, annotations).
 * - Keep rendering isolated from Model Exchange and 3D Viewer tabs.
 * - Handle resize and scene cleanup safely between conversion runs.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function _3DModelConv_toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function _3DModelConv_makeVec3(point) {
  return new THREE.Vector3(
    _3DModelConv_toNumber(point?.x),
    _3DModelConv_toNumber(point?.y),
    _3DModelConv_toNumber(point?.z),
  );
}

function _3DModelConv_pointFromNode(node) {
  if (node?.position) return node.position;
  if (node?.normalized?.position) return node.normalized.position;
  return null;
}

function _3DModelConv_collectSegmentEndpoints(project) {
  const nodeMap = new Map();
  for (const node of project?.nodes || []) {
    if (!node?.id) continue;
    nodeMap.set(node.id, node);
  }

  const endpoints = [];
  for (const segment of project?.segments || []) {
    const ep1FromNormalized = segment?.normalized?.ep1 || null;
    const ep2FromNormalized = segment?.normalized?.ep2 || null;

    let ep1 = ep1FromNormalized;
    let ep2 = ep2FromNormalized;

    if (!ep1) {
      const fromNode = nodeMap.get(segment?.fromNodeId || segment?.startNodeId || segment?.nodeStartId);
      ep1 = _3DModelConv_pointFromNode(fromNode);
    }
    if (!ep2) {
      const toNode = nodeMap.get(segment?.toNodeId || segment?.endNodeId || segment?.nodeEndId);
      ep2 = _3DModelConv_pointFromNode(toNode);
    }

    if (!ep1 || !ep2) continue;
    endpoints.push({ ep1, ep2 });
  }
  return endpoints;
}

function _3DModelConv_collectPointPositions(project) {
  const positions = [];
  for (const point of project?.points || []) {
    positions.push(
      _3DModelConv_toNumber(point?.x),
      _3DModelConv_toNumber(point?.y),
      _3DModelConv_toNumber(point?.z),
    );
  }
  return positions;
}

function _3DModelConv_disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const item of material) {
      try { item?.dispose?.(); } catch {}
    }
    return;
  }
  try { material.dispose(); } catch {}
}

export class ModelConverters_3DModelConv_PreviewRenderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1522);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 10000000);
    this.camera.position.set(2600, 2200, 2600);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(1, 1);
    if ('outputColorSpace' in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this._3DModelConv_group = new THREE.Group();
    this.scene.add(this._3DModelConv_group);
    this._3DModelConv_stpGroup = new THREE.Group();
    this.scene.add(this._3DModelConv_stpGroup);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const directional = new THREE.DirectionalLight(0xffffff, 0.85);
    directional.position.set(1400, 1800, 800);
    this.scene.add(ambient);
    this.scene.add(directional);

    const grid = new THREE.GridHelper(8000, 80, 0x35557a, 0x1c2f45);
    grid.position.set(0, 0, 0);
    this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(450));

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this._3DModelConv_raf = 0;
    this._3DModelConv_resizeObserver = new ResizeObserver(() => this._3DModelConv_resize());
    this._3DModelConv_resizeObserver.observe(this.container);
    this._3DModelConv_resize();

    this._3DModelConv_animate = this._3DModelConv_animate.bind(this);
    this._3DModelConv_animate();
  }

  _3DModelConv_resize() {
    const width = Math.max(1, this.container.clientWidth || 1);
    const height = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  _3DModelConv_clear() {
    const children = [...this._3DModelConv_group.children];
    for (const child of children) {
      this._3DModelConv_group.remove(child);
      try { child.geometry?.dispose?.(); } catch {}
      _3DModelConv_disposeMaterial(child.material);
    }
  }

  _3DModelConv_clearStp() {
    const children = [...this._3DModelConv_stpGroup.children];
    for (const child of children) {
      this._3DModelConv_stpGroup.remove(child);
      try { child.geometry?.dispose?.(); } catch {}
      _3DModelConv_disposeMaterial(child.material);
    }
  }

  _3DModelConv_overlayStp(members) {
    this._3DModelConv_clearStp();
    if (!members || !members.length) return;
    const positions = [];
    for (const member of members) {
      positions.push(
        _3DModelConv_toNumber(member.start?.x), _3DModelConv_toNumber(member.start?.y), _3DModelConv_toNumber(member.start?.z),
        _3DModelConv_toNumber(member.end?.x), _3DModelConv_toNumber(member.end?.y), _3DModelConv_toNumber(member.end?.z),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x60c864 });
    this._3DModelConv_stpGroup.add(new THREE.LineSegments(geometry, material));
  }

  _3DModelConv_renderProject(project) {
    this._3DModelConv_clear();
    this._3DModelConv_clearStp();
    if (!project) return;

    const endpoints = _3DModelConv_collectSegmentEndpoints(project);
    if (endpoints.length > 0) {
      const segmentMaterial = new THREE.LineBasicMaterial({ color: 0x67c4ff });
      const positions = [];
      for (const pair of endpoints) {
        positions.push(_3DModelConv_toNumber(pair.ep1.x), _3DModelConv_toNumber(pair.ep1.y), _3DModelConv_toNumber(pair.ep1.z));
        positions.push(_3DModelConv_toNumber(pair.ep2.x), _3DModelConv_toNumber(pair.ep2.y), _3DModelConv_toNumber(pair.ep2.z));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this._3DModelConv_group.add(new THREE.LineSegments(geometry, segmentMaterial));
    }

    const pointPositions = _3DModelConv_collectPointPositions(project);
    if (pointPositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
      const material = new THREE.PointsMaterial({
        color: 0x67c4ff,
        size: 3,
        sizeAttenuation: false,
      });
      this._3DModelConv_group.add(new THREE.Points(geometry, material));
    }

    const nodeGeometry = new THREE.SphereGeometry(8, 8, 8);
    const nodeMaterial = new THREE.MeshStandardMaterial({ color: 0x42d27a, roughness: 0.35, metalness: 0.05 });
    for (const node of project?.nodes || []) {
      const point = _3DModelConv_pointFromNode(node);
      if (!point) continue;
      const marker = new THREE.Mesh(nodeGeometry, nodeMaterial);
      marker.position.copy(_3DModelConv_makeVec3(point));
      this._3DModelConv_group.add(marker);
    }

    const supportGeometry = new THREE.SphereGeometry(12, 10, 10);
    const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x60c864, roughness: 0.42, metalness: 0.08 });
    for (const support of project?.supports || []) {
      const point = support?.normalized?.supportCoord;
      if (!point) continue;
      const marker = new THREE.Mesh(supportGeometry, supportMaterial);
      marker.position.copy(_3DModelConv_makeVec3(point));
      this._3DModelConv_group.add(marker);
    }

    const annotationGeometry = new THREE.BoxGeometry(16, 16, 16);
    const annotationMaterial = new THREE.MeshStandardMaterial({ color: 0xc685ff, roughness: 0.5, metalness: 0.05 });
    for (const annotation of project?.annotations || []) {
      const point = annotation?.normalized?.anchorPoint;
      if (!point) continue;
      const marker = new THREE.Mesh(annotationGeometry, annotationMaterial);
      marker.position.copy(_3DModelConv_makeVec3(point));
      this._3DModelConv_group.add(marker);
    }

    this._3DModelConv_fit();
  }

  _3DModelConv_fit() {
    const box = new THREE.Box3().setFromObject(this._3DModelConv_group);
    const stpBox = new THREE.Box3().setFromObject(this._3DModelConv_stpGroup);
    if (!stpBox.isEmpty()) box.union(stpBox);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 1.95;

    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance));
    this.camera.near = Math.max(0.1, distance / 5000);
    this.camera.far = Math.max(1000, distance * 60);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  _3DModelConv_renderStpMembers(members) {
    this._3DModelConv_clear();
    this._3DModelConv_clearStp();
    if (!members || !members.length) return;
    const positions = [];
    for (const member of members) {
      positions.push(
        _3DModelConv_toNumber(member.start?.x), _3DModelConv_toNumber(member.start?.y), _3DModelConv_toNumber(member.start?.z),
        _3DModelConv_toNumber(member.end?.x), _3DModelConv_toNumber(member.end?.y), _3DModelConv_toNumber(member.end?.z),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x60c864 });
    this._3DModelConv_group.add(new THREE.LineSegments(geometry, material));
    this._3DModelConv_fit();
  }

  _3DModelConv_animate() {
    this._3DModelConv_raf = requestAnimationFrame(this._3DModelConv_animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _3DModelConv_destroy() {
    if (this._3DModelConv_raf) cancelAnimationFrame(this._3DModelConv_raf);
    this._3DModelConv_raf = 0;
    try { this._3DModelConv_resizeObserver?.disconnect(); } catch {}
    this._3DModelConv_clear();
    this._3DModelConv_clearStp();
    try { this.renderer?.dispose?.(); } catch {}
    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
