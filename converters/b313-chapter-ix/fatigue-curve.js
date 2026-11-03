function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return failure('FATIGUE_CURVE_POINTS_REQUIRED', 'At least two fatigue curve points are required.');
  }
  const sorted = points.map((row) => ({
    pointNo: row.pointNo ?? null,
    nCycles: row.nCycles,
    alternatingStressMpa: row.alternatingStressMpa,
    sourceLocator: row.sourceLocator ?? null,
  })).sort((a, b) => a.nCycles - b.nCycles);
  for (const row of sorted) {
    if (!finite(row.nCycles) || !(row.nCycles > 0)
        || !finite(row.alternatingStressMpa) || !(row.alternatingStressMpa > 0)) {
      return failure('FATIGUE_CURVE_POINT_INVALID', 'Curve points require positive finite cycles and stress.');
    }
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (!(sorted[i].nCycles > sorted[i - 1].nCycles)) {
      return failure('FATIGUE_CURVE_ORDER_INVALID', 'Fatigue cycles must be strictly increasing.');
    }
    if (!(sorted[i].alternatingStressMpa < sorted[i - 1].alternatingStressMpa)) {
      return failure('FATIGUE_CURVE_ORDER_INVALID', 'Fatigue alternating stress must be strictly decreasing with cycles.');
    }
  }
  return { ok: true, points: sorted };
}

function interpolate(stress, upper, lower) {
  const logN1 = Math.log10(upper.nCycles);
  const logN2 = Math.log10(lower.nCycles);
  const logS = Math.log10(stress);
  const logS1 = Math.log10(upper.alternatingStressMpa);
  const logS2 = Math.log10(lower.alternatingStressMpa);
  const fraction = (logS - logS1) / (logS2 - logS1);
  const logN = logN1 + fraction * (logN2 - logN1);
  return { permissibleCycles: 10 ** logN, logInterpolationFraction: fraction };
}

export function interpolateChapterIxFatigueCurve({ equivalentAlternatingStressMpa, points = [] } = {}) {
  if (!finite(equivalentAlternatingStressMpa) || !(equivalentAlternatingStressMpa > 0)) {
    return failure('INPUT_INVALID', 'equivalentAlternatingStressMpa must be > 0.');
  }
  const normalized = normalizePoints(points);
  if (!normalized.ok) return normalized;
  const rows = normalized.points;
  const maximumStressMpa = rows[0].alternatingStressMpa;
  const minimumStressMpa = rows[rows.length - 1].alternatingStressMpa;
  if (equivalentAlternatingStressMpa > maximumStressMpa
      || equivalentAlternatingStressMpa < minimumStressMpa) {
    return failure('BLOCKED_NO_EXTRAPOLATION', 'Equivalent stress is outside the controlled fatigue-curve stress range.', {
      minimumStressMpa, maximumStressMpa, equivalentAlternatingStressMpa,
    });
  }
  const exact = rows.find((row) => row.alternatingStressMpa === equivalentAlternatingStressMpa);
  if (exact) {
    return {
      ok: true,
      canUseForDesignAuthority: false,
      equivalentAlternatingStressMpa,
      permissibleCycles: exact.nCycles,
      interpolation: { type: 'EXACT_CURVE_POINT', upper: exact, lower: exact, fraction: 0 },
      formulation: 'HIGH_PR_FATIGUE_CURVE_LOG_LOG_V1',
    };
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    const upper = rows[i];
    const lower = rows[i + 1];
    if (upper.alternatingStressMpa > equivalentAlternatingStressMpa
        && equivalentAlternatingStressMpa > lower.alternatingStressMpa) {
      const value = interpolate(equivalentAlternatingStressMpa, upper, lower);
      return {
        ok: true,
        canUseForDesignAuthority: false,
        equivalentAlternatingStressMpa,
        permissibleCycles: value.permissibleCycles,
        interpolation: {
          type: 'LOG_LOG_NO_EXTRAPOLATION',
          upper,
          lower,
          fraction: value.logInterpolationFraction,
        },
        formulation: 'HIGH_PR_FATIGUE_CURVE_LOG_LOG_V1',
      };
    }
  }
  return failure('FATIGUE_CURVE_BRACKET_NOT_FOUND', 'No valid curve bracket was found.');
}
