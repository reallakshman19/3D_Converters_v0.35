import * as THREE from 'three';

export const NODE_MARKER_GLYPH_SCHEMA = 'non-primitive-node-marker-glyph/v1';
export const NODE_MARKER_ROOT_NAME = '__RVM_NON_PRIMITIVE_NODE_MARKERS__';

export function clearNodeMarkerGlyphRoot(viewer, reason = 'clear-node-marker-glyphs') {
  const roots = collectNodeMarkerRoots(viewer);
  for (const root of roots) {
    root.parent?.remove?.(root);
    disposeTree(root);
  }
  if (viewer) viewer.nonPrimitiveNodeMarkerGlyphDiagnostics = { schema: NODE_MARKER_GLYPH_SCHEMA, status: 'cleared', reason, removedRoots: roots.length };
  return { schema: NODE_MARKER_GLYPH_SCHEMA, status: 'cleared', reason, removedRoots: roots.length };
}

export function attachNodeMarkerGlyphs(viewer, markers = [], options = {}) {
  clearNodeMarkerGlyphRoot(viewer, 'replace-node-marker-glyphs');
  const parent = viewer?.scene || viewer?.modelGroup;
  if (!parent?.add) return writeGlyphDiagnostics(viewer, { status: 'skipped', reason: 'missing-scene-parent', glyphCount: 0 });
  const root = new THREE.Group();
  root.name = NODE_MARKER_ROOT_NAME;
  root.userData = {
    schema: NODE_MARKER_GLYPH_SCHEMA,
    rvmNodeMarkerRoot: true,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    rvmSelectionUsed: false,
    excludeFromRvmSearch: true,
    sourceKind: options.sourceKind || '',
    sourceFile: options.sourceFile || '',
  };
  for (const marker of markers) {
    const glyph = createNodeMarkerGlyph(marker, options);
    if (glyph) root.add(glyph);
  }
  parent.add(root);
  return writeGlyphDiagnostics(viewer, { status: 'attached', rootName: NODE_MARKER_ROOT_NAME, glyphCount: root.children.length, primitiveExcluded: true, rvmSearchIndexed: false, rvmSelectionUsed: false });
}

export function createNodeMarkerGlyph(marker = {}, options = {}) {
  const position = marker.position || {};
  const x = Number(position.x);
  const y = Number(position.y);
  const z = Number(position.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  const radius = Number(options.radius || options.glyphRadius || 35) || 35;
  const geometry = createMarkerGeometry(radius);
  const material = new THREE.MeshBasicMaterial({ color: marker.status === 'stale' ? 0xff9b44 : 0x50d6ff, transparent: true, opacity: 0.92, depthTest: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `NODE_MARKER_${marker.nodeNumber || marker.markerId || 'UNKNOWN'}`;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 9000;
  mesh.userData = {
    schema: NODE_MARKER_GLYPH_SCHEMA,
    rvmNodeMarker: true,
    markerSelectable: true,
    pickable: false,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    rvmSelectionUsed: false,
    excludeFromRvmSearch: true,
    sourcePath: marker.sourcePath || '',
    nodeMarkerId: marker.markerId || '',
    nodeNumber: marker.nodeNumber ?? '',
    branchName: marker.branchName || '',
    markerKind: marker.markerKind || '',
    rvmNodeMarkerDetails: marker,
  };
  return mesh;
}

export function collectNodeMarkerRoots(viewer) {
  const roots = [];
  const scan = (parent) => parent?.traverse?.((object) => {
    if (object?.name === NODE_MARKER_ROOT_NAME || object?.userData?.rvmNodeMarkerRoot) roots.push(object);
  });
  scan(viewer?.scene);
  scan(viewer?.modelGroup);
  return [...new Set(roots)];
}

function createMarkerGeometry(radius) {
  if (typeof THREE.OctahedronGeometry === 'function') return new THREE.OctahedronGeometry(radius, 0);
  if (typeof THREE.SphereGeometry === 'function') return new THREE.SphereGeometry(radius, 8, 6);
  return new THREE.BoxGeometry(radius, radius, radius);
}

function writeGlyphDiagnostics(viewer, state = {}) {
  if (viewer) viewer.nonPrimitiveNodeMarkerGlyphDiagnostics = { schema: NODE_MARKER_GLYPH_SCHEMA, ...state };
  return viewer?.nonPrimitiveNodeMarkerGlyphDiagnostics || { schema: NODE_MARKER_GLYPH_SCHEMA, ...state };
}

function disposeTree(root) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
    else material?.dispose?.();
  });
}
