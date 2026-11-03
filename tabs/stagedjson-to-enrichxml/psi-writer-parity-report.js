import { canonicalSemanticJson } from '../../contracts/topo-enriched-xml/contract-core.js';
import { PSIWRITERPARITYREPORT_V2 } from '../../contracts/topo-enriched-xml/contracts.js';
import { computeSemanticValueHash } from './psi-writer-parity-bundle.js';

export const PSI_WRITER_PARITY_REPORT_SCHEMA = 'PsiWriterParityReport.v2';

const DIMENSIONS = Object.freeze([
  'OCCURRENCE_PLAN_HASH', 'NODE_PLAN_HASH', 'EMITTED_OCCURRENCE_SET', 'NODE_CARDINALITY',
  'NODE_NUMBER', 'COMPONENT_PROJECTION', 'ENDPOINT_SEMANTICS', 'ENGINEERING_CONTENT',
  'SOURCE_BOUNDARY', 'BRANCH_CONDITION', 'TRACE_CARDINALITY', 'TRACE_IDENTITY',
  'XML_TRACE_BUNDLE', 'RESERVED_OCCURRENCE', 'OUTPUT_VALIDATION',
]);
const BLOCKER_ORDER = Object.freeze([
  'OCCURRENCE_PLAN_HASH_MISMATCH', 'NODE_PLAN_HASH_MISMATCH',
  'EMITTED_OCCURRENCE_SET_MISMATCH', 'NODE_CARDINALITY_MISMATCH',
  'NODE_NUMBER_MISMATCH', 'COMPONENT_PROJECTION_MISMATCH',
  'ENDPOINT_SEMANTICS_MISMATCH', 'ENGINEERING_CONTENT_MISMATCH',
  'SOURCE_BOUNDARY_MISMATCH', 'BRANCH_CONDITION_MISMATCH',
  'TRACE_CARDINALITY_MISMATCH', 'TRACE_IDENTITY_MISMATCH',
  'XML_TRACE_BUNDLE_MISMATCH', 'RESERVED_OCCURRENCE_MISMATCH',
  'OUTPUT_VALIDATION_NOT_PASS',
]);

export async function buildPsiWriterParityReport({ state, canonicalBundle, sequentialBundle, gates }) {
  const differences = sortDifferences(state.differences);
  const blockers = blockerEvidence(differences);
  const validation = {
    status: blockers.length ? 'BLOCKED' : 'PASS', blockers, reviewItems: [],
    warnings: sortEvidence(state.warnings),
  };
  const report = {
    schema: PSI_WRITER_PARITY_REPORT_SCHEMA,
    projectId: text(state.occurrencePlan?.projectId), zoneId: text(state.occurrencePlan?.zoneId),
    nodePlanHash: text(state.nodePlan?.nodePlanHash),
    occurrencePlanHash: text(state.occurrencePlan?.occurrencePlanHash),
    canonical: paritySide(canonicalBundle, state),
    sequential: paritySide(sequentialBundle, state),
    differences, gates, validation,
  };
  report.parityReportHash = await computePsiWriterParityReportHash(report);
  const errors = PSIWRITERPARITYREPORT_V2.validate(report);
  if (errors.length) throw new TypeError(`PsiWriterParityReport.v2 validation failed: ${errors.join('; ')}`);
  return PSIWRITERPARITYREPORT_V2.freeze(report);
}

export async function computePsiWriterParityReportHash(report) {
  const { parityReportHash: ignored, ...semantic } = report || {};
  return computeSemanticValueHash(semantic);
}

function paritySide(bundle, state) {
  return {
    nodePlanHash: text(state.nodePlan?.nodePlanHash), occurrencePlanHash: text(state.occurrencePlan?.occurrencePlanHash),
    xmlHash: text(bundle?.xmlHash), traceHash: text(bundle?.traceHash),
    bundleHash: text(bundle?.bundleHash),
    emittedOccurrenceCount: Number(bundle?.summary?.emittedOccurrenceCount ?? array(bundle?.trace).length),
    reservedOccurrenceCount: Number(bundle?.summary?.reservedOccurrenceCount ?? state.reservedCount),
  };
}

function blockerEvidence(differences) {
  const byCode = new Map();
  for (const row of differences) {
    const evidence = byCode.get(row.code) || [];
    evidence.push({ key: row.key, evidence: row.evidence });
    byCode.set(row.code, evidence);
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => blockerRank(a) - blockerRank(b) || a.localeCompare(b))
    .map(([code, evidence]) => ({ code, evidence: sortEvidence(evidence) }));
}

function sortDifferences(rows) {
  return [...rows].sort((a, b) => dimensionRank(a.dimension) - dimensionRank(b.dimension)
    || a.code.localeCompare(b.code) || a.key.localeCompare(b.key)
    || canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)));
}

function sortEvidence(rows) {
  return [...rows].sort((a, b) => canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)));
}

function dimensionRank(value) {
  const index = DIMENSIONS.indexOf(value);
  return index < 0 ? DIMENSIONS.length : index;
}

function blockerRank(value) {
  const index = BLOCKER_ORDER.indexOf(value);
  return index < 0 ? BLOCKER_ORDER.length : index;
}

function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
