import * as importedThree from 'three';

let THREE = importedThree;
if (typeof window !== 'undefined' && window.THREE) {
  THREE = window.THREE;
}

export function computeBoundingMeasurement(object) {
  const box = new THREE.Box3();
  box.setFromObject(object);
  if (isFinite(box.min.x) && isFinite(box.max.x)) {
    const size = new THREE.Vector3();
    box.getSize(size);
    return {
      min: box.min.clone(),
      max: box.max.clone(),
      width: size.x,
      height: size.y,
      depth: size.z,
      diagonal: size.length(),
    };
  }
  return {
    min: new THREE.Vector3(0, 0, 0),
    max: new THREE.Vector3(0, 0, 0),
    width: 0,
    height: 0,
    depth: 0,
    diagonal: 0,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeBoundingMeasurement };
}
