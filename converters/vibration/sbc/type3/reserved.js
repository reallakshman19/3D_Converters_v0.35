import { createReservedSbcTypeResult } from '../reserved-result.js';

export function calculateSbcType3Reserved(input = {}) {
  return createReservedSbcTypeResult('TYPE_3', input);
}
