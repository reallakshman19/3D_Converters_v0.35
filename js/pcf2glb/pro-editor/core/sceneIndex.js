import * as THREE from 'three';

export function normalizeMeta(obj) {
  const d = obj?.userData || {};
  return {
    id: d.pcfId || d.REF_NO || d.id || obj?.name || obj?.uuid,
    type: d.pcfType || d.type || d.class || 'UNKNOWN',
    refNo: d.refNo || '',
    bore: d.bore ?? null,
    rawMeta: d,
  };
}

export function buildSceneIndex(root) {
  const byId = new Map();
  const byUuid = new Map();
  const byType = new Map();
  const items = [];

  root.updateWorldMatrix(true, true);

  root.traverse((obj) => {
    if (!obj.visible) return;
    if (!obj.isMesh && !obj.isGroup) return;

    // Generic GLB support: Filter out non-semantic nodes (like raw geometries without userdata or semantic names)
    if (!obj.userData || Object.keys(obj.userData).length === 0) {
        if (!obj.name || obj.name.startsWith('Object_')) return;
    }

    const meta = normalizeMeta(obj);
    const bounds = new THREE.Box3().setFromObject(obj, false);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    const item = { object3D: obj, uuid: obj.uuid, ...meta, bounds, center, size };
    byId.set(item.id, item);
    byUuid.set(item.uuid, item);

    if (!byType.has(item.type)) byType.set(item.type, []);
    byType.get(item.type).push(item);

    items.push(item);
  });

  return { items, byId, byUuid, byType };
}
