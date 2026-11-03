/**
 * Computes element length from dx, dy, dz vector components using SRSS.
 * @param {number} dx 
 * @param {number} dy 
 * @param {number} dz 
 * @returns {number}
 */
export function computeElementLengthFromCiiVector(dx, dy, dz) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  const z = Number(dz) || 0;
  return Math.hypot(x, y, z);
}
