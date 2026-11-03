import * as THREE from 'three';

export function computeBounds(object3D, precise = false) {
    return new THREE.Box3().setFromObject(object3D, precise);
}

export function fitPerspectiveToBox(camera, controls, box) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.sqrt(size.x*size.x + size.y*size.y + size.z*size.z);

    const radius = maxDim / 2;
    const fovRad = camera.fov * (Math.PI / 180);
    let distance = Math.abs(radius / Math.sin(fovRad / 2));
    if (camera.aspect < 1) distance /= camera.aspect;

    distance *= 1.5; // Padding

    camera.far = Math.max(10000000, distance * 10);
    camera.updateProjectionMatrix();

    // Default angle if currently at center
    const dir = camera.position.clone().sub(center).normalize();
    if (dir.length() < 0.1) dir.set(1, 1, 1).normalize();

    camera.position.copy(center).add(dir.multiplyScalar(distance));
    camera.lookAt(center);
    controls.target.copy(center);
    controls.maxDistance = distance * 10;
    controls.update();
    return distance;
}
