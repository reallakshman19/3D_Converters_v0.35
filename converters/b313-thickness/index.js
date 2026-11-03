export {
  calculateB313Thickness,
  evaluateB313ProvidedWall,
} from './b313-straight-pipe.js';
export { selectB313NominalWall } from './b313-wall-selection.js';
export { calculateB313PressureStressRatios } from './b313-ratios.js';
export {
  normalizeNegativeMillTolerance,
  requiredNominalFromMinimum,
  minimumAsManufacturedFromNominal,
} from './b313-tolerance.js';
export {
  B313_STANDARD,
  B313_EDITION,
  B313_PARAGRAPH,
  B313_EQUATION,
} from './b313-applicability.js';

import {
  calculateB313Thickness,
  evaluateB313ProvidedWall,
} from './b313-straight-pipe.js';
import { selectB313NominalWall } from './b313-wall-selection.js';
import { calculateB313PressureStressRatios } from './b313-ratios.js';

export function createB313ThicknessCalculator(defaults = {}) {
  const withDefaults = (input = {}) => ({ ...defaults, ...input });
  return Object.freeze({
    calculate: (input) => calculateB313Thickness(withDefaults(input)),
    calculatePressureStressRatios: (input) => calculateB313PressureStressRatios(withDefaults(input)),
    evaluateProvidedWall: (input) => evaluateB313ProvidedWall(withDefaults(input)),
    selectNominalWall: (input) => selectB313NominalWall(withDefaults(input)),
  });
}
