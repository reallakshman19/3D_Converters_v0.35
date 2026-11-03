export const HP_PIPING_CLASS_PROJECT_VERSION = 'hp-piping-class-project/v2';

export const HP_PIPING_CLASS_BASIS_MODES = Object.freeze([
  'DIRECT_ENGINEERING_INPUT',
  'GOVERNED_BASIS_PACKAGE',
]);

export const HP_PIPING_CLASS_FATIGUE_WALL_BASES = Object.freeze([
  'END_OF_LIFE_EFFECTIVE',
  'PROJECTED_END_OF_LIFE',
]);

export const HP_PIPING_CLASS_AUTHORITY_POLICY = Object.freeze({
  calculationMode: 'USER_CALCULATED_KD3',
  nativeCoreKd3Qualified: false,
  codeCompliance: false,
  canUseForDesignAuthority: false,
});

export const HP_PIPING_CLASS_CANONICAL_UNITS = Object.freeze({
  length: 'mm',
  pressure: 'MPa',
  stress: 'MPa',
  temperature: 'degC',
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value ?? '').trim();
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value) {
  return finite(value) && value > 0;
}

function nonNegative(value) {
  return finite(value) && value >= 0;
}

function issue(path, code, message) {
  return Object.freeze({ path, code, message });
}

function authorityManifest(input = {}) {
  return {
    ...clone(input),
    calculationMode: input.calculationMode ?? HP_PIPING_CLASS_AUTHORITY_POLICY.calculationMode,
    nativeCoreKd3Qualified: input.nativeCoreKd3Qualified ?? false,
    codeCompliance: input.codeCompliance ?? false,
    canUseForDesignAuthority: input.canUseForDesignAuthority ?? false,
  };
}

export function createHpPipingClassProject(input = {}) {
  return {
    schemaVersion: HP_PIPING_CLASS_PROJECT_VERSION,
    canonicalUnits: {
      ...HP_PIPING_CLASS_CANONICAL_UNITS,
      ...(clone(input.canonicalUnits) ?? {}),
    },
    metadata: clone(input.metadata ?? {}),
    methodManifest: authorityManifest(input.methodManifest ?? {}),
    classBasis: clone(input.classBasis ?? {}),
    products: clone(input.products ?? []),
    transient: clone(input.transient ?? { spectrum: null, states: [], transitions: [] }),
    fatigueEvidence: clone(input.fatigueEvidence ?? []),
  };
}

function validateCanonicalUnits(project, issues) {
  const units = project.canonicalUnits ?? {};
  for (const [quantity, expected] of Object.entries(HP_PIPING_CLASS_CANONICAL_UNITS)) {
    if (text(units[quantity]) !== expected) {
      issues.push(issue(
        `canonicalUnits.${quantity}`,
        'CANONICAL_UNIT_MISMATCH',
        `${quantity} must use canonical unit ${expected}.`,
      ));
    }
  }
}

function validateMetadata(project, issues) {
  for (const field of ['projectId', 'classId', 'revision']) {
    if (!text(project.metadata?.[field])) {
      issues.push(issue(`metadata.${field}`, 'METADATA_REQUIRED', `${field} is required.`));
    }
  }
}

function validateMethodManifest(project, issues) {
  const method = project.methodManifest ?? {};
  if (!text(method.b313Edition)) {
    issues.push(issue('methodManifest.b313Edition', 'METHOD_IDENTITY_REQUIRED', 'B31.3 edition is required.'));
  }
  if (text(method.calculationMode) !== HP_PIPING_CLASS_AUTHORITY_POLICY.calculationMode) {
    issues.push(issue(
      'methodManifest.calculationMode',
      'CALCULATION_MODE_NOT_ALLOWED',
      'HP Piping Class v2 permits USER_CALCULATED_KD3 only.',
    ));
  }
  for (const field of ['nativeCoreKd3Qualified', 'codeCompliance', 'canUseForDesignAuthority']) {
    if (method[field] !== false) {
      issues.push(issue(
        `methodManifest.${field}`,
        'AUTHORITY_PROMOTION_NOT_ALLOWED',
        `${field} must remain false in HP Piping Class v2.`,
      ));
    }
  }
  if ((project.fatigueEvidence ?? []).length && !text(method.viii3Edition)) {
    issues.push(issue(
      'methodManifest.viii3Edition',
      'METHOD_IDENTITY_REQUIRED',
      'VIII-3 project/source edition identity is required when fatigue evidence is present.',
    ));
  }
}

function validateClassBasis(project, issues) {
  const basis = project.classBasis ?? {};
  if (!positive(basis.designPressureMpa)) {
    issues.push(issue('classBasis.designPressureMpa', 'CLASS_BASIS_INVALID', 'Design pressure must be > 0 MPa.'));
  }
  for (const field of ['internalAllowanceMm', 'externalAllowanceMm']) {
    if (!nonNegative(basis[field])) {
      issues.push(issue(`classBasis.${field}`, 'CLASS_BASIS_INVALID', `${field} must be >= 0 mm.`));
    }
  }
}

