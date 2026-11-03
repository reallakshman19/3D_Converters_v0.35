import { windingNormalForPoints } from '../zone-geometry/circle-fit.js';

function centroidOf(points) {
  const sum = points.reduce((acc, point) => [
    acc[0] + point[0], acc[1] + point[1], acc[2] + point[2],
  ], [0, 0, 0]);
  return sum.map((value) => value / points.length);
}

function faceLocalPoints(topology, face) {
  return face.vertices.map((index) => topology.points[index]);
}

export function projectFaceFeatures(topology) {
  const features = new Map();
  for (const face of topology.faces) {
    const points = faceLocalPoints(topology, face);
    features.set(face.faceId, {
      faceId: face.faceId,
      vertices: face.vertices,
      normal: windingNormalForPoints(points),
      centroid: centroidOf(points),
    });
  }
  return features;
}
