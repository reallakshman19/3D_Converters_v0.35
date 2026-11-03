/**
 * Deterministic finite-segment geometry helpers for component topology.
 * Inputs and outputs are millimetre XYZ values. No coordinate is rounded or
 * fabricated; the returned parameter is clamped to the finite segment.
 */

import { pointDistance } from './topology-values.js';

/** @param {{x:number,y:number,z:number}} point @param {{x:number,y:number,z:number}} start @param {{x:number,y:number,z:number}} end @returns {{distanceMm:number,parameter:number,projected:{x:number,y:number,z:number}}} */
export function pointSegmentDistance(point, start, end) {
  const vector = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const offset = { x: point.x - start.x, y: point.y - start.y, z: point.z - start.z };
  const lengthSquared = vector.x ** 2 + vector.y ** 2 + vector.z ** 2;
  const raw = lengthSquared
    ? (offset.x * vector.x + offset.y * vector.y + offset.z * vector.z) / lengthSquared : 0;
  const parameter = Math.max(0, Math.min(1, raw));
  const projected = {
    x: start.x + parameter * vector.x,
    y: start.y + parameter * vector.y,
    z: start.z + parameter * vector.z,
  };
  return { distanceMm: pointDistance(point, projected), parameter, projected };
}
