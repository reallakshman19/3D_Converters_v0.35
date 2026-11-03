import { graphComparisonIdentity } from './comparison-identity.js';
import {
  createMasterAttachmentSetIdentity,
  validateMasterFieldBindingConfig,
} from './comparison-binding.js';
import { validateCandidateComparisonRun } from './comparison-run.js';
import { findJsonSafetyErrors } from './extraction-rule.js';
import { validateMasterAttachmentSet } from './master-attachments.js';
import { validateMasterDataset } from './master-dataset.js';
import { sha256Hex } from './source-envelope.js';

function list(value) {
  return Array.isArray(value) ? value : [];
}

function addArtifactErrors(errors, artifact, schema, label) {
  if (artifact?.schema !== schema) errors.push(`${label} schema must be ${schema}.`);
  if (!artifact?.validation?.ok) errors.push(`${label} validation status is not valid.`);
}

function metadataMismatch(artifact, graph) {
  const expected = graphComparisonIdentity(graph);
  return Object.entries(expected).some(([key, value]) => artifact?.[key] !== value);
}

function contiguousIdentityErrors(items, label, idKey, orderKey = 'sourceOrder') {
  const errors = [];
  const ids = new Set();
  items.forEach((item, index) => {
    if (item?.[orderKey] !== index) errors.push(`${label} ${index} order mismatch.`);
    const id = item?.[idKey];
    if (!id) errors.push(`${label} ${index} identity is empty.`);
    else if (ids.has(id)) errors.push(`${label} contains duplicate identity ${id}.`);
    if (id) ids.add(id);
  });
  return errors;
}

function graphErrors(graph) {
  const errors = [];
  addArtifactErrors(errors, graph, 'UniversalSourceGraph.v1', 'Graph');
  if (!Array.isArray(graph?.entities)) return [...errors, 'Graph entities must be an array.'];
  errors.push(...contiguousIdentityErrors(graph.entities, 'Graph entity', 'entityId'));
  return errors;
}

function ledgerErrors(ledger, graph) {
  const errors = [];
  addArtifactErrors(errors, ledger, 'FieldCandidateLedger.v1', 'Candidate ledger');
  if (metadataMismatch(ledger, graph)) errors.push('Candidate ledger graph identity mismatch.');
  if (!Array.isArray(ledger?.entries)) return [...errors, 'Candidate ledger entries must be an array.'];
  errors.push(...contiguousIdentityErrors(ledger.entries, 'Candidate ledger entry', 'entryId'));
  const entityIds = new Set(list(graph?.entities).map((entity) => entity.entityId));
  const candidateIds = new Set();
  ledger.entries.forEach((entry, index) => {
    if (!entityIds.has(entry.entityId)) errors.push(`Candidate ledger entry ${index} references an unknown entity.`);
    if (!['candidate', 'rejected'].includes(entry.status)) errors.push(`Candidate ledger entry ${index} status is invalid.`);
    if (!Array.isArray(entry.candidates)) errors.push(`Candidate ledger entry ${index} candidates must be an array.`);
    if (entry.status === 'rejected' && list(entry.candidates).length) errors.push(`Rejected ledger entry ${index} contains candidates.`);
    for (const candidate of list(entry.candidates)) {
      if (!candidate?.candidateId) errors.push(`Candidate ledger entry ${index} contains an empty candidate identity.`);
      else if (candidateIds.has(candidate.candidateId)) errors.push(`Duplicate candidate ID ${candidate.candidateId}.`);
      if (candidate?.candidateId) candidateIds.add(candidate.candidateId);
    }
  });
  return errors;
}

function registryErrors(registry) {
  const errors = [];
  if (!Array.isArray(registry?.datasets)) return ['Master Registry datasets must be an array.'];
  const ids = new Set();
  registry.datasets.forEach((dataset, index) => {
    if (!dataset?.datasetId) errors.push(`Master Registry dataset ${index} identity is empty.`);
    else if (ids.has(dataset.datasetId)) errors.push(`Master Registry contains duplicate dataset ${dataset.datasetId}.`);
    if (dataset?.datasetId) ids.add(dataset.datasetId);
  });
  return errors;
}

function attachmentShapeErrors(attachmentSet, graph, registry) {
  const errors = [];
  addArtifactErrors(errors, attachmentSet, 'MasterAttachmentSet.v1', 'Attachment set');
  if (metadataMismatch(attachmentSet, graph)) errors.push('Attachment-set graph identity mismatch.');
  if (!Array.isArray(attachmentSet?.attachments)) return [...errors, 'Attachment references must be an array.'];
  const datasets = new Map(list(registry?.datasets).map((dataset) => [dataset.datasetId, dataset]));
  const seen = new Set();
  attachmentSet.attachments.forEach((attachment, index) => {
    if (attachment.attachmentOrder !== index) errors.push(`Attachment ${index} order mismatch.`);
    if (seen.has(attachment.datasetId)) errors.push(`Duplicate attachment ${attachment.datasetId}.`);
    seen.add(attachment.datasetId);
    const dataset = datasets.get(attachment.datasetId);
    if (!dataset) errors.push(`Attached dataset ${attachment.datasetId} is absent from the current registry.`);
    else if (dataset.datasetRole !== attachment.datasetRole) errors.push(`Attached dataset ${attachment.datasetId} role mismatch.`);
  });
  return errors;
}

