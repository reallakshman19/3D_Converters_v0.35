import {
  DATA_QUALIFICATION_STATES,
  METHOD_QUALIFICATION_STATES,
} from './contracts.js';

const METHOD_ORDER = Object.freeze([
  'CONCEPT', 'SOURCE_INVENTORIED', 'METHOD_SPECIFIED', 'IMPLEMENTED',
  'BENCHMARK_ONLY', 'SCREENING', 'PROJECT_APPROVED', 'VERIFIED', 'PRODUCTION_AUTHORIZED',
]);

const DATA_TO_METHOD = Object.freeze({
  DRAFT: 'CONCEPT',
  BENCHMARK_ONLY: 'BENCHMARK_ONLY',
  SCREENING: 'SCREENING',
  PROJECT_APPROVED: 'PROJECT_APPROVED',
  VERIFIED: 'VERIFIED',
  RETIRED: 'BLOCKED',
});

function assertMethodState(value) {
  if (!METHOD_QUALIFICATION_STATES.includes(value)) throw new RangeError(`Invalid method qualification: ${value}`);
  return value;
}

function assertDataState(value) {
  if (!DATA_QUALIFICATION_STATES.includes(value)) throw new RangeError(`Invalid data qualification: ${value}`);
  return value;
}

function lowerMethodState(method, data) {
  if (method === 'BLOCKED' || data === 'RETIRED') return 'BLOCKED';
  const dataAsMethod = DATA_TO_METHOD[data];
  const index = Math.min(METHOD_ORDER.indexOf(method), METHOD_ORDER.indexOf(dataAsMethod));
  return METHOD_ORDER[Math.max(index, 0)];
}

export function composeEngineeringQualification({
  method,
  data = 'DRAFT',
  designAuthority = false,
  reasons = [],
} = {}) {
  const methodState = assertMethodState(method);
  const dataState = assertDataState(data);
  const effective = lowerMethodState(methodState, dataState);
  const authorityStates = new Set(['PROJECT_APPROVED', 'VERIFIED', 'PRODUCTION_AUTHORIZED']);
  return Object.freeze({
    method: methodState,
    data: dataState,
    effective,
    designAuthority: Boolean(designAuthority) && authorityStates.has(effective),
    reasons: Object.freeze([...new Set(reasons.filter(Boolean))]),
  });
}

export function minimumDataQualification(states, fallback = 'DRAFT') {
  const values = states.filter((state) => DATA_QUALIFICATION_STATES.includes(state));
  if (!values.length) return fallback;
  const order = ['DRAFT', 'BENCHMARK_ONLY', 'SCREENING', 'PROJECT_APPROVED', 'VERIFIED'];
  if (values.includes('RETIRED')) return 'RETIRED';
  return values.reduce((lowest, state) => order.indexOf(state) < order.indexOf(lowest) ? state : lowest, values[0]);
}
