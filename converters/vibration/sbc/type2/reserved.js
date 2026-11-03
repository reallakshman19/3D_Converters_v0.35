import { createReservedSbcTypeResult } from '../reserved-result.js';

export function calculateSbcType2Reserved(input = {}) {
  return createReservedSbcTypeResult('TYPE_2', input);
}
