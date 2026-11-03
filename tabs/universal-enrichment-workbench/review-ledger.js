import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import { graphComparisonIdentity } from './comparison-identity.js';
import { sha256Hex } from './source-envelope.js';
import {
  normalizeComparisonReviewDraft, normalizeReviewNote, REVIEW_DISPOSITIONS,
  reviewNoteCodePointLength, reviewSubjectKey,
} from './review-draft.js';
import {
  createComparisonReviewDecisionId, createComparisonReviewLedgerId,
} from './review-identity.js';
import { validateComparisonReviewAuthority } from './review-authority.js';

export const REVIEW_LIMITS = Object.freeze({ subjects: 50000, noteCodePoints: 1000, csvRows: 50000 });

export class ComparisonReviewBuildError extends Error {
  constructor(code, message) { super(message); this.name = 'ComparisonReviewBuildError'; this.code = code; }
}

function fail(code, message) { throw new ComparisonReviewBuildError(code, message); }

export function createComparisonReviewSubjects(run) {
  const runResults = Array.isArray(run?.results) ? run.results : [];
  const runUnbound = Array.isArray(run?.unbound) ? run.unbound : [];
  const results = runResults.map((result) => ({
    subjectKind: 'comparison-result', ...result,
  }));
  const unbound = runUnbound.map((item) => ({
    subjectKind: 'unbound-candidate', comparisonResultId: '', bindingId: '', datasetId: '',
    columnId: '', comparisonStatus: 'unbound', matches: [], ...item,
  }));
  return [...results, ...unbound];
}

function subjectStatus(subject) {
  return subject.subjectKind === 'comparison-result' ? subject.status : 'unbound';
}

function draftMap(drafts, subjects) {
  const map = new Map();
  if (drafts instanceof Map) drafts.forEach((value, key) => map.set(key, value));
  else if (Array.isArray(drafts)) drafts.forEach((value) => map.set(value.subjectKey, value));
  else Object.entries(drafts || {}).forEach(([key, value]) => map.set(key, value));
  return new Map(subjects.map((subject) => {
    const key = reviewSubjectKey(subject); return [key, normalizeComparisonReviewDraft(map.get(key), subject)];
  }));
}

function selectedMatchFor(subject, draft) {
  if (draft.disposition !== 'confirm-match') return null;
  const match = (subject.matches || []).find((item) => item.matchId === draft.selectedMatchId);
  if (match) return { ...match };
  return draft.selectedMatchId ? {
    matchId: draft.selectedMatchId, rowId: '', rowSourceOrder: -1,
    masterValue: null, normalizedMasterValue: null,
  } : null;
}

function projectDecisionBase(subject, sourceOrder, draft) {
  return {
    reviewDecisionId: '', sourceOrder, subjectKind: subject.subjectKind,
    comparisonResultId: subject.subjectKind === 'comparison-result' ? subject.comparisonResultId : '',
    entryId: subject.entryId, candidateId: subject.candidateId, entityId: subject.entityId,
    fieldKey: subject.fieldKey, bindingId: subject.subjectKind === 'comparison-result' ? subject.bindingId : '',
    datasetId: subject.subjectKind === 'comparison-result' ? subject.datasetId : '',
    columnId: subject.subjectKind === 'comparison-result' ? subject.columnId : '',
    comparisonStatus: subjectStatus(subject), disposition: draft.disposition,
    selectedMatch: selectedMatchFor(subject, draft), note: draft.note,
  };
}

async function projectDecision(run, subject, sourceOrder, draft, hashText) {
  const decision = projectDecisionBase(subject, sourceOrder, draft);
  decision.reviewDecisionId = await createComparisonReviewDecisionId(run.comparisonRunId, decision, hashText);
  return decision;
}

export function summarizeComparisonReviewLedger(ledger) {
  const decisions = ledger?.decisions || [];
  return {
    decisionCount: decisions.length,
    unreviewedCount: decisions.filter((item) => item.disposition === 'unreviewed').length,
    confirmedCount: decisions.filter((item) => item.disposition === 'confirm-match').length,
    rejectedCount: decisions.filter((item) => item.disposition === 'reject-result').length,
    deferredCount: decisions.filter((item) => item.disposition === 'defer').length,
    comparisonSubjectCount: decisions.filter((item) => item.subjectKind === 'comparison-result').length,
    unboundSubjectCount: decisions.filter((item) => item.subjectKind === 'unbound-candidate').length,
  };
}

