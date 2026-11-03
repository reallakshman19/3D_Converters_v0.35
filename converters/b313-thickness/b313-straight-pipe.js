import { pressureToMPa, stressToMPa, lengthToMm, normalizeLengthValue } from './b313-units.js';
import {
  normalizeNegativeMillTolerance,
  requiredNominalFromMinimum,
  minimumAsManufacturedFromNominal,
  toleranceDeductionAtNominal,
} from './b313-tolerance.js';
import {
  B313_STANDARD,
  B313_EDITION,
  B313_PARAGRAPH,
  B313_EQUATION,
  preflightScope,
  postflightApplicability,
} from './b313-applicability.js';

const STANDARD_STATUS_CHECKED = '2026-08-10';
const ASME_PUBLIC_STANDARD_URL = 'https://www.asme.org/codes-standards/find-codes-standards/b31-3-process-piping';

function failure(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    standard: B313_STANDARD,
    edition: B313_EDITION,
    details,
  };
}

function finiteFactor(value, field, { min = 0, max = 1, minInclusive = false } = {}) {
  const number = Number(value);
  const minOk = minInclusive ? number >= min : number > min;
  if (!Number.isFinite(number) || !minOk || number > max) {
    throw new RangeError(`${field} must be ${minInclusive ? '>=' : '>'} ${min} and <= ${max}`);
  }
  return number;
}

function allowanceMm(input, field, defaultUnit) {
  const value = input[field] ?? 0;
  return normalizeLengthValue(value, input.allowanceUnit || defaultUnit, field, { allowZero: true });
}

function normalizeInputs(input = {}) {
  const lengthUnit = input.lengthUnit || 'mm';
  const pressureUnit = input.pressureUnit || 'MPa';
  const stressUnit = input.stressUnit || pressureUnit;

  const pressureMPa = pressureToMPa(input.designPressure, pressureUnit, 'designPressure');
  const outsideDiameterMm = lengthToMm(input.outsideDiameter, lengthUnit, 'outsideDiameter');
  const allowableStressMPa = stressToMPa(input.allowableStress, stressUnit, 'allowableStress');
  const qualityFactorE = finiteFactor(input.qualityFactorE, 'qualityFactorE');
  const weldStrengthReductionW = finiteFactor(input.weldStrengthReductionW, 'weldStrengthReductionW');
  const coefficientY = finiteFactor(input.coefficientY, 'coefficientY', { min: 0, max: 1, minInclusive: true });

  const allowances = {
    corrosionAllowanceMm: allowanceMm(input, 'corrosionAllowance', lengthUnit),
    mechanicalAllowanceMm: allowanceMm(input, 'mechanicalAllowance', lengthUnit),
    erosionAllowanceMm: allowanceMm(input, 'erosionAllowance', lengthUnit),
    otherAllowanceMm: allowanceMm(input, 'otherAllowance', lengthUnit),
  };
  allowances.totalAllowanceMm = Object.values(allowances).reduce((sum, value) => sum + value, 0);

  const manufacturingTolerance = normalizeNegativeMillTolerance(input.negativeMillTolerance);

  return {
    pressureMPa,
    outsideDiameterMm,
    allowableStressMPa,
    qualityFactorE,
    weldStrengthReductionW,
    coefficientY,
    allowances,
    manufacturingTolerance,
  };
}

