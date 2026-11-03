export const INLINE_ASSEMBLY_FAMILY_ORDER = Object.freeze([
  'FLANGE', 'GASKET', 'BLIND', 'VALVE', 'INSTRUMENT',
]);

const SPECS = Object.freeze({
  FLANGE: Object.freeze({
    outerTypes: Object.freeze(['FLAN', 'FLANGE']),
    rawTypes: Object.freeze(['FLAN', 'FLANGE']),
    topologyDispositions: Object.freeze(['SHORT_TWO_PORT', 'STRAIGHT_TWO_PORT']),
    candidateCounts: Object.freeze([2]),
    nativeMappingPortCounts: Object.freeze([2]),
  }),
  GASKET: Object.freeze({
    outerTypes: Object.freeze(['GASK', 'GASKET']),
    rawTypes: Object.freeze(['GASK', 'GASKET']),
    topologyDispositions: Object.freeze(['SHORT_TWO_PORT']),
    candidateCounts: Object.freeze([2]),
    nativeMappingPortCounts: Object.freeze([2]),
  }),
  BLIND: Object.freeze({
    outerTypes: Object.freeze(['FLAN', 'FLANGE']),
    rawTypes: Object.freeze(['FBLI', 'FBLIND', 'BLIND']),
    topologyDispositions: Object.freeze(['REJECTED']),
    candidateCounts: Object.freeze([1]),
    nativeMappingPortCounts: Object.freeze([]),
  }),
  VALVE: Object.freeze({
    outerTypes: Object.freeze(['VALV', 'VALVE']),
    rawTypes: Object.freeze(['VALV', 'VALVE']),
    topologyDispositions: Object.freeze(['SHORT_TWO_PORT', 'STRAIGHT_TWO_PORT']),
    candidateCounts: Object.freeze([2]),
    nativeMappingPortCounts: Object.freeze([2]),
  }),
  INSTRUMENT: Object.freeze({
    outerTypes: Object.freeze(['INST', 'INSTRUMENT']),
    rawTypes: Object.freeze(['INST', 'INSTRUMENT']),
    topologyDispositions: Object.freeze([
      'SHORT_TWO_PORT', 'STRAIGHT_TWO_PORT', 'BENT_TWO_PORT', 'THREE_PORT',
    ]),
    candidateCounts: Object.freeze([2, 3]),
    nativeMappingPortCounts: Object.freeze([2]),
  }),
});

export function inlineAssemblySpec(family) {
  return SPECS[family] || null;
}

export function inlineAssemblyFamilyOf(record) {
  for (const family of INLINE_ASSEMBLY_FAMILY_ORDER) {
    if (SPECS[family].rawTypes.includes(record?.rawType)) return family;
  }
  for (const family of INLINE_ASSEMBLY_FAMILY_ORDER.filter((value) => value !== 'BLIND')) {
    if (SPECS[family].outerTypes.includes(record?.outerType)) return family;
  }
  return null;
}

export function candidateCountAccepted(family, count) {
  return Boolean(SPECS[family]?.candidateCounts.includes(count));
}

export function nativeMappingSupportedFor(family, portCount) {
  return Boolean(SPECS[family]?.nativeMappingPortCounts.includes(portCount));
}

export function topologyAccepted(family, disposition, rejectionReasons = []) {
  if (!SPECS[family]?.topologyDispositions.includes(disposition)) return false;
  if (family !== 'BLIND') return true;
  return rejectionReasons.includes('ZERO_OR_ONE_PORT');
}

export function portRolesFor(family, count) {
  if (family === 'BLIND') return Object.freeze(['MATING_FACE']);
  if (family === 'INSTRUMENT') {
    return Object.freeze(Array.from({ length: count }, (_, index) => `PORT_${index + 1}`));
  }
  return Object.freeze(['FACE_A', 'FACE_L']);
}

export function inlineManagedVocabulary() {
  return Object.freeze(Object.fromEntries(INLINE_ASSEMBLY_FAMILY_ORDER.map((family) => [
    family, Object.freeze({
      outerTypes: [...SPECS[family].outerTypes],
      rawTypes: [...SPECS[family].rawTypes],
    }),
  ])));
}
