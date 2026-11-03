import { resolveChapterIxBasis } from './basis-resolver.js';
import { calculateChapterIxStraightPressure } from './straight-pipe.js';

function failure(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    details,
    canUseForDesignAuthority: false,
  };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validate(input) {
  if (!input.basisPackage || typeof input.basisPackage !== 'object') {
    return failure('MASTER_DATA_REQUIRED', 'basisPackage is required.');
  }
  for (const field of ['designPressureMpa', 'internalAllowanceMm', 'externalAllowanceMm']) {
    if (!finite(input[field])) return failure('INPUT_INVALID', `${field} must be a finite number.`, { field });
  }
  if (!(input.designPressureMpa > 0)) return failure('INPUT_INVALID', 'designPressureMpa must be > 0.');
  if (input.internalAllowanceMm < 0 || input.externalAllowanceMm < 0) {
    return failure('INPUT_INVALID', 'Allowances cannot be negative.');
  }
  return null;
}

export function calculateChapterIxStraightPressureFromBasis(input = {}) {
  const inputError = validate(input);
  if (inputError) return inputError;
  const basis = resolveChapterIxBasis(input.basisPackage);
  if (!basis.ok) {
    return failure(basis.code ?? 'MASTER_RECORD_NOT_QUALIFIED', basis.message ?? 'Basis resolution failed.', {
      stage: 'RESOLVE_BASIS',
      ...(basis.details ?? {}),
    });
  }
  const pressure = calculateChapterIxStraightPressure({
    outsideDiameterMm: basis.resolved.outsideDiameterMm,
    designPressureMpa: input.designPressureMpa,
    allowableStressMpa: basis.resolved.allowableStressMpa,
    internalAllowanceMm: input.internalAllowanceMm,
    externalAllowanceMm: input.externalAllowanceMm,
    minusTolerancePct: basis.resolved.minusTolerancePct,
    providedNominalThicknessMm: basis.resolved.nominalWallMm,
  });
  if (!pressure.ok) {
    return failure(pressure.code ?? 'CALCULATION_FAILED', pressure.message ?? 'Straight-pressure calculation failed.', {
      stage: 'STRAIGHT_PRESSURE',
      ...(pressure.details ?? {}),
    });
  }
  return {
    ok: true,
    resolverState: basis.resolverState,
    canUseForDesignAuthority: false,
    basis,
    pressure,
    referenceStatus: pressure.staticPass ? 'REFERENCE_PASS' : 'REFERENCE_FAIL',
  };
}
