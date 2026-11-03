function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function text(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  const normalized = text(value).toUpperCase();
  if (normalized === 'TRUE') return true;
  if (normalized === 'FALSE') return false;
  return null;
}

function exactlyOne(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) {
    return failure(matches.length ? 'MASTER_RECORD_AMBIGUOUS' : 'MASTER_RECORD_NOT_FOUND', `${label} must resolve to exactly one row.`, {
      label, matches: matches.length,
    });
  }
  return { ok: true, row: matches[0] };
}

function methodRow(row) {
  return {
    methodId: text(row.method_id ?? row.methodId),
    methodRevision: text(row.method_revision ?? row.methodRevision),
    applicationScope: text(row.application_scope ?? row.applicationScope),
    b313Edition: text(row.b313_edition ?? row.b313Edition),
    fatigueRouteId: text(row.fatigue_route_id ?? row.fatigueRouteId),
    qualificationState: text(row.qualification_state ?? row.qualificationState),
  };
}

function routeRow(row) {
  return {
    fatigueRouteId: text(row.fatigue_route_id ?? row.fatigueRouteId),
    methodRevision: text(row.method_revision ?? row.methodRevision),
    kdRouteId: text(row.kd_route_id ?? row.kdRouteId),
    stressBasis: text(row.stress_basis ?? row.stressBasis),
    seqRoute: text(row.seq_route ?? row.seqRoute),
    meanStressRoute: text(row.mean_stress_route ?? row.meanStressRoute),
    fatigueCurveId: text(row.fatigue_curve_id ?? row.fatigueCurveId),
    interpolationRule: text(row.interpolation_rule ?? row.interpolationRule),
    extrapolationAllowed: typeof row.extrapolationAllowed === 'boolean'
      ? row.extrapolationAllowed : booleanValue(row.extrapolation_allowed),
    applicability: text(row.applicability),
    sourceId: text(row.source_id ?? row.sourceId),
    qualificationState: text(row.qualification_state ?? row.qualificationState),
  };
}

function curveRow(row) {
  return {
    fatigueCurveId: text(row.fatigue_curve_id ?? row.fatigueCurveId),
    standard: text(row.standard),
    edition: text(row.edition),
    materialScope: text(row.material_scope ?? row.materialScope),
    tempMinC: numberOrNull(row.temp_min_c ?? row.tempMinC),
    tempMaxC: numberOrNull(row.temp_max_c ?? row.tempMaxC),
    environmentScope: text(row.environment_scope ?? row.environmentScope),
    meanStressEmbedded: typeof row.meanStressEmbedded === 'boolean'
      ? row.meanStressEmbedded : booleanValue(row.mean_stress_embedded),
    sourceId: text(row.source_id ?? row.sourceId),
    sourceLocator: text(row.source_locator ?? row.sourceLocator),
    licenseClass: text(row.license_class ?? row.licenseClass),
    qualificationState: text(row.qualification_state ?? row.qualificationState),
  };
}

function curvePoint(row) {
  return {
    fatigueCurveId: text(row.fatigue_curve_id ?? row.fatigueCurveId),
    pointNo: numberOrNull(row.point_no ?? row.pointNo),
    nCycles: numberOrNull(row.n_cycles ?? row.nCycles),
    alternatingStressMpa: numberOrNull(row.sa_mpa ?? row.alternatingStressMpa),
    sourceLocator: text(row.source_locator ?? row.sourceLocator),
    verifiedBy: text(row.verified_by ?? row.verifiedBy),
    verifiedAt: text(row.verified_at ?? row.verifiedAt),
  };
}

function spectrumRow(row) {
  return {
    spectrumId: text(row.spectrum_id ?? row.spectrumId),
    projectId: text(row.project_id ?? row.projectId),
    classId: text(row.class_id ?? row.classId),
    revision: text(row.revision),
    designLifeYears: numberOrNull(row.design_life_years ?? row.designLifeYears),
    preparedBy: text(row.prepared_by ?? row.preparedBy),
    checkedBy: text(row.checked_by ?? row.checkedBy),
    approvedBy: text(row.approved_by ?? row.approvedBy),
    status: text(row.status),
  };
}

function stateRow(row) {
  return {
    spectrumId: text(row.spectrum_id ?? row.spectrumId),
    stateId: text(row.state_id ?? row.stateId),
    stateName: text(row.state_name ?? row.stateName),
    pressureMpa: numberOrNull(row.pressure_mpa ?? row.pressureMpa),
    materialTemperatureC: numberOrNull(row.material_temperature_c ?? row.materialTemperatureC),
    structuralTemperatureC: numberOrNull(row.structural_temperature_c ?? row.structuralTemperatureC),
    durationHr: numberOrNull(row.duration_hr ?? row.durationHr),
    provenanceId: text(row.provenance_id ?? row.provenanceId),
    status: text(row.status),
  };
}

function transitionRow(row) {
  return {
    spectrumId: text(row.spectrum_id ?? row.spectrumId),
    cycleId: text(row.cycle_id ?? row.cycleId),
    fromStateId: text(row.from_state_id ?? row.fromStateId),
    toStateId: text(row.to_state_id ?? row.toStateId),
    category: text(row.category),
    cyclesPerYear: numberOrNull(row.cycles_per_year ?? row.cyclesPerYear),
    totalCycles: numberOrNull(row.total_cycles ?? row.totalCycles),
    provenanceId: text(row.provenance_id ?? row.provenanceId),
    approvedBy: text(row.approved_by ?? row.approvedBy),
    status: text(row.status),
  };
}

