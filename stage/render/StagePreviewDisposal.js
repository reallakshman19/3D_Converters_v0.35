export function disposeObjectTree(root) {
  if (!root) return;
  const children = [...root.children];
  for (const child of children) {
    root.remove(child);
    disposeNode(child);
  }
}

function disposeNode(node) {
  for (const child of [...node.children]) {
    node.remove(child);
    disposeNode(child);
  }
  if (node.geometry?.dispose) node.geometry.dispose();
  disposeMaterial(node.material);
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const item of material) disposeMaterial(item);
    return;
  }
  if (material?.map?.dispose) material.map.dispose();
  if (material?.dispose) material.dispose();
}
