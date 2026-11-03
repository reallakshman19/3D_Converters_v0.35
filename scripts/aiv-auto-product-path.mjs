import {
  AIV_CALCULATOR_SCHEMA,
  AIV_CALCULATOR_STAGE_ORDER,
  calculateAiv,
} from '../converters/vibration/aiv/aiv-calculator.js';

export const AIV_AUTO_PRODUCT_PATH_SCHEMA = AIV_CALCULATOR_SCHEMA;
export const AIV_AUTO_PRODUCT_STAGE_ORDER = AIV_CALCULATOR_STAGE_ORDER;

export function runAivAutoProductPath(input = {}) {
  return calculateAiv({
    ...input,
    qualificationMode: input.qualificationMode ?? 'benchmark',
  });
}
