function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function calculateChapterIxEquivalentAlternatingStress(input = {}) {
  const alternating = input.alternatingStressIntensityMpa;
  if (!finite(alternating) || alternating < 0) {
    return failure('INPUT_INVALID', 'alternatingStressIntensityMpa must be finite and >= 0.');
  }
  const route = String(input.seqRoute ?? '').trim();
  if (route === 'DIRECT_SALT_EQUAL_SEQ') {
    return {
      ok: true,
      canUseForDesignAuthority: false,
      route,
      alternatingStressIntensityMpa: alternating,
      equivalentAlternatingStressMpa: alternating,
      routeState: 'SYNTHETIC_REFERENCE_ONLY',
      formulation: 'HIGH_PR_DIRECT_SALT_EQUAL_SEQ_V1',
    };
  }
  if (route === 'KD320_MEAN_STRESS_CORRECTION') {
    return failure(
      'KD320_CORE_ROUTE_NOT_QUALIFIED',
      'CORE does not calculate KD320 mean-stress correction in R3. Supply externally calculated Seq and permissible cycles through USER_CALCULATED_KD3.',
      {
        route,
        requiredInputMode: 'USER_CALCULATED_KD3',
        reason: 'CONTROLLED_KD320_FORMULATION_AND_CUSTODY_NOT_ESTABLISHED',
      },
    );
  }
  return failure('FATIGUE_ROUTE_UNSUPPORTED', `Unsupported seqRoute ${route || '(missing)'}.`);
}
