import { calculateB313Thickness } from './b313-straight-pipe.js';
import { normalizeLengthValue } from './b313-units.js';
import { minimumAsManufacturedFromNominal } from './b313-tolerance.js';

function candidateThickness(candidate, defaultUnit) {
  const value = candidate?.wallThicknessMm
    ?? candidate?.wallThickness
    ?? candidate?.nominalThickness
    ?? candidate?.thickness;
  const unit = candidate?.wallThicknessMm !== undefined
    ? 'mm'
    : (candidate?.unit || candidate?.thicknessUnit || defaultUnit);
  return normalizeLengthValue(value, unit, 'candidateThickness');
}

export function selectB313NominalWall(input = {}) {
  const calculation = calculateB313Thickness(input);
  if (!calculation.ok) return calculation;

  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    return {
      ...calculation,
      ok: false,
      code: 'MISSING_NOMINAL_WALL_CANDIDATES',
      message: 'candidates must contain one or more nominal wall options',
    };
  }

  const evaluated = [];
  for (const [index, candidate] of input.candidates.entries()) {
    try {
      const nominalThicknessMm = candidateThickness(candidate, input.lengthUnit || 'mm');
      const minimumAsManufacturedThicknessMm = minimumAsManufacturedFromNominal(
        nominalThicknessMm,
        calculation.manufacturingTolerance,
      );
      const marginMm = minimumAsManufacturedThicknessMm - calculation.requiredMinimumThicknessMm;
      evaluated.push({
        index,
        candidate,
        nominalThicknessMm,
        minimumAsManufacturedThicknessMm,
        marginMm,
        pass: marginMm >= -1e-10,
      });
    } catch (error) {
      evaluated.push({ index, candidate, valid: false, error: error.message, pass: false });
    }
  }

  const valid = evaluated
    .filter((row) => Number.isFinite(row.nominalThicknessMm))
    .sort((left, right) => left.nominalThicknessMm - right.nominalThicknessMm || left.index - right.index);
  const selected = valid.find((row) => row.pass) || null;

  if (!selected) {
    return {
      ...calculation,
      ok: false,
      code: 'NO_ADEQUATE_NOMINAL_WALL',
      message: 'No supplied nominal-wall candidate satisfies the calculated minimum as-manufactured wall',
      evaluatedCandidates: valid,
    };
  }

  return {
    ...calculation,
    code: 'B313_NOMINAL_WALL_SELECTED',
    selected,
    evaluatedCandidates: valid,
  };
}
