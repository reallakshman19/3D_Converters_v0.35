import { resolveChapterIxTransientSpectrum } from './transient-spectrum.js';
import { calculateChapterIxPressureCycleStress } from './cycle-stress.js';
import { calculateChapterIxEquivalentAlternatingStress } from './fatigue-equivalent.js';
import { interpolateChapterIxFatigueCurve } from './fatigue-curve.js';
import { calculateChapterIxCumulativeDamage } from './cumulative-damage.js';

function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function text(value) {
  return String(value ?? '').trim();
}

function validateRoute(route) {
  if (!route || typeof route !== 'object') return failure('FATIGUE_ROUTE_REQUIRED', 'fatigueRoute is required.');
  if (!text(route.seqRoute)) return failure('FATIGUE_ROUTE_REQUIRED', 'fatigueRoute.seqRoute is required.');
  if (text(route.interpolationRule) !== 'LOG_LOG') {
    return failure('FATIGUE_ROUTE_UNSUPPORTED', 'Only LOG_LOG fatigue interpolation is supported in R3.');
  }
  if (route.extrapolationAllowed !== false) {
    return failure('FATIGUE_ROUTE_UNSUPPORTED', 'R3 requires extrapolationAllowed=false.');
  }
  return null;
}

function cycleEquivalent(cycleStress, route) {
  return calculateChapterIxEquivalentAlternatingStress({
    alternatingStressIntensityMpa: cycleStress.alternatingStressIntensityMpa,
    seqRoute: route.seqRoute,
  });
}

export function evaluateChapterIxStraightPipeFatigueSpectrum(input = {}) {
  const routeError = validateRoute(input.fatigueRoute);
  if (routeError) return routeError;
  const transient = resolveChapterIxTransientSpectrum({
    spectrum: input.spectrum,
    states: input.states,
    transitions: input.transitions,
  });
  if (!transient.ok) return failure(transient.code, transient.message, { stage: 'TRANSIENT', ...(transient.details ?? {}) });

  const evaluated = [];
  for (const cycle of transient.cycles) {
    const stress = calculateChapterIxPressureCycleStress({
      outsideDiameterMm: input.outsideDiameterMm,
      effectiveWallMm: input.effectiveWallMm,
      fromPressureMpa: cycle.fromState.pressureMpa,
      toPressureMpa: cycle.toState.pressureMpa,
    });
    if (!stress.ok) return failure(stress.code, stress.message, { stage: 'CYCLE_STRESS', cycleId: cycle.cycleId });
    const equivalent = cycleEquivalent(stress, input.fatigueRoute);
    if (!equivalent.ok) {
      return failure(equivalent.code, equivalent.message, {
        stage: 'EQUIVALENT_STRESS', cycleId: cycle.cycleId, ...(equivalent.details ?? {}),
      });
    }
    if (equivalent.equivalentAlternatingStressMpa === 0) {
      evaluated.push({
        cycleId: cycle.cycleId,
        category: cycle.category,
        appliedCycles: cycle.totalCycles,
        pressureRangeMpa: cycle.pressureRangeMpa,
        cycleStress: stress,
        equivalentStress: equivalent,
        fatigueLife: {
          ok: true,
          noDamage: true,
          permissibleCycles: null,
          interpolation: { type: 'ZERO_STRESS_NO_DAMAGE' },
        },
        permissibleCycles: null,
        zeroDamage: true,
        usage: 0,
      });
      continue;
    }
    const life = interpolateChapterIxFatigueCurve({
      equivalentAlternatingStressMpa: equivalent.equivalentAlternatingStressMpa,
      points: input.fatigueCurvePoints,
    });
    if (!life.ok) {
      return failure(life.code, life.message, {
        stage: 'FATIGUE_CURVE', cycleId: cycle.cycleId, ...(life.details ?? {}),
      });
    }
    evaluated.push({
      cycleId: cycle.cycleId,
      category: cycle.category,
      appliedCycles: cycle.totalCycles,
      pressureRangeMpa: cycle.pressureRangeMpa,
      cycleStress: stress,
      equivalentStress: equivalent,
      fatigueLife: life,
      permissibleCycles: life.permissibleCycles,
      zeroDamage: false,
      usage: cycle.totalCycles / life.permissibleCycles,
    });
  }
  const damage = calculateChapterIxCumulativeDamage({ cycles: evaluated });
  if (!damage.ok) return failure(damage.code, damage.message, { stage: 'CUMULATIVE_DAMAGE' });
  return {
    ok: true,
    canUseForDesignAuthority: false,
    calculationState: 'BENCHMARK_ONLY',
    transient,
    fatigueRoute: { ...input.fatigueRoute },
    cycles: evaluated,
    damage,
    referenceStatus: damage.referenceStatus,
    formulation: 'HIGH_PR_STRAIGHT_PIPE_FATIGUE_SPECTRUM_R3',
  };
}
