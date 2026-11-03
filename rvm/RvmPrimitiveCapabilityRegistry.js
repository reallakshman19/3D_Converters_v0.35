export const RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION = '20260628-rvm-primitive-capability-registry-1';

export const RVM_PRIMITIVE_WRITER_STATUS = Object.freeze({
  STABLE: 'stable-writer-ready',
  EXPLICIT_LEGACY_UNLOCK: 'explicit-legacy-unlock-required',
  BLOCKED: 'blocked',
  DIAGNOSTIC_ONLY: 'diagnostic-only',
});

export const RVM_PRIMITIVE_CODES = Object.freeze({
  PYRAMID: 1,
  BOX: 2,
  OBSERVED_CODE_3: 3,
  TORUS: 4,
  OBSERVED_CODE_5: 5,
  SNOUT: 7,
  CYLINDER: 8,
  SPHERE: 9,
  OBSERVED_CODE_11: 11,
});

const REGISTRY = new Map([
  [1, {
    code: 1,
    name: 'PYRAMID',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.STABLE,
    observedBodyLength: null,
    writerPayloadWords: 'current writer/decoder family: transform + local bbox + code payload',
    notes: 'Known emitted writer layout from current decoder classification.',
  }],
  [2, {
    code: 2,
    name: 'BOX',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.STABLE,
    observedBodyLength: null,
    writerPayloadWords: 3,
    notes: 'Stable legacy writer primitive used for boxes and fallback glyph bodies.',
  }],
  [3, {
    code: 3,
    name: 'OBSERVED_CODE_3',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.BLOCKED,
    observedBodyLength: 96,
    writerPayloadWords: null,
    notes: 'RHBG-observed payload family; decode/write layout is not source-level certified.',
  }],
  [4, {
    code: 4,
    name: 'TORUS',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.EXPLICIT_LEGACY_UNLOCK,
    unlockKey: 'legacy-inputxml-rvm-torus',
    observedBodyLength: 92,
    writerPayloadWords: 3,
    notes: 'Legacy inputxml-rvm writer emits this for bends/elbows, but it is not globally stable-writer-ready.',
  }],
  [5, {
    code: 5,
    name: 'OBSERVED_CODE_5',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.BLOCKED,
    observedBodyLength: 88,
    writerPayloadWords: null,
    notes: 'RHBG-observed payload family; blocked until payload semantics are proven.',
  }],
  [7, {
    code: 7,
    name: 'SNOUT',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.EXPLICIT_LEGACY_UNLOCK,
    unlockKey: 'legacy-inputxml-rvm-snout',
    observedBodyLength: 116,
    writerPayloadWords: 9,
    notes: 'Legacy inputxml-rvm writer emits this for reducers/valve bonnets, but it is not globally stable-writer-ready.',
  }],
  [8, {
    code: 8,
    name: 'CYLINDER',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.STABLE,
    observedBodyLength: null,
    writerPayloadWords: 2,
    notes: 'Stable current writer primitive for pipes and cylinder-based fittings.',
  }],
  [9, {
    code: 9,
    name: 'SPHERE',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.STABLE,
    observedBodyLength: null,
    writerPayloadWords: 'current writer/decoder family: transform + local bbox + code payload',
    notes: 'Known emitted writer layout from current decoder classification.',
  }],
  [11, {
    code: 11,
    name: 'OBSERVED_CODE_11',
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.BLOCKED,
    observedBodyLength: 708,
    writerPayloadWords: null,
    notes: 'Large RHBG-observed payload family; blocked from writer use until decoded and certified.',
  }],
]);

export function getRvmPrimitiveCapability(code) {
  const normalizedCode = Number(code);
  const entry = REGISTRY.get(normalizedCode);
  if (entry) return Object.freeze({ ...entry });
  return Object.freeze({
    code: normalizedCode,
    name: `UNKNOWN_${Number.isFinite(normalizedCode) ? normalizedCode : 'NaN'}`,
    writerStatus: RVM_PRIMITIVE_WRITER_STATUS.BLOCKED,
    observedBodyLength: null,
    writerPayloadWords: null,
    notes: 'Unknown RVM primitive code; writer use is blocked by default.',
  });
}

export function listRvmPrimitiveCapabilities() {
  return [...REGISTRY.values()].map((entry) => Object.freeze({ ...entry }));
}

export function isStableRvmPrimitiveWriterCode(code) {
  return getRvmPrimitiveCapability(code).writerStatus === RVM_PRIMITIVE_WRITER_STATUS.STABLE;
}

export function isBlockedRvmPrimitiveCode(code) {
  return getRvmPrimitiveCapability(code).writerStatus === RVM_PRIMITIVE_WRITER_STATUS.BLOCKED;
}

export function canEmitRvmPrimitiveCode(code, options = {}) {
  const capability = getRvmPrimitiveCapability(code);
  if (capability.writerStatus === RVM_PRIMITIVE_WRITER_STATUS.STABLE) return true;
  if (capability.writerStatus === RVM_PRIMITIVE_WRITER_STATUS.EXPLICIT_LEGACY_UNLOCK) {
    return String(options.unlockKey || '') === String(capability.unlockKey || '');
  }
  return false;
}

export function assertRvmPrimitiveCodeEmitAllowed(code, options = {}) {
  if (canEmitRvmPrimitiveCode(code, options)) return getRvmPrimitiveCapability(code);
  const capability = getRvmPrimitiveCapability(code);
  const context = options.context ? ` in ${options.context}` : '';
  const suffix = capability.unlockKey ? `; required unlock key: ${capability.unlockKey}` : '';
  throw new Error(`RVM primitive code ${capability.code} (${capability.name}) is not writer-ready${context}; status=${capability.writerStatus}${suffix}`);
}
