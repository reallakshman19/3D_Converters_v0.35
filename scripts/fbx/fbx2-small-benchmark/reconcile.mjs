import {
  bindingFor,
  buildReconciliationIndexes,
  exactSourceRecord,
} from './reconcile-indexes.mjs';

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function orderedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText);
}

function unresolved(record, binding, reason) {
  return {
    status: 'UNRESOLVED', disposition: reason,
    exactSourceOccurrenceId: binding.exact,
    candidateSourceOccurrenceIds: binding.candidates,
    reasons: [reason],
  };
}

function blocked(record, binding, reason, reasons = [reason]) {
  return {
    status: 'BLOCKED', disposition: reason,
    exactSourceOccurrenceId: binding.exact,
    candidateSourceOccurrenceIds: binding.candidates,
    reasons: orderedUnique(reasons),
  };
}

function generatedDisposition(record, binding) {
  const reason = record.generationDisposition === 'EVIDENCED'
    ? 'REFERENCE_GENERATED_COMPONENT_NOT_REPLAYED'
    : 'GENERATED_PROVENANCE_UNRESOLVED';
  return unresolved(record, binding, reason);
}

function pipeDisposition(binding, indexes) {
  const classification = indexes.pipe.get(binding.exact);
  if (!classification) return {
    status: 'BLOCKED', disposition: 'PIPE_EVIDENCE_MISSING', reasons: ['PIPE_EVIDENCE_MISSING'],
  };
  if (classification.admitted === true) return {
    status: 'PASS', disposition: 'PIPE_GEOMETRY_PARITY_PASS', reasons: [],
  };
  return { status: 'BLOCKED', disposition: 'PIPE_GEOMETRY_PARITY_BLOCKED',
    reasons: [classification.reason || 'PIPE_ADMISSION_BLOCKED'] };
}

function taxonomyNormalization(record, binding, indexes) {
  const sourceRawType = exactSourceRecord(binding.exact, indexes)?.rawType?.toUpperCase() ?? null;
  return record.rawType === 'FLAN' && ['FBLIND', 'FBLI', 'BLIND'].includes(sourceRawType)
    ? 'FBLIND_TO_FLAN' : null;
}

function fittingDisposition(record, binding, indexes) {
  const evidence = indexes.family[record.family]?.get(record.managedRecordId);
  if (!evidence) return {
    status: 'BLOCKED', disposition: 'FAMILY_EVIDENCE_MISSING', reasons: ['FAMILY_EVIDENCE_MISSING'],
  };
  if (evidence.disposition === 'ADMITTED') {
    const normalization = taxonomyNormalization(record, binding, indexes);
    return normalization
      ? { status: 'PASS', disposition: 'NORMALIZED_SOURCE_TAXONOMY',
        reasons: [normalization, `${record.family}_GEOMETRY_PARITY_PASS`] }
      : { status: 'PASS', disposition: `${record.family}_GEOMETRY_PARITY_PASS`, reasons: [] };
  }
  return { status: 'BLOCKED', disposition: `${record.family}_GEOMETRY_PARITY_BLOCKED`,
    reasons: orderedUnique(evidence.blockingReasons || ['FAMILY_EVIDENCE_BLOCKED']) };
}

function crossZoneSupportDisposition(binding) {
  if (binding.association?.status !== 'PASS'
      || binding.association.disposition !== 'MATCHED_CROSS_ZONE_SUPPORT') return null;
  return { status: 'PASS', disposition: 'MATCHED_CROSS_ZONE_SUPPORT',
    reasons: orderedUnique(binding.association.reasons || []) };
}

function selectedSupportDisposition(binding, indexes) {
  const candidate = indexes.support.candidateByOccurrence.get(binding.exact);
  if (!candidate) return { status: 'BLOCKED', disposition: 'SUPPORT_CANDIDATE_NOT_EVIDENCED',
    reasons: ['SUPPORT_CANDIDATE_NOT_EVIDENCED'] };
  const host = indexes.support.hostByOccurrence.get(binding.exact);
  if (!host) return { status: 'BLOCKED', disposition: 'SUPPORT_HOST_EVIDENCE_MISSING',
    reasons: ['SUPPORT_HOST_EVIDENCE_MISSING'] };
  if (['SINGLE_HOST_PROVED', 'MULTI_HOST_PROVED'].includes(host.hostDisposition)) {
    return { status: 'PASS', disposition: 'SUPPORT_HOST_PARITY_PASS', reasons: host.reasons || [] };
  }
  return { status: 'BLOCKED', disposition: 'SUPPORT_HOST_PARITY_BLOCKED',
    reasons: orderedUnique(host.reasons || [host.hostDisposition]) };
}

