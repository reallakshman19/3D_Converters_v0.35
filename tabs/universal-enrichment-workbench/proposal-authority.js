import { graphComparisonIdentity } from './comparison-identity.js';
import { findJsonSafetyErrors } from './extraction-rule.js';
import { validateComparisonReviewLedger } from './review-ledger.js';

function addSchemaError(errors, artifact, schema, label) {
  if (artifact?.schema !== schema) errors.push(`${label} schema must be ${schema}.`);
  if (!artifact?.validation?.ok) errors.push(`${label} validation status is not valid.`);
}

function graphMetadataErrors(upstream) {
  const errors = []; const expected = graphComparisonIdentity(upstream?.graph);
  const artifacts = [
    ['Candidate ledger', upstream?.ledger], ['Binding config', upstream?.config],
    ['Comparison run', upstream?.run], ['Review ledger', upstream?.reviewLedger],
    ['Attachment set', upstream?.attachmentSet],
  ];
  for (const [label, artifact] of artifacts) {
    for (const [key, value] of Object.entries(expected)) {
      if (artifact?.[key] !== value) errors.push(`${label} graph metadata mismatch: ${key}.`);
    }
  }
  return errors;
}

function identityErrors(upstream) {
  const errors = []; const review = upstream?.reviewLedger;
  if (upstream?.config?.ledgerId !== upstream?.ledger?.ledgerId
    || upstream?.run?.ledgerId !== upstream?.ledger?.ledgerId
    || review?.ledgerId !== upstream?.ledger?.ledgerId) errors.push('Candidate-ledger identity mismatch.');
  if (upstream?.run?.bindingConfigId !== upstream?.config?.bindingConfigId
    || review?.bindingConfigId !== upstream?.config?.bindingConfigId) errors.push('Binding-config identity mismatch.');
  if (review?.comparisonRunId !== upstream?.run?.comparisonRunId) errors.push('Comparison-run identity mismatch.');
  if (upstream?.config?.attachmentSetIdentity !== upstream?.run?.attachmentSetIdentity
    || review?.attachmentSetIdentity !== upstream?.run?.attachmentSetIdentity) errors.push('Attachment-set identity mismatch.');
  return errors;
}

function schemaErrors(upstream) {
  const errors = [];
  addSchemaError(errors, upstream?.graph, 'UniversalSourceGraph.v1', 'Graph');
  addSchemaError(errors, upstream?.ledger, 'FieldCandidateLedger.v1', 'Candidate ledger');
  addSchemaError(errors, upstream?.config, 'MasterFieldBindingConfig.v1', 'Binding config');
  addSchemaError(errors, upstream?.run, 'CandidateComparisonRun.v1', 'Comparison run');
  addSchemaError(errors, upstream?.reviewLedger, 'ComparisonReviewLedger.v1', 'Review ledger');
  addSchemaError(errors, upstream?.attachmentSet, 'MasterAttachmentSet.v1', 'Attachment set');
  if (!Array.isArray(upstream?.registry?.datasets)) errors.push('Master Registry datasets must be an array.');
  return errors;
}

function appendValidation(target, validation, label) {
  const errors = validation?.errors || []; const warnings = validation?.warnings || [];
  target.errors.push(...errors.map((error) => `${label}: ${error}`));
  target.warnings.push(...warnings.map((warning) => `${label}: ${warning}`));
  if (validation?.ok === false && !errors.length) target.errors.push(`${label}: validation failed without findings.`);
}

export async function validateEnrichmentProposalAuthority(upstream = {}, dependencies = {}) {
  const errors = [...schemaErrors(upstream), ...graphMetadataErrors(upstream), ...identityErrors(upstream)];
  const warnings = [];
  const validateReview = dependencies.validateComparisonReviewLedger || validateComparisonReviewLedger;
  try {
    const reviewUpstream = {
      graph: upstream.graph, ledger: upstream.ledger, config: upstream.config, run: upstream.run,
      attachmentSet: upstream.attachmentSet, registry: upstream.registry,
    };
    const result = await validateReview(upstream.reviewLedger, reviewUpstream, dependencies);
    appendValidation({ errors, warnings }, result, 'Review ledger');
  } catch (error) {
    errors.push(`Review-ledger validation failed: ${error.message}`);
  }
  errors.push(...findJsonSafetyErrors(upstream, 'Proposal authority'));
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