function validateDirectBasis(product, index, issues) {
  const basis = product.calculationBasis ?? {};
  const prefix = `products[${index}].calculationBasis`;
  for (const field of ['outsideDiameterMm', 'allowableStressMpa', 'nominalWallMm']) {
    if (!positive(basis[field])) {
      issues.push(issue(`${prefix}.${field}`, 'DIRECT_BASIS_INVALID', `${field} must be > 0.`));
    }
  }
  if (!finite(basis.minusTolerancePct) || basis.minusTolerancePct < 0 || basis.minusTolerancePct >= 100) {
    issues.push(issue(`${prefix}.minusTolerancePct`, 'DIRECT_BASIS_INVALID', 'minusTolerancePct must be >= 0 and < 100.'));
  }
}

function validateGovernedBasis(product, index, issues) {
  const basis = product.calculationBasis ?? {};
  if (!basis.basisPackage || typeof basis.basisPackage !== 'object' || Array.isArray(basis.basisPackage)) {
    issues.push(issue(
      `products[${index}].calculationBasis.basisPackage`,
      'GOVERNED_BASIS_REQUIRED',
      'GOVERNED_BASIS_PACKAGE mode requires a basisPackage object.',
    ));
  }
}

function validateWallState(product, index, issues) {
  const wall = product.wallState ?? {};
  const prefix = `products[${index}].wallState`;
  if (!HP_PIPING_CLASS_FATIGUE_WALL_BASES.includes(wall.fatigueWallBasis)) {
    issues.push(issue(
      `${prefix}.fatigueWallBasis`,
      'WALL_BASIS_REQUIRED',
      `fatigueWallBasis must be one of ${HP_PIPING_CLASS_FATIGUE_WALL_BASES.join(', ')}.`,
    ));
  }
  const hasMeasured = wall.measuredCurrentWallMm !== undefined;
  const hasFuture = wall.futureInternalLossMm !== undefined || wall.futureExternalLossMm !== undefined;
  if (!hasMeasured && hasFuture) {
    issues.push(issue(
      `${prefix}.measuredCurrentWallMm`,
      'BROWNFIELD_WALL_INCOMPLETE',
      'Future wall loss requires measuredCurrentWallMm.',
    ));
  }
  if (hasMeasured) {
    if (!positive(wall.measuredCurrentWallMm)) {
      issues.push(issue(`${prefix}.measuredCurrentWallMm`, 'BROWNFIELD_WALL_INVALID', 'Measured current wall must be > 0.'));
    }
    for (const field of ['futureInternalLossMm', 'futureExternalLossMm']) {
      if (!nonNegative(wall[field])) {
        issues.push(issue(`${prefix}.${field}`, 'BROWNFIELD_WALL_INVALID', `${field} must be >= 0 when measured wall is supplied.`));
      }
    }
  }
  if (wall.fatigueWallBasis === 'PROJECTED_END_OF_LIFE' && !hasMeasured) {
    issues.push(issue(
      `${prefix}.fatigueWallBasis`,
      'PROJECTED_WALL_REQUIRES_MEASUREMENT',
      'PROJECTED_END_OF_LIFE requires measured current wall and future loss inputs.',
    ));
  }
}

function validateProducts(project, issues) {
  if (!Array.isArray(project.products) || !project.products.length) {
    issues.push(issue('products', 'PRODUCTS_REQUIRED', 'At least one piping-class product is required.'));
    return new Set();
  }
  const ids = new Set();
  project.products.forEach((product, index) => {
    const id = text(product?.productId);
    if (!id) issues.push(issue(`products[${index}].productId`, 'PRODUCT_ID_REQUIRED', 'productId is required.'));
    else if (ids.has(id)) issues.push(issue(`products[${index}].productId`, 'PRODUCT_ID_DUPLICATE', `Duplicate productId ${id}.`));
    else ids.add(id);

    const mode = product?.calculationBasis?.mode;
    if (!HP_PIPING_CLASS_BASIS_MODES.includes(mode)) {
      issues.push(issue(
        `products[${index}].calculationBasis.mode`,
        'BASIS_MODE_INVALID',
        `calculationBasis.mode must be one of ${HP_PIPING_CLASS_BASIS_MODES.join(', ')}.`,
      ));
    } else if (mode === 'DIRECT_ENGINEERING_INPUT') validateDirectBasis(product, index, issues);
    else validateGovernedBasis(product, index, issues);
    validateWallState(product, index, issues);
  });
  return ids;
}

