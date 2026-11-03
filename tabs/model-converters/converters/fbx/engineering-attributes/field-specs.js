const FAMILY_ORDER = Object.freeze([
  'PIPE', 'ELBOW', 'TEE', 'REDUCER', 'BRANCH_FITTING',
  'FLANGE', 'GASKET', 'VALVE', 'INSTRUMENT',
]);

const NATIVE_TYPES = Object.freeze({
  PIPE: 'PIPE',
  ELBOW: 'ELBO',
  TEE: 'TEE',
  REDUCER: 'REDU',
  BRANCH_FITTING: 'OLET',
  FLANGE: 'FLAN',
  GASKET: 'GASK',
  VALVE: 'VALV',
  INSTRUMENT: 'INST',
});

function field(name, valueType, options = {}) {
  return Object.freeze({
    name,
    valueType,
    required: options.required !== false,
    allowedValues: options.allowedValues ? Object.freeze([...options.allowedValues]) : null,
  });
}

const FIELD_SPECS = Object.freeze({
  PIPE: Object.freeze([]),
  ELBOW: Object.freeze([
    field('bendRadiusMm', 'positive-number'),
    field('bendAngleDeg', 'positive-number'),
    field('bendPlaneNormal', 'world-vector'),
  ]),
  TEE: Object.freeze([
    field('runDiameterMm', 'positive-number'),
    field('branchDiameterMm', 'positive-number'),
  ]),
  REDUCER: Object.freeze([
    field('largeEndDiameterMm', 'positive-number'),
    field('smallEndDiameterMm', 'positive-number'),
    field('largeEndPortId', 'text'),
    field('smallEndPortId', 'text'),
    field('reducerType', 'enum', { allowedValues: ['CONCENTRIC', 'ECCENTRIC'] }),
    field('eccentricDirection', 'world-vector', { required: false }),
  ]),
  BRANCH_FITTING: Object.freeze([
    field('largePortDiameterMm', 'positive-number'),
    field('smallPortDiameterMm', 'positive-number'),
    field('largePortId', 'text'),
    field('smallPortId', 'text'),
    field('branchFittingType', 'text'),
  ]),
  FLANGE: Object.freeze([
    field('nominalDiameterMm', 'positive-number'),
    field('thicknessMm', 'positive-number'),
    field('flangeType', 'text'),
  ]),
  GASKET: Object.freeze([
    field('nominalDiameterMm', 'positive-number'),
    field('thicknessMm', 'positive-number'),
    field('gasketType', 'text'),
  ]),
  VALVE: Object.freeze([
    field('nominalDiameterMm', 'positive-number'),
    field('faceToFaceMm', 'positive-number'),
    field('valveType', 'text'),
    field('operatorDirection', 'world-vector', { required: false }),
  ]),
  INSTRUMENT: Object.freeze([
    field('nominalDiameterMm', 'positive-number'),
    field('faceToFaceMm', 'positive-number'),
    field('instrumentType', 'text'),
    field('tag', 'text'),
  ]),
});

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function finiteVector(value) {
  return Array.isArray(value) && value.length === 3
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function worldVector(value) {
  const record = objectRecord(value);
  return Boolean(record && record.authority === 'world-vector' && finiteVector(record.vector));
}

function validByType(spec, value) {
  if (spec.valueType === 'positive-number') return typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (spec.valueType === 'text') return typeof value === 'string' && Boolean(value.trim());
  if (spec.valueType === 'enum') return spec.allowedValues.includes(value);
  if (spec.valueType === 'world-vector') return worldVector(value);
  return false;
}

function normalizeNumber(value) {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeValue(value) {
  if (typeof value === 'number') return normalizeNumber(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  const record = objectRecord(value);
  if (!record) return value;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalizeValue(record[key])]));
}

export const ENGINEERING_ATTRIBUTE_PROFILE = Object.freeze({
  schema: 'FbxEngineeringAttributeProfile.v1',
  fieldAuthority: 'APPROVED_MAPPING',
  generatedComponentPolicy: 'NO_ENGINEERING_INHERITANCE',
  sourceAttributeInference: false,
  geometryAttributeInference: false,
  optionalValuesRemainUnresolved: true,
});

export function compareEngineeringText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

export function engineeringFamilyOrder() {
  return [...FAMILY_ORDER];
}

export function nativeTypeForEngineeringFamily(componentType) {
  return NATIVE_TYPES[componentType] || null;
}

export function engineeringFieldSpecs(componentType) {
  const values = FIELD_SPECS[componentType];
  if (!values) throw new TypeError(`Unsupported engineering component family: ${String(componentType)}`);
  return values.map((item) => ({ ...item, allowedValues: item.allowedValues ? [...item.allowedValues] : null }));
}

export function engineeringFieldNames(componentType) {
  return engineeringFieldSpecs(componentType).map((item) => item.name);
}

export function engineeringFieldSpec(componentType, fieldName) {
  return engineeringFieldSpecs(componentType).find((item) => item.name === fieldName) || null;
}

export function validEngineeringFieldValue(spec, value) {
  return Boolean(spec && validByType(spec, value));
}

export function normalizedEngineeringValue(value) {
  return normalizeValue(value);
}

export function equalEngineeringValues(left, right) {
  return JSON.stringify(normalizeValue(left)) === JSON.stringify(normalizeValue(right));
}

export function displayEngineeringValue(value) {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(normalizeNumber(value));
  return JSON.stringify(normalizeValue(value));
}
