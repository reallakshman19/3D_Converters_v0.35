import {
  B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
  calculateEngineering,
} from '../engineering-calculations/index.js';
import {
  HP_PIPING_CLASS_AUTHORITY_POLICY,
  HP_PIPING_CLASS_PROJECT_VERSION,
  indexHpPipingClassFatigueEvidence,
  validateHpPipingClassProject,
} from './hp-piping-class-project.js';

export const HP_PIPING_CLASS_ORCHESTRATOR_VERSION = 'hp-piping-class-orchestrator/v1';

const CALCULATION_IDS = Object.freeze({
  basis: 'PIPE.B313.CH9.RESOLVE_BASIS',
  staticDirect: 'PIPE.B313.CH9.STRAIGHT_PRESSURE',
  staticGoverned: 'PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS',
  wallState: 'PIPE.B313.CH9.WALL_STATE',
  fatigue: B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function immutable(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((child) => immutable(child));
  return Object.freeze(value);
}

function authority() {
  return {
    ...HP_PIPING_CLASS_AUTHORITY_POLICY,
    engineeringAuthority: 'HP_PIPING_CLASS_REVIEW_ORCHESTRATION_ONLY',
  };
}

const DEFAULT_ENGINE = Object.freeze({ calculate: calculateEngineering });

function benchmarkRequest(calculationId, inputs, includeEvidence) {
  return {
    calculationId,
    inputs,
    options: {
      qualificationMode: 'benchmark',
      includeEvidence,
    },
  };
}

function fatigueRequest(inputs, includeEvidence) {
  return {
    calculationId: CALCULATION_IDS.fatigue,
    inputs,
    options: { includeEvidence },
  };
}

function directBasis(product) {
  const input = product.calculationBasis;
  return {
    ok: true,
    state: 'DIRECT_ENGINEERING_INPUT',
    resolverState: 'DIRECT_ENGINEERING_INPUT',
    resolved: {
      outsideDiameterMm: input.outsideDiameterMm,
      allowableStressMpa: input.allowableStressMpa,
      nominalWallMm: input.nominalWallMm,
      minusTolerancePct: input.minusTolerancePct,
    },
    canUseForDesignAuthority: false,
  };
}

function basisFromResolver(result) {
  if (!result?.ok) return null;
  return {
    outsideDiameterMm: result.outputs.outsideDiameterMm,
    allowableStressMpa: result.outputs.allowableStressMpa,
    nominalWallMm: result.outputs.nominalWallMm,
    minusTolerancePct: result.outputs.minusTolerancePct,
  };
}

function resolveProductBasis(engine, product, includeEvidence) {
  if (product.calculationBasis.mode === 'DIRECT_ENGINEERING_INPUT') {
    const trace = directBasis(product);
    return { trace, resolved: trace.resolved };
  }
  const trace = engine.calculate(benchmarkRequest(
    CALCULATION_IDS.basis,
    { basisPackage: product.calculationBasis.basisPackage },
    includeEvidence,
  ));
  return { trace, resolved: basisFromResolver(trace) };
}

function staticCalculation(engine, project, product, includeEvidence) {
  const basis = project.classBasis;
  if (product.calculationBasis.mode === 'DIRECT_ENGINEERING_INPUT') {
    const direct = product.calculationBasis;
    return engine.calculate(benchmarkRequest(CALCULATION_IDS.staticDirect, {
      outsideDiameter: direct.outsideDiameterMm,
      designPressure: basis.designPressureMpa,
      allowableStress: direct.allowableStressMpa,
      internalAllowance: basis.internalAllowanceMm,
      externalAllowance: basis.externalAllowanceMm,
      minusTolerancePct: direct.minusTolerancePct,
      providedNominalThickness: direct.nominalWallMm,
    }, includeEvidence));
  }
  return engine.calculate(benchmarkRequest(CALCULATION_IDS.staticGoverned, {
    basisPackage: product.calculationBasis.basisPackage,
    designPressure: basis.designPressureMpa,
    internalAllowance: basis.internalAllowanceMm,
    externalAllowance: basis.externalAllowanceMm,
  }, includeEvidence));
}

function wallStateInputs(project, product, resolvedBasis) {
  const wall = product.wallState ?? {};
  return {
    nominalWall: resolvedBasis.nominalWallMm,
    minusTolerancePct: resolvedBasis.minusTolerancePct,
    internalServiceAllowance: project.classBasis.internalAllowanceMm,
    externalServiceAllowance: project.classBasis.externalAllowanceMm,
    ...(wall.measuredCurrentWallMm !== undefined ? { measuredCurrentWall: wall.measuredCurrentWallMm } : {}),
    ...(wall.futureInternalLossMm !== undefined ? { futureInternalLoss: wall.futureInternalLossMm } : {}),
    ...(wall.futureExternalLossMm !== undefined ? { futureExternalLoss: wall.futureExternalLossMm } : {}),
  };
}

function blockedStep(reason, dependency = null) {
  return {
    ok: false,
    state: 'BLOCKED_DEPENDENCY',
    reason,
    dependency,
    canUseForDesignAuthority: false,
  };
}

function fatigueWall(product, wallState) {
  if (!wallState?.ok) return null;
  const basis = product.wallState?.fatigueWallBasis;
  if (basis === 'PROJECTED_END_OF_LIFE') {
    return wallState.outputs.projectedEndOfLifeWallMm ?? null;
  }
  return wallState.outputs.endOfLifeEffectiveWallMm ?? null;
}

function notEvaluatedFatigue() {
  return {
    ok: true,
    state: 'NOT_EVALUATED',
    reason: 'EXTERNAL_KD3_EVIDENCE_NOT_SUPPLIED',
    canUseForDesignAuthority: false,
  };
}

function fatigueCalculation(engine, project, product, resolvedBasis, wallState, evidence, includeEvidence) {
  if (!evidence) return notEvaluatedFatigue();
  if (!resolvedBasis) return blockedStep('Product basis resolution failed.', 'BASIS');
  if (!wallState?.ok) return blockedStep('Wall-state calculation failed.', 'WALL_STATE');
  const effectiveWall = fatigueWall(product, wallState);
  if (!(effectiveWall > 0)) {
    return blockedStep(`Selected fatigue wall basis ${product.wallState?.fatigueWallBasis} is unavailable.`, 'WALL_STATE');
  }
  return engine.calculate(fatigueRequest({
    outsideDiameter: resolvedBasis.outsideDiameterMm,
    effectiveWall,
    spectrum: project.transient.spectrum,
    states: project.transient.states,
    transitions: project.transient.transitions,
    externalResults: evidence.externalResults,
  }, includeEvidence));
}

function staticPass(result) {
  if (!result?.ok) return null;
  if (typeof result.outputs?.staticPass === 'boolean') return result.outputs.staticPass;
  if (typeof result.outputs?.staticReferencePass === 'boolean') return result.outputs.staticReferencePass;
  return null;
}

function productState({ basisTrace, staticResult, wallState, fatigueResult, fatigueExpected }) {
  if (!basisTrace?.ok || !staticResult?.ok || !wallState?.ok) return 'CALCULATION_BLOCKED';
  if (fatigueExpected && !fatigueResult?.ok) return 'FATIGUE_BLOCKED';
  if (staticPass(staticResult) === false) return 'STATIC_REFERENCE_FAIL';
  if (!fatigueExpected) return 'STATIC_EVALUATED_FATIGUE_NOT_SUPPLIED';
  if (fatigueResult.outputs?.usageWithinUnity === false) return 'FATIGUE_REVIEW_EXCEEDS_UNITY';
  return 'REVIEW_COMPLETE_NOT_AUTHORIZED';
}

function productCalculationOk({ basisTrace, staticResult, wallState, fatigueResult, fatigueExpected }) {
  return Boolean(
    basisTrace?.ok
    && staticResult?.ok
    && wallState?.ok
    && (!fatigueExpected || fatigueResult?.ok),
  );
}

function evaluateProduct(engine, project, product, evidence, includeEvidence) {
  const basis = resolveProductBasis(engine, product, includeEvidence);
  const staticResult = staticCalculation(engine, project, product, includeEvidence);
  const wallState = basis.resolved
    ? engine.calculate(benchmarkRequest(
      CALCULATION_IDS.wallState,
      wallStateInputs(project, product, basis.resolved),
      includeEvidence,
    ))
    : blockedStep('Product basis resolution failed.', 'BASIS');
  const fatigueResult = fatigueCalculation(
    engine,
    project,
    product,
    basis.resolved,
    wallState,
    evidence,
    includeEvidence,
  );
  const fatigueExpected = Boolean(evidence);
  const state = productState({
    basisTrace: basis.trace,
    staticResult,
    wallState,
    fatigueResult,
    fatigueExpected,
  });
  return {
    productId: product.productId,
    basisMode: product.calculationBasis.mode,
    calculationOk: productCalculationOk({
      basisTrace: basis.trace,
      staticResult,
      wallState,
      fatigueResult,
      fatigueExpected,
    }),
    engineeringState: state,
    resolvedBasis: clone(basis.resolved),
    selectedFatigueWallBasis: product.wallState.fatigueWallBasis,
    selectedFatigueWallMm: fatigueWall(product, wallState),
    calculations: {
      basis: basis.trace,
      static: staticResult,
      wallState,
      fatigue: fatigueResult,
    },
    assessment: {
      staticPass: staticPass(staticResult),
      fatigueEvaluated: fatigueExpected,
      fatigueUsageWithinUnity: fatigueExpected && fatigueResult?.ok
        ? Boolean(fatigueResult.outputs?.usageWithinUnity)
        : null,
      cumulativeUsage: fatigueExpected && fatigueResult?.ok
        ? fatigueResult.outputs?.cumulativeUsage ?? null
        : null,
    },
    authority: authority(),
  };
}

function summarize(products) {
  const count = (predicate) => products.filter(predicate).length;
  return {
    totalProducts: products.length,
    calculationSucceeded: count((row) => row.calculationOk),
    calculationBlocked: count((row) => !row.calculationOk),
    staticReferencePassed: count((row) => row.assessment.staticPass === true),
    staticReferenceFailed: count((row) => row.assessment.staticPass === false),
    fatigueEvaluated: count((row) => row.assessment.fatigueEvaluated),
    fatigueNotSupplied: count((row) => !row.assessment.fatigueEvaluated),
    fatigueWithinUnity: count((row) => row.assessment.fatigueUsageWithinUnity === true),
    fatigueExceedsUnity: count((row) => row.assessment.fatigueUsageWithinUnity === false),
  };
}

export function evaluateHpPipingClassProject(project = {}, options = {}) {
  const validation = validateHpPipingClassProject(project);
  if (!validation.ok) {
    return immutable({
      ok: false,
      orchestratorVersion: HP_PIPING_CLASS_ORCHESTRATOR_VERSION,
      projectVersion: project?.schemaVersion ?? null,
      projectState: 'INVALID_PROJECT',
      issues: clone(validation.issues),
      products: [],
      authority: authority(),
    });
  }

  const engine = options.engine ?? DEFAULT_ENGINE;
  if (!engine?.calculate) throw new TypeError('HP Piping Class orchestration requires a calculation engine with calculate().');
  const includeEvidence = options.includeEvidence !== false;
  const evidenceByProduct = indexHpPipingClassFatigueEvidence(project);
  const products = project.products.map((product) => evaluateProduct(
    engine,
    project,
    product,
    evidenceByProduct.get(product.productId),
    includeEvidence,
  ));
  const summary = summarize(products);
  const ok = summary.calculationBlocked === 0;

  return immutable({
    ok,
    orchestratorVersion: HP_PIPING_CLASS_ORCHESTRATOR_VERSION,
    projectVersion: HP_PIPING_CLASS_PROJECT_VERSION,
    projectState: ok ? 'CALCULATED_NOT_AUTHORIZED' : 'CALCULATION_BLOCKED',
    projectIdentity: {
      projectId: project.metadata.projectId,
      classId: project.metadata.classId,
      revision: project.metadata.revision,
    },
    calculationIds: { ...CALCULATION_IDS },
    products,
    summary,
    authority: authority(),
    warnings: [{
      code: 'HP_PIPING_CLASS_REVIEW_ONLY',
      message: 'HP Piping Class v2 orchestrates canonical Chapter IX calculations only. Native CORE KD-3, Code compliance, and design authority remain unqualified/not established.',
    }],
  });
}