export function calculateB313Thickness(input = {}) {
  const scope = preflightScope(input);
  if (!scope.ok) return scope;

  let normalized;
  try {
    normalized = normalizeInputs(input);
  } catch (error) {
    return failure(error.code || 'INVALID_B313_INPUT', error.message);
  }

  const {
    pressureMPa: P,
    outsideDiameterMm: D,
    allowableStressMPa: S,
    qualityFactorE: E,
    weldStrengthReductionW: W,
    coefficientY: Y,
    allowances,
    manufacturingTolerance,
  } = normalized;

  const numerator = P * D;
  const denominator = 2 * ((S * E * W) + (P * Y));
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return failure('INVALID_B313_DENOMINATOR', 'B31.3 pressure-design denominator must be positive', {
      numerator,
      denominator,
    });
  }

  const pressureDesignThicknessMm = numerator / denominator;
  const applicability = postflightApplicability({
    pressureMPa: P,
    allowableStressMPa: S,
    qualityFactorE: E,
    pressureDesignThicknessMm,
    outsideDiameterMm: D,
  });

  if (!applicability.valid) {
    return failure('UNSUPPORTED_B313_EQUATION_SCOPE', 'Inputs fall outside the implemented straight-pipe equation applicability envelope', {
      applicability,
      pressureDesignThicknessMm,
      outsideDiameterMm: D,
    });
  }

  const requiredMinimumThicknessMm = pressureDesignThicknessMm + allowances.totalAllowanceMm;
  const requiredNominalThicknessMm = requiredNominalFromMinimum(
    requiredMinimumThicknessMm,
    manufacturingTolerance,
  );
  const toleranceDeductionMm = toleranceDeductionAtNominal(requiredNominalThicknessMm, manufacturingTolerance);
  const minimumAsManufacturedAtRequiredNominalMm = minimumAsManufacturedFromNominal(
    requiredNominalThicknessMm,
    manufacturingTolerance,
  );

  return {
    ok: true,
    code: 'B313_THICKNESS_CALCULATED',
    standard: B313_STANDARD,
    edition: scope.edition,
    paragraph: B313_PARAGRAPH,
    equation: B313_EQUATION,
    pressureDesignThicknessMm,
    tMm: pressureDesignThicknessMm,
    totalAllowanceMm: allowances.totalAllowanceMm,
    requiredMinimumThicknessMm,
    tmMm: requiredMinimumThicknessMm,
    requiredNominalThicknessMm,
    toleranceDeductionAtRequiredNominalMm: toleranceDeductionMm,
    minimumAsManufacturedAtRequiredNominalMm,
    manufacturingTolerance,
    allowances,
    applicability,
    inputs: {
      pressureMPa: P,
      outsideDiameterMm: D,
      allowableStressMPa: S,
      qualityFactorE: E,
      weldStrengthReductionW: W,
      coefficientY: Y,
    },
    equationTrace: {
      numerator,
      denominator,
      expression: 'P*D / (2*(S*E*W + P*Y))',
    },
    provenance: {
      standard: B313_STANDARD,
      edition: scope.edition,
      paragraph: B313_PARAGRAPH,
      equation: B313_EQUATION,
      factorAuthority: 'CALLER_SUPPLIED',
      standardStatusChecked: STANDARD_STATUS_CHECKED,
      publicStandardPage: ASME_PUBLIC_STANDARD_URL,
      qualification: 'SOFTWARE_IMPLEMENTED_CODE_TEXT_ENGINEERING_REVIEW_REQUIRED',
    },
  };
}

export function evaluateB313ProvidedWall(input = {}) {
  const calculation = calculateB313Thickness(input);
  if (!calculation.ok) return calculation;

  let providedNominalThicknessMm;
  try {
    const value = input.providedNominalThickness ?? input.providedWallThickness;
    providedNominalThicknessMm = normalizeLengthValue(
      value,
      input.providedThicknessUnit || input.lengthUnit || 'mm',
      'providedNominalThickness',
    );
  } catch (error) {
    return failure('INVALID_PROVIDED_WALL', error.message);
  }

  const minimumAsManufacturedThicknessMm = minimumAsManufacturedFromNominal(
    providedNominalThicknessMm,
    calculation.manufacturingTolerance,
  );
  const marginMm = minimumAsManufacturedThicknessMm - calculation.requiredMinimumThicknessMm;
  const nominalMarginMm = providedNominalThicknessMm - calculation.requiredNominalThicknessMm;
  const epsilon = 1e-10;
  const status = marginMm >= -epsilon ? 'PASS' : 'FAIL';

  return {
    ...calculation,
    code: 'B313_PROVIDED_WALL_EVALUATED',
    providedNominalThicknessMm,
    minimumAsManufacturedThicknessMm,
    marginMm,
    nominalMarginMm,
    utilization: minimumAsManufacturedThicknessMm > 0
      ? calculation.requiredMinimumThicknessMm / minimumAsManufacturedThicknessMm
      : Infinity,
    nominalUtilization: calculation.requiredNominalThicknessMm / providedNominalThicknessMm,
    status,
    pass: status === 'PASS',
  };
}
