import { canonicalSemanticJson, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import { comparePsiWriterBundles } from './psi-writer-parity-v2.js';
import { computeSemanticValueHash } from './psi-writer-parity-bundle.js';

export const PSI_WRITER_SELECTION_SCHEMA = 'PsiWriterSelection.v2';
export const PSI_WRITER_OPERATING_MODES = Object.freeze(['LEGACY', 'SHADOW', 'REVIEW', 'ENFORCED']);
export const PSI_WRITER_KINDS = Object.freeze(['CANONICAL', 'SEQUENTIAL']);

export async function selectPsiWriterBundle(rawInput) {
  const input = structuredClone(rawInput || {});
  const mode = text(input.operatingMode).toUpperCase();
  const requestedWriter = text(input.requestedWriter || 'CANONICAL').toUpperCase();
  const blockers = [], reviewItems = [], warnings = [];
  validateMode(mode, blockers);
  if (strictMode(mode)) validateWriter(requestedWriter, blockers);
  if (legacyMode(mode) && !isObject(input.legacyOutput)) blockers.push(issue('LEGACY_OUTPUT_MISSING', { mode }));
  const parity = await obtainParity(input);
  applyParityEvidence(mode, parity, blockers, warnings);
  const parityReport = parity.report;
  const context = evidenceContext(input, parityReport, requestedWriter);
  const preprocessAuditRef = strictMode(mode)
    ? validateEvidenceReference(input.preprocessAuditRef, 'PREPROCESS_AUDIT_REFERENCE', true, context, blockers)
    : null;
  const registryEvidenceRef = strictMode(mode)
    ? validateEvidenceReference(input.registryEvidenceRef, 'REGISTRY_EVIDENCE_REFERENCE', false, context, blockers)
    : null;
  const requestedBundle = requestedWriter === 'SEQUENTIAL' ? input.sequentialBundle : input.canonicalBundle;
  if (strictMode(mode) && parityReport) verifyRequestedBundle(
    requestedBundle, requestedWriter, parityReport, blockers,
  );
  const decision = applyModePolicy({
    mode, requestedWriter, requestedBundle, parityReport, blockers, reviewItems,
    warnings, legacyOutput: input.legacyOutput,
  });
  return buildSelection({
    mode, requestedWriter, parityReport, parityError: parity.error,
    preprocessAuditRef, registryEvidenceRef, decision, blockers, reviewItems, warnings,
  });
}

export async function computePsiWriterSelectionHash(selection) {
  return computeSemanticValueHash(selectionSemantic(selection));
}

async function obtainParity(input) {
  if (!strictInputsPresent(input)) return { report: null, error: 'STRICT_DIAGNOSTIC_INPUT_INCOMPLETE' };
  try { return { report: await comparePsiWriterBundles(input), error: null }; }
  catch (error) { return { report: null, error: text(error?.message) || 'PARITY_COMPARISON_FAILED' }; }
}

function applyParityEvidence(mode, parity, blockers, warnings) {
  if (!parity.report) {
    const row = issue('STRICT_PARITY_REPORT_UNAVAILABLE', { reason: parity.error });
    if (strictMode(mode)) blockers.push(row); else warnings.push(row);
    return;
  }
  warnings.push(...array(parity.report.validation?.warnings));
  if (parity.report.validation?.status !== 'PASS') {
    if (strictMode(mode)) blockers.push(...array(parity.report.validation?.blockers));
    else warnings.push(issue('STRICT_DIAGNOSTIC_BLOCKED', {
      blockerCodes: array(parity.report.validation?.blockers).map((row) => text(row?.code)).sort(),
    }));
  }
}

function validateMode(mode, blockers) {
  if (!PSI_WRITER_OPERATING_MODES.includes(mode)) blockers.push(issue('OPERATING_MODE_INVALID', { mode }));
}
function validateWriter(writer, blockers) {
  if (!PSI_WRITER_KINDS.includes(writer)) blockers.push(issue('WRITER_SELECTION_INVALID', { writer }));
}

function evidenceContext(input, report, requestedWriter) {
  const bundle = requestedWriter === 'SEQUENTIAL' ? input.sequentialBundle : input.canonicalBundle;
  return {
    projectId: text(report?.projectId), zoneId: text(report?.zoneId),
    nodePlanHash: text(report?.nodePlanHash), occurrencePlanHash: text(report?.occurrencePlanHash),
    serializationPlanHash: text(bundle?.serializationPlanHash),
  };
}

function validateEvidenceReference(value, owner, required, context, blockers) {
  if (value === null || value === undefined) {
    if (required) blockers.push(issue(`${owner}_MISSING`));
    return null;
  }
  if (!isObject(value)) {
    blockers.push(issue(`${owner}_INVALID`, { reason: 'NOT_OBJECT' }));
    return null;
  }
  const artifactHash = referenceHash(value);
  const missing = [];
  for (const field of ['schema', 'artifactId', 'projectId', 'zoneId']) if (!text(value[field])) missing.push(field);
  if (owner === 'PREPROCESS_AUDIT_REFERENCE') {
    for (const field of ['nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash']) {
      if (!text(value[field])) missing.push(field);
    }
  }
  if (missing.length) blockers.push(issue(`${owner}_INVALID`, { reason: 'FIELDS_MISSING', fields: missing.sort() }));
  if (!hashPattern(artifactHash)) blockers.push(issue(`${owner}_INVALID`, {
    reason: 'HASH_INVALID', artifactHash,
  }));
  const stale = [];
  for (const field of ['projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash']) {
    if (field in value && text(value[field]) !== text(context[field])) {
      stale.push({ field, expected: text(context[field]), actual: text(value[field]) });
    }
  }
  if (stale.length) blockers.push(issue(`${owner}_STALE`, { stale }));
  return deepFreeze(structuredClone({ ...value, artifactHash }));
}

function verifyRequestedBundle(bundle, writer, report, blockers) {
  if (!isObject(bundle)) {
    blockers.push(issue('SELECTED_BUNDLE_MISSING', { writer }));
    return;
  }
  const side = writer === 'SEQUENTIAL' ? report.sequential : report.canonical;
  const mismatches = [];
  for (const field of ['bundleHash', 'xmlHash', 'traceHash']) {
    if (text(bundle[field]) !== text(side?.[field])) mismatches.push({
      field, selected: text(bundle[field]), report: text(side?.[field]),
    });
  }
  const expectedKind = writer === 'SEQUENTIAL' ? 'SOURCE_SEQUENTIAL' : 'CANONICAL';
  if (text(bundle.projectionKind) !== expectedKind) mismatches.push({
    field: 'projectionKind', expected: expectedKind, actual: text(bundle.projectionKind),
  });
  if (mismatches.length) blockers.push(issue('XML_TRACE_BUNDLE_MISMATCH', {
    reason: 'SELECTED_BUNDLE_NOT_IN_PARITY_REPORT', writer, mismatches,
  }));
  if (bundle.validation?.status !== 'PASS') blockers.push(issue('OUTPUT_VALIDATION_NOT_PASS', {
    owner: `SELECTED_${writer}`, status: bundle.validation?.status,
  }));
}

function applyModePolicy(context) {
  const { mode, requestedBundle, parityReport, blockers, reviewItems, warnings, legacyOutput } = context;
  if (blockers.length) return noSelection('BLOCKED');
  if (mode === 'LEGACY') return legacyDecision(legacyOutput, parityReport);
  if (mode === 'SHADOW') {
    warnings.push(issue('SHADOW_STRICT_OUTPUT_NOT_SELECTABLE'));
    return {
      authority: 'LEGACY', productionBundle: null, proposedBundle: null,
      legacyOutput: cloneOrNull(legacyOutput),
      strictDiagnosticStatus: parityReport?.validation?.status || 'UNAVAILABLE',
    };
  }
  if (mode === 'REVIEW') {
    reviewItems.push(issue('PRODUCTION_APPROVAL_REQUIRED', { requestedWriter: context.requestedWriter }));
    return {
      authority: 'STRICT_REVIEW', productionBundle: null,
      proposedBundle: cloneBundle(requestedBundle), legacyOutput: null,
    };
  }
  if (mode === 'ENFORCED') {
    return {
      authority: 'STRICT_ENFORCED', productionBundle: cloneBundle(requestedBundle),
      proposedBundle: null, legacyOutput: null,
    };
  }
  return noSelection('BLOCKED');
}

function legacyDecision(legacyOutput, parityReport) {
  return {
    authority: 'LEGACY', productionBundle: null, proposedBundle: null,
    legacyOutput: cloneOrNull(legacyOutput),
    strictDiagnosticStatus: parityReport?.validation?.status || 'UNAVAILABLE',
  };
}
function noSelection(reason) {
  return {
    authority: 'NONE', productionBundle: null, proposedBundle: null,
    legacyOutput: null, strictDiagnosticStatus: 'BLOCKED', reason,
  };
}

async function buildSelection(context) {
  const blockers = dedupeIssues(context.blockers), reviewItems = dedupeIssues(context.reviewItems);
  const validation = {
    status: blockers.length ? 'BLOCKED' : (reviewItems.length ? 'REVIEW_REQUIRED' : 'PASS'),
    blockers, reviewItems, warnings: dedupeIssues(context.warnings),
  };
  const selection = {
    schema: PSI_WRITER_SELECTION_SCHEMA,
    operatingMode: context.mode, requestedWriter: context.requestedWriter,
    authority: context.decision.authority,
    selectedBundleHash: text(context.decision.productionBundle?.bundleHash),
    proposedBundleHash: text(context.decision.proposedBundle?.bundleHash),
    strictDiagnosticStatus: context.decision.strictDiagnosticStatus
      || context.parityReport?.validation?.status || 'UNAVAILABLE',
    parityReport: context.parityReport,
    parityReportHash: text(context.parityReport?.parityReportHash),
    parityError: context.parityError,
    preprocessAuditRef: context.preprocessAuditRef,
    registryEvidenceRef: context.registryEvidenceRef,
    productionBundle: context.decision.productionBundle,
    proposedBundle: context.decision.proposedBundle,
    legacyOutput: context.decision.legacyOutput,
    fallbackApplied: false,
    validation,
  };
  selection.selectionHash = await computePsiWriterSelectionHash(selection);
  return deepFreeze(selection);
}

function selectionSemantic(value) {
  return {
    schema: value?.schema, operatingMode: value?.operatingMode,
    requestedWriter: value?.requestedWriter, authority: value?.authority,
    selectedBundleHash: value?.selectedBundleHash,
    proposedBundleHash: value?.proposedBundleHash,
    strictDiagnosticStatus: value?.strictDiagnosticStatus,
    parityReportHash: value?.parityReportHash, parityError: value?.parityError,
    preprocessAuditHash: referenceHash(value?.preprocessAuditRef),
    registryEvidenceHash: referenceHash(value?.registryEvidenceRef),
    fallbackApplied: value?.fallbackApplied, validation: value?.validation,
  };
}

function strictInputsPresent(input) {
  return ['occurrencePlan', 'nodePlan', 'canonicalBundle', 'sequentialBundle']
    .every((field) => isObject(input?.[field]));
}
function strictMode(mode) { return ['REVIEW', 'ENFORCED'].includes(mode); }
function legacyMode(mode) { return ['LEGACY', 'SHADOW'].includes(mode); }
function referenceHash(value) { return text(value?.artifactHash || value?.hash || value?.refHash); }
function hashPattern(value) { return /^sha256:[a-f0-9]{64}$/.test(text(value)); }
function cloneBundle(value) { return deepFreeze(structuredClone(value)); }
function cloneOrNull(value) {
  return value === null || value === undefined ? null : deepFreeze(structuredClone(value));
}
function dedupeIssues(rows) {
  const seen = new Set(), result = [];
  for (const row of rows) {
    const key = canonicalSemanticJson(row);
    if (!seen.has(key)) { seen.add(key); result.push(row); }
  }
  return result.sort((a, b) => text(a?.code).localeCompare(text(b?.code))
    || canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)));
}
function issue(code, evidence = {}) { return { code, evidence }; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
