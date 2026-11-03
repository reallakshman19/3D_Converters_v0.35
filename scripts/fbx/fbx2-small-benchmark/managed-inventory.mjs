const SUPPORT_TYPES = new Set([
  'SUPPORT', 'ATTA', 'REST', 'GUIDE', 'STOP', 'WP', 'BP', 'SPR',
]);
const FAMILY_BY_TYPE = Object.freeze({
  PIPE: 'PIPE',
  ELBO: 'ELBOW',
  BEND: 'ELBOW',
  TEE: 'TEE',
  REDU: 'REDUCER',
  OLET: 'BRANCH_FITTING',
  FLAN: 'INLINE_ASSEMBLY',
  FBLI: 'INLINE_ASSEMBLY',
  FBLIND: 'INLINE_ASSEMBLY',
  BLIND: 'INLINE_ASSEMBLY',
  GASK: 'INLINE_ASSEMBLY',
  VALV: 'INLINE_ASSEMBLY',
  INST: 'INLINE_ASSEMBLY',
  SUPPORT: 'SUPPORT',
  ATTA: 'SUPPORT',
  REST: 'SUPPORT',
  GUIDE: 'SUPPORT',
  STOP: 'SUPPORT',
  WP: 'SUPPORT',
  BP: 'SUPPORT',
  SPR: 'SUPPORT',
});

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function upper(value) {
  return text(value)?.toUpperCase() ?? null;
}

function exactArray(attributes, keys) {
  for (const key of keys) {
    if (!Array.isArray(attributes[key])) continue;
    return [...new Set(attributes[key].map(text).filter(Boolean))].sort(compareText);
  }
  return [];
}

function exactValue(attributes, keys) {
  for (const key of keys) {
    const value = text(attributes[key]);
    if (value !== null) return value;
  }
  return null;
}

function vector(value) {
  if (Array.isArray(value) && value.length >= 3) {
    const result = value.slice(0, 3).map(Number);
    return result.every(Number.isFinite) ? result : null;
  }
  if (typeof value === 'string') {
    const parts = value.trim().split(/[\s,;]+/).filter(Boolean).slice(0, 3).map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
  }
  return null;
}

function exactVector(attributes, keys) {
  for (const key of keys) {
    const result = vector(attributes[key]);
    if (result) return result;
  }
  return null;
}

function nestedValue(attributes, keys) {
  const containers = [
    attributes,
    objectValue(attributes.mappingEngineering),
    objectValue(attributes.mappingEngineering?.identity),
    objectValue(attributes.mappingEngineering?.support),
    objectValue(attributes.mappingEngineering?.association),
  ];
  for (const container of containers) {
    const result = exactValue(container, keys);
    if (result !== null) return result;
  }
  return null;
}

function branchIdentity(branch, branchIndex) {
  const attributes = objectValue(branch?.attributes);
  const identity = text(attributes.REF ?? branch?.id ?? branch?.name);
  return {
    branchId: identity ?? `benchmark-branch-${String(branchIndex + 1).padStart(4, '0')}`,
    identityDisposition: identity ? 'EXPLICIT' : 'BENCHMARK_POSITIONAL_FALLBACK',
  };
}

function componentIdentity(branchId, child, childIndex) {
  const attributes = objectValue(child?.attributes);
  const identity = text(attributes.REF ?? child?.id ?? attributes.mappingEntryId ?? child?.name);
  return {
    managedRecordId: identity
      ? `${branchId}::${identity}`
      : `${branchId}::benchmark-child-${String(childIndex + 1).padStart(4, '0')}`,
    reference: identity,
    identityDisposition: identity ? 'EXPLICIT' : 'BENCHMARK_POSITIONAL_FALLBACK',
  };
}

function generationEvidence(attributes) {
  const mapped = objectValue(attributes.mappingEngineering?.generationProvenance);
  const method = exactValue(attributes, ['generationMethod', 'GENERATION_METHOD'])
    ?? text(mapped.generationMethod);
  const generated = attributes.AUTO_GENERATED_PIPE === true
    || upper(attributes.AUTO_GENERATED_PIPE) === 'TRUE'
    || attributes.generated === true || upper(attributes.generated) === 'TRUE'
    || mapped.generated === true || method !== null;
  return {
    generated,
    generationMethod: generated ? method : null,
    generationDisposition: !generated ? 'NOT_APPLICABLE'
      : method ? 'EVIDENCED' : 'UNRESOLVED',
  };
}

function rawTypeOf(child) {
  const attributes = objectValue(child?.attributes);
  return upper(attributes.RAW_TYPE ?? attributes.TYPE ?? child?.type) ?? 'UNKNOWN';
}