function structuralIssues(method, route, curve, points) {
  const issues = [];
  if (!method.methodRevision || route.methodRevision !== method.methodRevision) issues.push('METHOD_ROUTE_REVISION_MISMATCH');
  if (!route.kdRouteId || !route.stressBasis || !route.seqRoute) issues.push('FATIGUE_ROUTE_INCOMPLETE');
  if (route.interpolationRule !== 'LOG_LOG') issues.push('FATIGUE_INTERPOLATION_UNSUPPORTED');
  if (route.extrapolationAllowed !== false) issues.push('FATIGUE_EXTRAPOLATION_MUST_BE_FALSE');
  if (route.fatigueCurveId !== curve.fatigueCurveId) issues.push('FATIGUE_CURVE_BINDING_MISMATCH');
  if (points.length < 2 || points.some((row) => !(row.nCycles > 0) || !(row.alternatingStressMpa > 0))) {
    issues.push('FATIGUE_CURVE_POINTS_INCOMPLETE');
  }
  return issues;
}

function authorityIssues(method, route, curve) {
  const issues = [];
  const synthetic = method.applicationScope === 'SYNTHETIC_BENCHMARK_VERIFICATION'
    && route.seqRoute === 'DIRECT_SALT_EQUAL_SEQ'
    && curve.licenseClass === 'PUBLIC_DOMAIN';
  if (synthetic) return { synthetic: true, issues };
  if (route.seqRoute === 'KD320_MEAN_STRESS_CORRECTION') issues.push('KD320_CONTROLLED_MEAN_STRESS_PARAMETERS_PENDING');
  if (curve.licenseClass === 'LICENSED_RESTRICTED') issues.push('LICENSED_CURVE_INDEPENDENT_CUSTODY_PENDING');
  issues.push('INDEPENDENT_ENGINEERING_CHECK_PENDING');
  return { synthetic: false, issues };
}

export function resolveChapterIxFatigueMasterBundle({ methodId, spectrumId = null, masters = {} } = {}) {
  if (!text(methodId)) return failure('INPUT_INVALID', 'methodId is required.');
  for (const name of ['methods', 'routes', 'curves', 'curvePoints']) {
    if (!Array.isArray(masters[name])) return failure('MASTER_DATA_REQUIRED', `masters.${name} must be an array.`, { name });
  }
  const methodMatch = exactlyOne(masters.methods.map(methodRow), (row) => row.methodId === text(methodId), `Method ${methodId}`);
  if (!methodMatch.ok) return methodMatch;
  const method = methodMatch.row;
  if (!method.fatigueRouteId || method.fatigueRouteId === 'NOT_APPLICABLE') {
    return failure('FATIGUE_ROUTE_NOT_APPLICABLE', `Method ${method.methodId} does not declare a fatigue route.`);
  }
  const routeMatch = exactlyOne(masters.routes.map(routeRow), (row) => row.fatigueRouteId === method.fatigueRouteId, `Route ${method.fatigueRouteId}`);
  if (!routeMatch.ok) return routeMatch;
  const route = routeMatch.row;
  const curveMatch = exactlyOne(masters.curves.map(curveRow), (row) => row.fatigueCurveId === route.fatigueCurveId, `Curve ${route.fatigueCurveId}`);
  if (!curveMatch.ok) return curveMatch;
  const curve = curveMatch.row;
  const points = masters.curvePoints.map(curvePoint).filter((row) => row.fatigueCurveId === curve.fatigueCurveId)
    .sort((a, b) => a.nCycles - b.nCycles);
  const structural = structuralIssues(method, route, curve, points);
  if (structural.length) {
    return { ok: true, bundleState: 'MASTER_LINKS_INVALID', issues: structural, canUseForDesignAuthority: false, method, route, curve, points };
  }
  const authority = authorityIssues(method, route, curve);
  let transient = null;
  if (spectrumId !== null) {
    for (const name of ['spectra', 'states', 'transitions']) {
      if (!Array.isArray(masters[name])) return failure('MASTER_DATA_REQUIRED', `masters.${name} must be an array.`, { name });
    }
    const spectrumMatch = exactlyOne(masters.spectra.map(spectrumRow), (row) => row.spectrumId === text(spectrumId), `Spectrum ${spectrumId}`);
    if (!spectrumMatch.ok) return spectrumMatch;
    transient = {
      spectrum: spectrumMatch.row,
      states: masters.states.map(stateRow).filter((row) => row.spectrumId === text(spectrumId)),
      transitions: masters.transitions.map(transitionRow).filter((row) => row.spectrumId === text(spectrumId)),
    };
    if (!transient.states.length || !transient.transitions.length) authority.issues.push('TRANSIENT_SPECTRUM_INCOMPLETE');
  }
  const ready = authority.synthetic && authority.issues.length === 0;
  return {
    ok: true,
    bundleState: ready ? 'SYNTHETIC_REFERENCE_READY' : 'PRODUCTION_EVIDENCE_PENDING',
    canUseForDesignAuthority: false,
    method,
    route,
    curve,
    points,
    transient,
    issues: [...new Set(authority.issues)],
  };
}
