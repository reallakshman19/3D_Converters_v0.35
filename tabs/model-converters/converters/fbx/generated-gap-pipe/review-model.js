import { generatedGapPipeProfileDisclosure } from './profile.js';

export function unavailableGeneratedGapPipeReview(mappingStatus) {
  return Object.freeze({
    schema: 'FbxGeneratedGapPipeReviewModel.v1',
    status: 'MAPPING_REQUIRED',
    mappingStatus,
    message: 'Generated gap-pipe review requires approved mapped StagedJSON.',
    counts: Object.freeze({ generatedPipeCount: 0, blockedCandidateCount: 0 }),
    rows: Object.freeze([]),
    profileDisclosure: generatedGapPipeProfileDisclosure(),
  });
}

function rowOf(record) {
  return Object.freeze({
    generatedLogicalComponentId: record.generatedLogicalComponentId,
    branchId: record.branchId,
    sourcePairKey: record.sourcePairKey,
    sourceOccurrenceIds: record.sourceOccurrenceIds.join(', '),
    lengthMm: record.lengthMm,
    disposition: record.disposition,
    blockingReason: record.blockingReasons.join(', ') || null,
  });
}

export function buildGeneratedGapPipeReviewModel(evidence, mappingStatus) {
  if (!evidence) return unavailableGeneratedGapPipeReview(mappingStatus);
  const generated = evidence.counts.generatedPipeCount;
  const blocked = evidence.counts.blockedCandidateCount;
  return Object.freeze({
    schema: 'FbxGeneratedGapPipeReviewModel.v1',
    status: evidence.status,
    mappingStatus,
    message: generated || blocked
      ? `${generated} generated gap PIPE component(s); ${blocked} blocked provenance record(s).`
      : 'No generated gap PIPE was required in the selected zone.',
    counts: Object.freeze({ generatedPipeCount: generated, blockedCandidateCount: blocked }),
    rows: Object.freeze(evidence.records.map(rowOf)),
    profileDisclosure: generatedGapPipeProfileDisclosure(evidence.profile),
  });
}