function sourceIdentity(attributes) {
  return {
    sourceOccurrenceId: exactValue(attributes, [
      'sourceOccurrenceId', 'SOURCE_OCCURRENCE_ID', 'sourceGeometryOccurrenceId',
    ]),
    sourceModelObjectId: exactValue(attributes, [
      'sourceModelObjectId', 'SOURCE_MODEL_OBJECT_ID', 'SOURCE_OBJECT_ID',
    ]),
    sourceGeometryObjectIds: exactArray(attributes, [
      'sourceGeometryObjectIds', 'SOURCE_GEOMETRY_OBJECT_IDS',
    ]),
  };
}

function matchingEvidence(attributes, child, identity) {
  const matchingTags = [...new Set([
    identity.reference,
    text(child?.name),
    exactValue(attributes, ['NAME', 'TAG', 'SUPPORT_TAG', 'SUPPORT_REF', 'REF']),
  ].filter(Boolean).map((value) => value.toUpperCase()))].sort(compareText);
  return {
    branchSequence: Number.isInteger(child.__benchmarkSequence)
      ? child.__benchmarkSequence : null,
    managedPositionMm: exactVector(attributes, ['POS', 'POSITION', 'POSITION_MM']),
    managedEndpointAMm: exactVector(attributes, ['APOS', 'A_POS', 'START_POS']),
    managedEndpointBMm: exactVector(attributes, ['LPOS', 'BPOS', 'B_POS', 'END_POS']),
    explicitHostReference: nestedValue(attributes, [
      'HOST_REF', 'HOST_COMPONENT_REF', 'ATTACHED_COMPONENT_REF',
      'COMPONENT_REF', 'PIPE_REF', 'PARENT_REF',
    ]),
    matchingTags,
  };
}

function managedComponent(branchInfo, child, childIndex) {
  const attributes = objectValue(child?.attributes);
  const identity = componentIdentity(branchInfo.branchId, child, childIndex);
  const rawType = rawTypeOf(child);
  const sequenceChild = { ...child, __benchmarkSequence: childIndex };
  return {
    ...identity,
    branchId: branchInfo.branchId,
    branchIdentityDisposition: branchInfo.identityDisposition,
    outerType: upper(child?.type) ?? 'UNKNOWN',
    rawType,
    family: FAMILY_BY_TYPE[rawType] ?? FAMILY_BY_TYPE[upper(child?.type)] ?? 'UNSUPPORTED',
    supportByCurrentAuthority: SUPPORT_TYPES.has(rawType) || SUPPORT_TYPES.has(upper(child?.type)),
    displayName: text(attributes.NAME ?? child?.name),
    ...sourceIdentity(attributes),
    ...generationEvidence(attributes),
    ...matchingEvidence(attributes, sequenceChild, identity),
  };
}

function familyCounts(components) {
  const counts = new Map();
  for (const component of components) {
    counts.set(component.family, (counts.get(component.family) || 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

function rawTypeCounts(components) {
  const counts = new Map();
  for (const component of components) {
    counts.set(component.rawType, (counts.get(component.rawType) || 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

function inventoryBranch(branch, branchIndex) {
  if (!Array.isArray(branch?.children)) {
    throw new TypeError(`FBX2 small benchmark branch ${branchIndex} children must be an array.`);
  }
  const identity = branchIdentity(branch, branchIndex);
  return {
    ...identity,
    childCount: branch.children.length,
    components: branch.children.map((child, index) => managedComponent(identity, child, index)),
  };
}

function validateUnique(records) {
  const ids = new Set(records.map((record) => record.managedRecordId));
  if (ids.size !== records.length) {
    throw new TypeError('FBX2 small benchmark managed record identities are not unique.');
  }
}

export function managedFamilyForType(value) {
  return FAMILY_BY_TYPE[upper(value)] ?? 'UNSUPPORTED';
}

export function inventoryFbx2ManagedStage(stagedBranches) {
  if (!Array.isArray(stagedBranches)) {
    throw new TypeError('FBX2 small benchmark managed stage root must be an array.');
  }
  const branches = stagedBranches.map(inventoryBranch)
    .sort((left, right) => compareText(left.branchId, right.branchId));
  const components = branches.flatMap((branch) => branch.components);
  validateUnique(components);
  return Object.freeze({
    branches: Object.freeze(branches.map((branch) => Object.freeze({
      branchId: branch.branchId,
      identityDisposition: branch.identityDisposition,
      childCount: branch.childCount,
    }))),
    components: Object.freeze(components.map(Object.freeze)),
    summary: Object.freeze({
      branchCount: branches.length,
      componentCount: components.length,
      supportComponentCount: components.filter((item) => item.family === 'SUPPORT').length,
      unsupportedComponentCount: components.filter((item) => item.family === 'UNSUPPORTED').length,
      generatedComponentCount: components.filter((item) => item.generated).length,
      positionalIdentityCount: components.filter((item) => (
        item.identityDisposition !== 'EXPLICIT' || item.branchIdentityDisposition !== 'EXPLICIT'
      )).length,
      familyCounts: Object.freeze(familyCounts(components)),
      rawTypeCounts: Object.freeze(rawTypeCounts(components)),
    }),
  });
}