function supportDisposition(binding, indexes) {
  const crossZone = crossZoneSupportDisposition(binding);
  if (crossZone) return crossZone;
  if (!binding.selected && binding.exact) return {
    status: 'BLOCKED', disposition: 'CROSS_ZONE_SUPPORT_ASSOCIATION_MISSING',
    reasons: ['CROSS_ZONE_SUPPORT_ASSOCIATION_MISSING'],
  };
  return selectedSupportDisposition(binding, indexes);
}

function exactDisposition(record, binding, indexes) {
  if (record.family === 'PIPE') return pipeDisposition(binding, indexes);
  if (record.family === 'SUPPORT') return supportDisposition(binding, indexes);
  if (indexes.family[record.family]) return fittingDisposition(record, binding, indexes);
  return unresolved(record, binding, 'UNSUPPORTED_MANAGED_FAMILY');
}

function missingBindingDisposition(record, binding) {
  if (record.rawType === 'GASK' && binding.candidates.length === 0) {
    return blocked(record, binding, 'SOURCE_NOT_EXPORTED_AS_STANDALONE_GEOMETRY');
  }
  if (record.family === 'SUPPORT' && binding.association?.status === 'BLOCKED') {
    return blocked(record, binding, binding.association.disposition,
      binding.association.reasons || [binding.association.disposition]);
  }
  const reason = binding.disposition === 'SOURCE_OCCURRENCE_CANDIDATES'
    ? 'NON_AUTHORITATIVE_SOURCE_CANDIDATES'
    : binding.disposition === 'UNRESOLVED_SOURCE_BINDING'
      ? 'EXPLICIT_SOURCE_BINDING_OUTSIDE_SELECTED_ZONE'
      : 'EXACT_SOURCE_BINDING_MISSING';
  return unresolved(record, binding, reason);
}

function recordDisposition(record, indexes) {
  const binding = bindingFor(record, indexes);
  if (record.identityDisposition !== 'EXPLICIT'
      || record.branchIdentityDisposition !== 'EXPLICIT') {
    return unresolved(record, binding, 'MANAGED_IDENTITY_NOT_EXPLICIT');
  }
  if (record.generated) return generatedDisposition(record, binding);
  if (!binding.exact) return missingBindingDisposition(record, binding);
  const result = exactDisposition(record, binding, indexes);
  return { ...result, exactSourceOccurrenceId: binding.exact, candidateSourceOccurrenceIds: [] };
}

function benchmarkRecord(record, indexes) {
  return Object.freeze({
    managedRecordId: record.managedRecordId, branchId: record.branchId,
    reference: record.reference, outerType: record.outerType, rawType: record.rawType,
    family: record.family, generated: record.generated,
    generationMethod: record.generationMethod, ...recordDisposition(record, indexes),
  });
}

function countRecords(records, family, status) {
  return records.filter((record) => (!family || record.family === family)
    && (!status || record.status === status)).length;
}

function familySummary(records) {
  return orderedUnique(records.map((record) => record.family)).map((family) => {
    const total = countRecords(records, family), pass = countRecords(records, family, 'PASS');
    const blockedCount = countRecords(records, family, 'BLOCKED');
    const unresolvedCount = total - pass - blockedCount;
    return Object.freeze({ family, total, pass, blocked: blockedCount,
      unresolved: unresolvedCount, parityRatio: total ? pass / total : 0 });
  });
}

function summaryOf(records) {
  const total = records.length, pass = countRecords(records, null, 'PASS');
  const blockedCount = countRecords(records, null, 'BLOCKED');
  const unresolvedCount = total - pass - blockedCount;
  return Object.freeze({
    managedComponentCount: total, terminalDispositionCount: total, passCount: pass,
    blockedCount, unresolvedCount, coverageRatio: total ? 1 : 0,
    parityRatio: total ? pass / total : 0, parityTargetRatio: 1,
    parityTargetMet: total > 0 && pass === total,
  });
}

export function reconcileFbx2SmallBenchmark(input = {}) {
  if (!Array.isArray(input.managedInventory?.components)
      || !Array.isArray(input.sourceInventory?.records)) {
    throw new TypeError('FBX2 small benchmark managed and source inventories are required.');
  }
  const indexes = buildReconciliationIndexes(input);
  const records = input.managedInventory.components.map((record) => benchmarkRecord(record, indexes));
  return Object.freeze({ records: Object.freeze(records),
    familySummary: Object.freeze(familySummary(records)), summary: summaryOf(records) });
}