function subjectFields(subject) {
  return {
    subjectKind: subject.subjectKind,
    comparisonResultId: subject.subjectKind === 'comparison-result' ? subject.comparisonResultId : '',
    entryId: subject.entryId, candidateId: subject.candidateId, entityId: subject.entityId,
    fieldKey: subject.fieldKey, bindingId: subject.subjectKind === 'comparison-result' ? subject.bindingId : '',
    datasetId: subject.subjectKind === 'comparison-result' ? subject.datasetId : '',
    columnId: subject.subjectKind === 'comparison-result' ? subject.columnId : '',
    comparisonStatus: subjectStatus(subject),
  };
}

function samePrimitiveEvidence(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function selectedMatchErrors(decision, subject, index) {
  const errors = []; const confirmed = decision.disposition === 'confirm-match';
  if (!confirmed && decision.selectedMatch !== null) errors.push(`Decision ${index} retains a selected match without confirmation.`);
  if (!confirmed) return errors;
  if (!['unique-match','multiple-match'].includes(subjectStatus(subject))) errors.push(`Decision ${index} cannot confirm ${subjectStatus(subject)} evidence.`);
  if (!decision.selectedMatch) return [...errors, `Decision ${index} confirmation requires a selected match.`];
  const expected = (subject.matches || []).find((match) => match.matchId === decision.selectedMatch.matchId);
  if (!expected) errors.push(`Decision ${index} selected match does not belong to its result.`);
  else if (!samePrimitiveEvidence(expected, decision.selectedMatch)) errors.push(`Decision ${index} selected-match evidence mismatch.`);
  return errors;
}

function noteErrors(decision, index) {
  const errors = [];
  if (typeof decision.note !== 'string') return [`Decision ${index} note must be a string.`];
  if (normalizeReviewNote(decision.note) !== decision.note) errors.push(`Decision ${index} note newlines are not normalized.`);
  if (reviewNoteCodePointLength(decision.note) > REVIEW_LIMITS.noteCodePoints) errors.push(`Decision ${index} note exceeds ${REVIEW_LIMITS.noteCodePoints} code points.`);
  if (decision.disposition === 'unreviewed' && /\b(confirm(?:ed)?|reject(?:ed)?|defer(?:red)?)\b/iu.test(decision.note)) errors.push(`Decision ${index} unreviewed note implies a completed decision.`);
  return errors;
}

async function decisionErrors(ledger, upstream, hashText) {
  const errors = []; const decisions = Array.isArray(ledger?.decisions) ? ledger.decisions : [];
  const subjects = createComparisonReviewSubjects(upstream?.run); const ids = new Set(); const subjectIds = new Set();
  if (decisions.length !== subjects.length) errors.push('Review decisions must completely cover comparison results and unbound candidates.');
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]; const subject = subjects[index];
    if (!subject) { errors.push(`Decision ${index} has no authoritative subject.`); continue; }
    if (decision.sourceOrder !== index) errors.push(`Decision ${index} sourceOrder mismatch.`);
    const expectedFields = subjectFields(subject);
    for (const [key, value] of Object.entries(expectedFields)) if (!samePrimitiveEvidence(decision[key], value)) errors.push(`Decision ${index} ${key} evidence mismatch.`);
    if (!REVIEW_DISPOSITIONS.includes(decision.disposition)) errors.push(`Decision ${index} disposition is unsupported.`);
    errors.push(...selectedMatchErrors(decision, subject, index), ...noteErrors(decision, index));
    const expectedId = await createComparisonReviewDecisionId(upstream.run.comparisonRunId, decision, hashText);
    if (decision.reviewDecisionId !== expectedId) errors.push(`Decision ${index} identity mismatch.`);
    if (ids.has(decision.reviewDecisionId)) errors.push(`Duplicate review decision ID ${decision.reviewDecisionId}.`); ids.add(decision.reviewDecisionId);
    const subjectId = reviewSubjectKey(subject); if (subjectIds.has(subjectId)) errors.push(`Duplicate review subject ${subjectId}.`); subjectIds.add(subjectId);
  }
  return errors;
}