function validateTransient(project, issues, fatigueRequired) {
  const transient = project.transient ?? {};
  const states = transient.states;
  const transitions = transient.transitions;
  if (!fatigueRequired) {
    if (states !== undefined && !Array.isArray(states)) issues.push(issue('transient.states', 'TRANSIENT_INVALID', 'states must be an array.'));
    if (transitions !== undefined && !Array.isArray(transitions)) issues.push(issue('transient.transitions', 'TRANSIENT_INVALID', 'transitions must be an array.'));
    return;
  }
  if (!transient.spectrum || typeof transient.spectrum !== 'object' || !text(transient.spectrum.spectrumId)) {
    issues.push(issue('transient.spectrum', 'TRANSIENT_REQUIRED', 'A spectrum with spectrumId is required for fatigue evaluation.'));
  }
  if (!Array.isArray(states) || !states.length) {
    issues.push(issue('transient.states', 'TRANSIENT_REQUIRED', 'At least one operating state is required for fatigue evaluation.'));
    return;
  }
  if (!Array.isArray(transitions) || !transitions.length) {
    issues.push(issue('transient.transitions', 'TRANSIENT_REQUIRED', 'At least one transition is required for fatigue evaluation.'));
    return;
  }

  const stateIds = new Set();
  states.forEach((state, index) => {
    const stateId = text(state?.stateId);
    if (!stateId) issues.push(issue(`transient.states[${index}].stateId`, 'STATE_ID_REQUIRED', 'stateId is required.'));
    else if (stateIds.has(stateId)) issues.push(issue(`transient.states[${index}].stateId`, 'STATE_ID_DUPLICATE', `Duplicate stateId ${stateId}.`));
    else stateIds.add(stateId);
  });
  const cycleIds = new Set();
  transitions.forEach((transition, index) => {
    const cycleId = text(transition?.cycleId);
    if (!cycleId) issues.push(issue(`transient.transitions[${index}].cycleId`, 'CYCLE_ID_REQUIRED', 'cycleId is required.'));
    else if (cycleIds.has(cycleId)) issues.push(issue(`transient.transitions[${index}].cycleId`, 'CYCLE_ID_DUPLICATE', `Duplicate cycleId ${cycleId}.`));
    else cycleIds.add(cycleId);
    for (const field of ['fromStateId', 'toStateId']) {
      const stateId = text(transition?.[field]);
      if (stateId && !stateIds.has(stateId)) {
        issues.push(issue(
          `transient.transitions[${index}].${field}`,
          'TRANSITION_STATE_UNKNOWN',
          `${field} ${stateId} is not present in transient.states.`,
        ));
      }
    }
  });
}

function validateFatigueEvidence(project, productIds, issues) {
  if (!Array.isArray(project.fatigueEvidence)) {
    issues.push(issue('fatigueEvidence', 'FATIGUE_EVIDENCE_INVALID', 'fatigueEvidence must be an array.'));
    return;
  }
  const seen = new Set();
  project.fatigueEvidence.forEach((evidence, index) => {
    const productId = text(evidence?.productId);
    if (!productId) issues.push(issue(`fatigueEvidence[${index}].productId`, 'PRODUCT_ID_REQUIRED', 'Fatigue evidence requires productId.'));
    else if (!productIds.has(productId)) issues.push(issue(`fatigueEvidence[${index}].productId`, 'FATIGUE_PRODUCT_UNKNOWN', `Unknown productId ${productId}.`));
    else if (seen.has(productId)) issues.push(issue(`fatigueEvidence[${index}].productId`, 'FATIGUE_PRODUCT_DUPLICATE', `Only one fatigue evidence package is allowed per product in v2.`));
    else seen.add(productId);
    if (!Array.isArray(evidence?.externalResults) || !evidence.externalResults.length) {
      issues.push(issue(`fatigueEvidence[${index}].externalResults`, 'FATIGUE_RESULTS_REQUIRED', 'externalResults must contain at least one USER_CALCULATED_KD3 row.'));
    }
  });
}

export function validateHpPipingClassProject(project = {}) {
  const issues = [];
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    return { ok: false, issues: [issue('', 'PROJECT_INVALID', 'HP Piping Class project must be an object.')] };
  }
  if (project.schemaVersion !== HP_PIPING_CLASS_PROJECT_VERSION) {
    issues.push(issue('schemaVersion', 'PROJECT_VERSION_UNSUPPORTED', `schemaVersion must be ${HP_PIPING_CLASS_PROJECT_VERSION}.`));
  }
  validateCanonicalUnits(project, issues);
  validateMetadata(project, issues);
  validateMethodManifest(project, issues);
  validateClassBasis(project, issues);
  const productIds = validateProducts(project, issues);
  validateFatigueEvidence(project, productIds, issues);
  validateTransient(project, issues, Array.isArray(project.fatigueEvidence) && project.fatigueEvidence.length > 0);
  return { ok: issues.length === 0, issues };
}

export function indexHpPipingClassFatigueEvidence(project = {}) {
  return new Map((project.fatigueEvidence ?? []).map((row) => [text(row.productId), row]));
}