function crossArtifactErrors(graph, ledger, config, run) {
  const errors = [];
  addArtifactErrors(errors, config, 'MasterFieldBindingConfig.v1', 'Binding config');
  addArtifactErrors(errors, run, 'CandidateComparisonRun.v1', 'Comparison run');
  if (!Array.isArray(config?.bindings)) errors.push('Binding config bindings must be an array.');
  if (!Array.isArray(run?.results)) errors.push('Comparison run results must be an array.');
  if (!Array.isArray(run?.unbound)) errors.push('Comparison run unbound evidence must be an array.');
  if (config?.ledgerId !== ledger?.ledgerId || run?.ledgerId !== ledger?.ledgerId) errors.push('Ledger identity mismatch across review authorities.');
  if (run?.bindingConfigId !== config?.bindingConfigId) errors.push('Binding-config identity mismatch across review authorities.');
  if (metadataMismatch(config, graph) || metadataMismatch(run, graph)) errors.push('Graph identity mismatch across review authorities.');
  return errors;
}

function comparisonResultShapeErrors(run) {
  const errors = [];
  list(run?.results).forEach((result, index) => {
    if (!Array.isArray(result?.matches)) {
      errors.push(`Comparison result ${index} matches must be an array.`);
      return;
    }
    const expectedStatus = result.matches.length === 0
      ? 'unmatched' : result.matches.length === 1 ? 'unique-match' : 'multiple-match';
    if (result.status !== expectedStatus) {
      errors.push(`Comparison result ${index} status/match-count mismatch.`);
    }
  });
  return errors;
}

function appendValidation(target, validation, label) {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  target.errors.push(...errors.map((error) => `${label}: ${error}`));
  target.warnings.push(...warnings.map((warning) => `${label}: ${warning}`));
  if (validation?.ok === false && errors.length === 0) target.errors.push(`${label}: validation failed without findings.`);
}

async function validateAttachments(attachmentSet, graph, registry, dependencies) {
  const result = { errors: [], warnings: [] };
  const validateSet = dependencies.validateMasterAttachmentSet || validateMasterAttachmentSet;
  try {
    appendValidation(result, await validateSet(attachmentSet, graph, registry), 'Attachment set');
  } catch (error) {
    result.errors.push(`Attachment-set validation failed: ${error.message}`);
  }
  const datasets = new Map(list(registry?.datasets).map((dataset) => [dataset.datasetId, dataset]));
  const validateDataset = dependencies.validateMasterDataset || validateMasterDataset;
  for (const attachment of list(attachmentSet?.attachments)) {
    const dataset = datasets.get(attachment.datasetId);
    if (!dataset) continue;
    try {
      appendValidation(result, await validateDataset(dataset, dependencies), `Dataset ${attachment.datasetId}`);
    } catch (error) {
      result.errors.push(`Dataset ${attachment.datasetId} validation failed: ${error.message}`);
    }
  }
  return result;
}

async function validateConfigAndRun(upstream, dependencies, hashText) {
  const { graph, ledger, config, run, attachmentSet, registry } = upstream;
  const result = { errors: [], warnings: [] };
  const validateConfig = dependencies.validateMasterFieldBindingConfig || validateMasterFieldBindingConfig;
  const validateRun = dependencies.validateCandidateComparisonRun || validateCandidateComparisonRun;
  try {
    appendValidation(result, await validateConfig(
      config, graph, ledger, attachmentSet, registry, { ...dependencies, hashText },
    ), 'Binding config');
  } catch (error) {
    result.errors.push(`Binding config validation failed: ${error.message}`);
  }
  try {
    appendValidation(result, await validateRun(
      run, graph, ledger, config, attachmentSet, registry, { ...dependencies, hashText },
    ), 'Comparison run');
  } catch (error) {
    result.errors.push(`Comparison-run validation failed: ${error.message}`);
  }
  return result;
}

export async function validateComparisonReviewAuthority(upstream = {}, dependencies = {}) {
  const { graph, ledger, config, run, attachmentSet, registry } = upstream;
  const hashText = dependencies.hashText || sha256Hex;
  const errors = [
    ...graphErrors(graph),
    ...ledgerErrors(ledger, graph),
    ...registryErrors(registry),
    ...attachmentShapeErrors(attachmentSet, graph, registry),
    ...crossArtifactErrors(graph, ledger, config, run),
    ...comparisonResultShapeErrors(run),
  ];
  const warnings = [];
  let attachmentSetIdentity = '';
  if (Array.isArray(attachmentSet?.attachments)) {
    try {
      attachmentSetIdentity = await createMasterAttachmentSetIdentity(graph, attachmentSet, hashText);
    } catch (error) {
      errors.push(`Attachment-set identity validation failed: ${error.message}`);
    }
  }
  if (config?.attachmentSetIdentity !== attachmentSetIdentity
    || run?.attachmentSetIdentity !== attachmentSetIdentity) {
    errors.push('Attachment-set identity mismatch across review authorities.');
  }
  const attachmentValidation = await validateAttachments(attachmentSet, graph, registry, { ...dependencies, hashText });
  const projectionValidation = await validateConfigAndRun(upstream, dependencies, hashText);
  errors.push(...attachmentValidation.errors, ...projectionValidation.errors);
  warnings.push(...attachmentValidation.warnings, ...projectionValidation.warnings);
  errors.push(...findJsonSafetyErrors(
    { graph, ledger, config, run, attachmentSet, registry }, 'Review authority',
  ));
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
