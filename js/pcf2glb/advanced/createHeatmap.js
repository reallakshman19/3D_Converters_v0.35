import * as THREE from 'three';

export function createBlueRedColor(t) {
  const c = new THREE.Color();
  c.setHSL((1 - t) * 0.66, 1.0, 0.5); // blue -> red
  return c;
}

export function createHeatmap(scene) {
  const restoreMaterials = () => {
     scene.traverse((obj) => {
         if (obj.isMesh && obj.material) {
             const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
             mats.forEach((mat) => {
                 if (mat.userData && mat.userData.__baseColor) {
                     mat.color.copy(mat.userData.__baseColor);
                 }
                 if (mat.userData && mat.userData.__baseEmissive) {
                     mat.emissive.copy(mat.userData.__baseEmissive);
                 }
             });
         }
     });
  };

  return {
    clearMetric: () => restoreMaterials(),
    applyMetric: (rootItems, metric, selectedId = null) => {
        // Mock method for future metric arrays integration
        return null;
    }
  };
}
