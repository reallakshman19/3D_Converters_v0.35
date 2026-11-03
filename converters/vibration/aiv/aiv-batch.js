import { calculateAiv } from './aiv-calculator.js';

export const AIV_BATCH_SCHEMA = 'AivBatchResult.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function calculateAivBatch(requests = []) {
  if (!Array.isArray(requests)) throw new TypeError('AIV batch requests must be an array.');
  const results = requests.map((request) => calculateAiv(request));
  return deepFreeze({
    schema: AIV_BATCH_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    total: requests.length,
    succeeded: results.length,
    failed: 0,
    results,
    sameKernel: true,
    designAuthority: false,
  });
}