function ledgerMetadataErrors(ledger, upstream) {
  const errors = []; const { graph, ledger: candidateLedger, config, run } = upstream || {};
  if (ledger?.schema !== 'ComparisonReviewLedger.v1') errors.push('Review ledger schema must be ComparisonReviewLedger.v1.');
  const graphIdentity = graphComparisonIdentity(graph);
  for (const [key, value] of Object.entries(graphIdentity)) if (ledger?.[key] !== value) errors.push(`Review ledger graph metadata mismatch: ${key}.`);
  if (ledger?.ledgerId !== candidateLedger?.ledgerId) errors.push('Review ledger candidate-ledger identity mismatch.');
  if (ledger?.bindingConfigId !== config?.bindingConfigId) errors.push('Review ledger binding-config identity mismatch.');
  if (ledger?.comparisonRunId !== run?.comparisonRunId) errors.push('Review ledger comparison-run identity mismatch.');
  if (ledger?.attachmentSetIdentity !== run?.attachmentSetIdentity) errors.push('Review ledger attachment identity mismatch.');
  return errors;
}

export async function validateComparisonReviewLedger(ledger, upstream, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex; const authority = await validateComparisonReviewAuthority(upstream, dependencies);
  const errors = [...authority.errors, ...ledgerMetadataErrors(ledger, upstream), ...findJsonSafetyErrors(ledger, 'Review ledger')];
  if (!Array.isArray(ledger?.decisions)) errors.push('Review ledger decisions must be an array.');
  else errors.push(...await decisionErrors(ledger, upstream, hashText));
  const expectedSummary = summarizeComparisonReviewLedger(ledger);
  if (JSON.stringify(ledger?.summary) !== JSON.stringify(expectedSummary)) errors.push('Review ledger summary mismatch.');
  if (Array.isArray(ledger?.decisions)) {
    const expectedId = await createComparisonReviewLedgerId(upstream.graph, upstream.ledger.ledgerId,
      upstream.config.bindingConfigId, upstream.run.comparisonRunId, upstream.run.attachmentSetIdentity,
      ledger.decisions, hashText);
    if (ledger.reviewLedgerId !== expectedId) errors.push('Review ledger identity mismatch.');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: authority.warnings };
}

export async function createComparisonReviewLedger(upstream, drafts = {}, dependencies = {}) {
  const subjects = createComparisonReviewSubjects(upstream?.run);
  if (subjects.length > REVIEW_LIMITS.subjects) fail('SUBJECT_LIMIT', `Review subject limit ${REVIEW_LIMITS.subjects} exceeded.`);
  const authority = await validateComparisonReviewAuthority(upstream, dependencies);
  if (!authority.ok) fail('INVALID_AUTHORITY', authority.errors.join(' '));
  const normalizedDrafts = draftMap(drafts, subjects); const hashText = dependencies.hashText || sha256Hex;
  for (const draft of normalizedDrafts.values()) {
    if (typeof draft.note !== 'string') fail('INVALID_NOTE', 'Review notes must be strings.');
    if (reviewNoteCodePointLength(draft.note) > REVIEW_LIMITS.noteCodePoints) fail('NOTE_LIMIT', `Review note limit ${REVIEW_LIMITS.noteCodePoints} exceeded.`);
  }
  const decisions = [];
  for (let index = 0; index < subjects.length; index += 1) {
    const subject = subjects[index]; decisions.push(await projectDecision(upstream.run, subject, index, normalizedDrafts.get(reviewSubjectKey(subject)), hashText));
  }
  const base = {
    schema: 'ComparisonReviewLedger.v1', reviewLedgerId: '', ...graphComparisonIdentity(upstream.graph),
    ledgerId: upstream.ledger.ledgerId, bindingConfigId: upstream.config.bindingConfigId,
    comparisonRunId: upstream.run.comparisonRunId, attachmentSetIdentity: upstream.run.attachmentSetIdentity,
    decisions, summary: null, validation: { ok: false, errors: [], warnings: [] },
  };
  base.summary = summarizeComparisonReviewLedger(base);
  base.reviewLedgerId = await createComparisonReviewLedgerId(upstream.graph, base.ledgerId,
    base.bindingConfigId, base.comparisonRunId, base.attachmentSetIdentity, decisions, hashText);
  base.validation = await validateComparisonReviewLedger(base, upstream, { ...dependencies, hashText });
  return deepFreezeArtifact(base);
}

export function serializeComparisonReviewLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}
