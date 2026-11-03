const VECTOR_EPSILON = 1e-8;
const ANGLE_EPSILON_DEG = 1e-6;
const GEOMETRY_EPSILON_MM = 1e-6;

const FAMILY_SPECS = Object.freeze({
  PIPE: { nativeType: 'PIPE', roles: ['A', 'L'] },
  ELBOW: { nativeType: 'ELBO', roles: ['A', 'L'] },
  TEE: { nativeType: 'TEE', roles: ['A', 'L', 'P'] },
  REDUCER: { nativeType: 'REDU', roles: ['A', 'L'] },
  BRANCH_FITTING: { nativeType: 'OLET', roles: ['A', 'L'] },
  FLANGE: { nativeType: 'FLAN', roles: ['A', 'L'] },
  GASKET: { nativeType: 'GASK', roles: ['A', 'L'] },
  VALVE: { nativeType: 'VALV', roles: ['A', 'L'] },
  INSTRUMENT: { nativeType: 'INST', roles: ['A', 'L'] },
});

function fail(message) {
  throw new Error(`BLOCKED_MAPPING ${message}`);
}

export function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function assertKeys(value, required, optional, label) {
  const record = requireObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(record, key)) fail(`${label}.${key} is required.`);
  for (const key of Object.keys(record)) if (!allowed.has(key)) fail(`${label}.${key} is not allowed.`);
  return record;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required.`);
  return value;
}

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) fail(`${label} must be positive.`);
  return value;
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function negate(value) {
  return value.map((item) => -item);
}

export function normalizeWorldVector(value, label) {
  const record = assertKeys(value, ['authority', 'vector'], [], label);
  if (record.authority !== 'world-vector') fail(`${label}.authority must be world-vector.`);
  if (!Array.isArray(record.vector) || record.vector.length !== 3) fail(`${label}.vector must have three values.`);
  const vector = [...record.vector];
  if (!vector.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    fail(`${label}.vector must be finite numeric evidence.`);
  }
  const length = Math.hypot(...vector);
  if (length <= VECTOR_EPSILON) fail(`${label}.vector must be non-zero.`);
  return { authority: 'world-vector', vector: vector.map((item) => item / length) };
}

function requireOpposed(ports, label) {
  if (dot(ports.A.direction.vector, ports.L.direction.vector) > -1 + VECTOR_EPSILON) {
    fail(`${label} A/L directions must be opposed.`);
  }
}

function validatePipe(engineering, ports) {
  assertKeys(engineering, [], [], 'engineering');
  requireOpposed(ports, 'PIPE');
  return {};
}

function validateElbow(engineering, ports) {
  const record = assertKeys(engineering, ['bendRadiusMm', 'bendAngleDeg', 'bendPlaneNormal'], [], 'engineering');
  const radius = positive(record.bendRadiusMm, 'engineering.bendRadiusMm');
  const angle = positive(record.bendAngleDeg, 'engineering.bendAngleDeg');
  if (angle > 180) fail('engineering.bendAngleDeg must not exceed 180.');
  const normal = normalizeWorldVector(record.bendPlaneNormal, 'engineering.bendPlaneNormal');
  const entry = negate(ports.A.direction.vector), exit = ports.L.direction.vector;
  const derived = Math.acos(clamp(dot(entry, exit))) * 180 / Math.PI;
  if (Math.abs(derived - angle) > ANGLE_EPSILON_DEG) fail('ELBOW directions conflict with bendAngleDeg.');
  if (Math.abs(dot(normal.vector, entry)) > VECTOR_EPSILON || Math.abs(dot(normal.vector, exit)) > VECTOR_EPSILON) {
    fail('ELBOW bendPlaneNormal must be perpendicular to entry and exit directions.');
  }
  return { bendRadiusMm: radius, bendAngleDeg: angle, bendPlaneNormal: normal };
}

function validateTee(engineering, ports) {
  const record = assertKeys(engineering, ['runDiameterMm', 'branchDiameterMm'], [], 'engineering');
  requireOpposed(ports, 'TEE run');
  if (Math.abs(dot(ports.A.direction.vector, ports.P.direction.vector)) > VECTOR_EPSILON) {
    fail('TEE branch direction must be perpendicular to the run.');
  }
  const runDiameterMm = positive(record.runDiameterMm, 'engineering.runDiameterMm');
  const branchDiameterMm = positive(record.branchDiameterMm, 'engineering.branchDiameterMm');
  if (branchDiameterMm > runDiameterMm) fail('TEE branchDiameterMm must not exceed runDiameterMm.');
  return { runDiameterMm, branchDiameterMm };
}

function validateReducer(engineering, ports) {
  const required = ['largeEndDiameterMm', 'smallEndDiameterMm', 'largeEndPortId', 'smallEndPortId', 'reducerType'];
  const record = assertKeys(engineering, required, ['eccentricDirection'], 'engineering');
  requireOpposed(ports, 'REDUCER');
  const large = positive(record.largeEndDiameterMm, 'engineering.largeEndDiameterMm');
  const small = positive(record.smallEndDiameterMm, 'engineering.smallEndDiameterMm');
  if (large <= small) fail('REDUCER largeEndDiameterMm must exceed smallEndDiameterMm.');
  const ids = new Set([ports.A.portId, ports.L.portId]);
  if (!ids.has(record.largeEndPortId) || !ids.has(record.smallEndPortId) || record.largeEndPortId === record.smallEndPortId) {
    fail('REDUCER end port identities are invalid.');
  }
  if (!['CONCENTRIC', 'ECCENTRIC'].includes(record.reducerType)) fail('engineering.reducerType is invalid.');
  if (record.reducerType === 'CONCENTRIC' && record.eccentricDirection !== undefined) {
    fail('CONCENTRIC reducer cannot contain eccentricDirection.');
  }
  const eccentric = record.reducerType === 'ECCENTRIC'
    ? normalizeWorldVector(record.eccentricDirection, 'engineering.eccentricDirection') : undefined;
  if (eccentric && Math.abs(dot(eccentric.vector, ports.A.direction.vector)) > VECTOR_EPSILON) {
    fail('REDUCER eccentricDirection must be perpendicular to the run axis.');
  }
  return { ...record, largeEndDiameterMm: large, smallEndDiameterMm: small,
    ...(eccentric ? { eccentricDirection: eccentric } : {}) };
}

function validateBranchFitting(engineering, ports) {
  const required = [
    'largePortDiameterMm', 'smallPortDiameterMm',
    'largePortId', 'smallPortId', 'branchFittingType',
  ];
  const record = assertKeys(engineering, required, [], 'engineering');
  requireOpposed(ports, 'BRANCH_FITTING');
  const large = positive(record.largePortDiameterMm, 'engineering.largePortDiameterMm');
  const small = positive(record.smallPortDiameterMm, 'engineering.smallPortDiameterMm');
  if (large <= small) fail('BRANCH_FITTING largePortDiameterMm must exceed smallPortDiameterMm.');
  const ids = new Set([ports.A.portId, ports.L.portId]);
  if (!ids.has(record.largePortId) || !ids.has(record.smallPortId)
    || record.largePortId === record.smallPortId) {
    fail('BRANCH_FITTING port identities are invalid.');
  }
  return {
    largePortDiameterMm: large,
    smallPortDiameterMm: small,
    largePortId: record.largePortId,
    smallPortId: record.smallPortId,
    branchFittingType: requireText(record.branchFittingType, 'engineering.branchFittingType'),
  };
}

function validateFlange(engineering, ports) {
  const record = assertKeys(engineering, ['nominalDiameterMm', 'thicknessMm', 'flangeType'], [], 'engineering');
  requireOpposed(ports, 'FLANGE');
  return {
    nominalDiameterMm: positive(record.nominalDiameterMm, 'engineering.nominalDiameterMm'),
    thicknessMm: positive(record.thicknessMm, 'engineering.thicknessMm'),
    flangeType: requireText(record.flangeType, 'engineering.flangeType'),
  };
}

function validateGasket(engineering, ports) {
  const required = ['nominalDiameterMm', 'thicknessMm', 'gasketType'];
  const record = assertKeys(engineering, required, [], 'engineering');
  requireOpposed(ports, 'GASKET');
  return {
    nominalDiameterMm: positive(record.nominalDiameterMm, 'engineering.nominalDiameterMm'),
    thicknessMm: positive(record.thicknessMm, 'engineering.thicknessMm'),
    gasketType: requireText(record.gasketType, 'engineering.gasketType'),
  };
}

function validateValve(engineering, ports) {
  const record = assertKeys(engineering, ['nominalDiameterMm', 'faceToFaceMm', 'valveType'], ['operatorDirection'], 'engineering');
  requireOpposed(ports, 'VALVE');
  return {
    nominalDiameterMm: positive(record.nominalDiameterMm, 'engineering.nominalDiameterMm'),
    faceToFaceMm: positive(record.faceToFaceMm, 'engineering.faceToFaceMm'),
    valveType: requireText(record.valveType, 'engineering.valveType'),
    ...(record.operatorDirection === undefined ? {} : {
      operatorDirection: normalizeWorldVector(record.operatorDirection, 'engineering.operatorDirection'),
    }),
  };
}

function validateInstrument(engineering, ports) {
  const required = ['nominalDiameterMm', 'faceToFaceMm', 'instrumentType', 'tag'];
  const record = assertKeys(engineering, required, [], 'engineering');
  requireOpposed(ports, 'INSTRUMENT');
  return {
    nominalDiameterMm: positive(record.nominalDiameterMm, 'engineering.nominalDiameterMm'),
    faceToFaceMm: positive(record.faceToFaceMm, 'engineering.faceToFaceMm'),
    instrumentType: requireText(record.instrumentType, 'engineering.instrumentType'),
    tag: requireText(record.tag, 'engineering.tag'),
  };
}

const VALIDATORS = Object.freeze({
  PIPE: validatePipe,
  ELBOW: validateElbow,
  TEE: validateTee,
  REDUCER: validateReducer,
  BRANCH_FITTING: validateBranchFitting,
  FLANGE: validateFlange,
  GASKET: validateGasket,
  VALVE: validateValve,
  INSTRUMENT: validateInstrument,
});

export function rolesFor(componentType) {
  const spec = FAMILY_SPECS[componentType];
  if (!spec) fail(`unsupported componentType ${String(componentType)}.`);
  return [...spec.roles];
}

export function nativeTypeFor(componentType) {
  const spec = FAMILY_SPECS[componentType];
  if (!spec) fail(`unsupported componentType ${String(componentType)}.`);
  return spec.nativeType;
}

export function validateFamilyEvidence(componentType, ports, engineering) {
  rolesFor(componentType);
  return VALIDATORS[componentType](engineering, ports);
}

function spanAxis(ports, label) {
  const delta = ports.L.positionMm.map((value, index) => value - ports.A.positionMm[index]);
  const span = Math.hypot(...delta);
  if (span <= VECTOR_EPSILON) fail(`${label} A/L span must be non-zero.`);
  return { span, axis: delta.map((value) => value / span) };
}

function validateStraightGeometry(entry, ports, expectedLength) {
  const { span, axis } = spanAxis(ports, entry.componentType);
  if (dot(ports.A.direction.vector, axis) > -1 + VECTOR_EPSILON) {
    fail(`${entry.componentType} A direction conflicts with resolved span.`);
  }
  if (dot(ports.L.direction.vector, axis) < 1 - VECTOR_EPSILON) {
    fail(`${entry.componentType} L direction conflicts with resolved span.`);
  }
  if (expectedLength !== undefined && Math.abs(span - expectedLength) > GEOMETRY_EPSILON_MM) {
    fail(`${entry.componentType} mapped length conflicts with resolved span.`);
  }
  return { span, axis };
}

function validateTeeGeometry(entry, ports) {
  const { span, axis } = validateStraightGeometry(entry, ports);
  const offset = ports.P.positionMm.map((value, index) => value - ports.A.positionMm[index]);
  const projection = dot(offset, axis);
  const residual = Math.hypot(...offset.map((value, index) => value - projection * axis[index]));
  if (residual > GEOMETRY_EPSILON_MM || projection < -GEOMETRY_EPSILON_MM || projection > span + GEOMETRY_EPSILON_MM) {
    fail('TEE P must lie on the resolved A/L run span.');
  }
}

function validateElbowGeometry(entry, ports) {
  const delta = ports.L.positionMm.map((value, index) => value - ports.A.positionMm[index]);
  const chord = Math.hypot(...delta);
  const angleRadians = entry.engineering.bendAngleDeg * Math.PI / 180;
  const expectedChord = 2 * entry.engineering.bendRadiusMm * Math.sin(angleRadians / 2);
  if (Math.abs(chord - expectedChord) > GEOMETRY_EPSILON_MM) {
    fail('ELBOW radius and angle conflict with resolved port chord.');
  }
  if (Math.abs(dot(delta, entry.engineering.bendPlaneNormal.vector)) > GEOMETRY_EPSILON_MM) {
    fail('ELBOW resolved chord conflicts with bendPlaneNormal.');
  }
}

export function validateResolvedFamilyEvidence(entry, ports) {
  if (entry.componentType === 'ELBOW') validateElbowGeometry(entry, ports);
  else if (entry.componentType === 'TEE') validateTeeGeometry(entry, ports);
  else if (['FLANGE', 'GASKET'].includes(entry.componentType)) {
    validateStraightGeometry(entry, ports, entry.engineering.thicknessMm);
  } else if (['VALVE', 'INSTRUMENT'].includes(entry.componentType)) {
    const { axis } = validateStraightGeometry(entry, ports, entry.engineering.faceToFaceMm);
    const operator = entry.engineering.operatorDirection?.vector;
    if (operator && Math.abs(dot(operator, axis)) > VECTOR_EPSILON) {
      fail('VALVE operatorDirection must be perpendicular to the run axis.');
    }
  } else validateStraightGeometry(entry, ports);
}
