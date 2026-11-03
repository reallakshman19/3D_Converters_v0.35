export function disposeScene(root) {
  if (!root) return;

  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();

    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        for (const key in mat) {
          const value = mat[key];
          if (value && typeof value === 'object' && typeof value.dispose === 'function') {
            value.dispose();
          }
        }
        mat.dispose?.();
      });
    }
  });
}
