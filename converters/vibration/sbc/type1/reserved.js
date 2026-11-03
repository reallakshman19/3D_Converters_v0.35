import { createReservedSbcTypeResult } from '../reserved-result.js';

export function calculateSbcType1Reserved(input = {}) {
  return createReservedSbcTypeResult('TYPE_1', input);
}
