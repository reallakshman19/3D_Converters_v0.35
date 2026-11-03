import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import { sha256Hex } from './source-envelope.js';
import { createComparisonIdentity, graphComparisonIdentity } from './comparison-identity.js';
import { canonicalNormalization, COMPARISON_MODES } from './comparison-normalize.js';

function registryMap(registry) {
  return new Map((registry?.datasets || []).map((dataset) => [dataset.datasetId, dataset]));
}

function attachmentMap(attachmentSet) {
  return new Map((attachmentSet?.attachments || []).map((item) => [item.datasetId, item]));
}

export function normalizeMasterFieldBinding(binding = {}, sourceOrder = binding.sourceOrder ?? 0) {
  const comparisonMode = String(binding.comparisonMode || 'strict').trim();
  return {
    bindingId: String(binding.bindingId || ''), sourceOrder: Number(sourceOrder), enabled: binding.enabled !== false,
    fieldKey: String(binding.fieldKey || '').trim(), datasetId: String(binding.datasetId || '').trim(),
    datasetRole: String(binding.datasetRole || '').trim(), columnId: String(binding.columnId || '').trim(),
    comparisonMode, normalization: canonicalNormalization(comparisonMode, binding.normalization),
  };
}

function bindingEvidence(binding) {
  const { bindingId, ...evidence } = binding; return evidence;
}

export async function createMasterFieldBindingId(binding, hashText = sha256Hex) {
  return createComparisonIdentity('master-binding', bindingEvidence(normalizeMasterFieldBinding(binding)), hashText);
}

export async function createMasterAttachmentSetIdentity(graph, attachmentSet, hashText = sha256Hex) {
  const evidence = {
    graph: graphComparisonIdentity(graph),
    attachments: (attachmentSet?.attachments || []).map((item) => ({
      datasetId: item.datasetId, datasetRole: item.datasetRole, attachmentOrder: item.attachmentOrder,
    })),
  };
  return createComparisonIdentity('attachment-set', evidence, hashText);
}

async function normalizeBindings(drafts, hashText) {
  const bindings = [];
  for (let sourceOrder = 0; sourceOrder < drafts.length; sourceOrder += 1) {
    const normalized = normalizeMasterFieldBinding(drafts[sourceOrder], sourceOrder);
    normalized.bindingId = await createMasterFieldBindingId(normalized, hashText); bindings.push(normalized);
  }
  return bindings;
}

function authorityErrors(graph, ledger, attachmentSet, registry) {
  const errors = [];
  if (graph?.schema !== 'UniversalSourceGraph.v1' || !graph?.validation?.ok) errors.push('A valid UniversalSourceGraph.v1 is required.');
  if (ledger?.schema !== 'FieldCandidateLedger.v1' || !ledger?.validation?.ok) errors.push('A valid FieldCandidateLedger.v1 is required.');
  if (attachmentSet?.schema !== 'MasterAttachmentSet.v1' || !attachmentSet?.validation?.ok) errors.push('A valid MasterAttachmentSet.v1 is required.');
  if (ledger?.sourceFileId !== graph?.sourceFileId || ledger?.sourceRevision !== graph?.sourceRevision
    || ledger?.sourceContentHash !== graph?.contentHash || ledger?.sourceGraphSchema !== graph?.schema) errors.push('Ledger graph identity mismatch.');
  if (attachmentSet?.sourceFileId !== graph?.sourceFileId || attachmentSet?.sourceRevision !== graph?.sourceRevision
    || attachmentSet?.sourceContentHash !== graph?.contentHash || attachmentSet?.sourceGraphSchema !== graph?.schema) errors.push('Attachment graph identity mismatch.');
  const datasets = registryMap(registry); const seen = new Set();
  if (!Array.isArray(attachmentSet?.attachments)) errors.push('Attachment references must be an array.');
  for (let index = 0; index < (attachmentSet?.attachments || []).length; index += 1) {
    const item = attachmentSet.attachments[index]; const dataset = datasets.get(item.datasetId);
    if (item.attachmentOrder !== index) errors.push(`Attachment ${index} order mismatch.`);
    if (seen.has(item.datasetId)) errors.push(`Duplicate attached dataset ${item.datasetId}.`); seen.add(item.datasetId);
    if (!dataset?.validation?.ok) errors.push(`Attached dataset ${item.datasetId} is absent or invalid.`);
    else if (dataset.datasetRole !== item.datasetRole) errors.push(`Attached dataset ${item.datasetId} role mismatch.`);
  }
  return errors;
}

async function bindingErrors(config, ledger, attachmentSet, registry, hashText) {
  const errors = []; const warnings = []; const bindings = Array.isArray(config?.bindings) ? config.bindings : [];
  const fields = new Set((ledger?.entries || []).filter((entry) => entry.status === 'candidate').map((entry) => entry.fieldKey));
  const datasets = registryMap(registry); const attached = attachmentMap(attachmentSet); const triples = new Set(); const ids = new Set();
  if (!bindings.length) errors.push('At least one master-field binding is required.');
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index]; const dataset = datasets.get(binding.datasetId); const attachment = attached.get(binding.datasetId);
    if (binding.sourceOrder !== index) errors.push(`Binding ${index} sourceOrder must be contiguous.`);
    if (!binding.fieldKey) errors.push(`Binding ${index} fieldKey is empty.`); else if (!fields.has(binding.fieldKey)) warnings.push(`Binding field ${binding.fieldKey} has no candidate entry.`);
    if (!COMPARISON_MODES.includes(binding.comparisonMode)) errors.push(`Binding ${index} comparison mode is unsupported.`);
    if (!attachment || !dataset) errors.push(`Binding ${index} references an unattached dataset.`);
    if (dataset && attachment && (binding.datasetRole !== dataset.datasetRole || binding.datasetRole !== attachment.datasetRole)) errors.push(`Binding ${index} dataset role mismatch.`);
    if (dataset && !dataset.columns.some((column) => column.columnId === binding.columnId)) errors.push(`Binding ${index} references an unknown column.`);
    const expectedId = await createMasterFieldBindingId(binding, hashText);
    if (binding.bindingId !== expectedId) errors.push(`Binding ${index} identity mismatch.`);
    if (ids.has(binding.bindingId)) errors.push(`Duplicate binding ID ${binding.bindingId}.`); ids.add(binding.bindingId);
    const triple = `${binding.fieldKey}\0${binding.datasetId}\0${binding.columnId}`;
    if (binding.enabled && triples.has(triple)) errors.push(`Duplicate enabled binding for ${binding.fieldKey}.`);
    if (binding.enabled) triples.add(triple);
  }
  if (bindings.length && !bindings.some((binding) => binding.enabled)) warnings.push('All bindings are disabled.');
  return { errors, warnings };
}

function summarizeBindings(bindings) {
  const enabled = bindings.filter((binding) => binding.enabled);
  return {
    bindingCount: bindings.length, enabledBindingCount: enabled.length,
    boundFieldCount: new Set(enabled.map((binding) => binding.fieldKey)).size,
    datasetCount: new Set(enabled.map((binding) => binding.datasetId)).size,
  };
}

export async function validateMasterFieldBindingConfig(config, graph, ledger, attachmentSet, registry, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const errors = [...authorityErrors(graph, ledger, attachmentSet, registry), ...findJsonSafetyErrors(config, 'Binding config')];
  if (config?.schema !== 'MasterFieldBindingConfig.v1') errors.push('Binding config schema must be MasterFieldBindingConfig.v1.');
  const graphIdentity = graphComparisonIdentity(graph);
  for (const [key, value] of Object.entries(graphIdentity)) if (config?.[key] !== value) errors.push(`Binding config graph metadata mismatch: ${key}.`);
  const expectedAttachmentId = await createMasterAttachmentSetIdentity(graph, attachmentSet, hashText);
  if (config?.ledgerId !== ledger?.ledgerId) errors.push('Binding config ledger identity mismatch.');
  if (config?.attachmentSetIdentity !== expectedAttachmentId) errors.push('Binding config attachment identity mismatch.');
  const checked = await bindingErrors(config, ledger, attachmentSet, registry, hashText); errors.push(...checked.errors);
  const expectedSummary = summarizeBindings(config?.bindings || []);
  if (JSON.stringify(config?.summary) !== JSON.stringify(expectedSummary)) errors.push('Binding config summary mismatch.');
  const expectedId = await createComparisonIdentity('master-binding-config', {
    graph: graphIdentity, ledgerId: ledger?.ledgerId, attachmentSetIdentity: expectedAttachmentId, bindings: config?.bindings || [],
  }, hashText);
  if (config?.bindingConfigId !== expectedId) errors.push('Binding config identity mismatch.');
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(checked.warnings)] };
}

export async function createMasterFieldBindingConfig(graph, ledger, attachmentSet, registry, drafts, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const bindings = await normalizeBindings(Array.isArray(drafts) ? drafts : [], hashText);
  const attachmentSetIdentity = await createMasterAttachmentSetIdentity(graph, attachmentSet, hashText);
  const base = {
    schema: 'MasterFieldBindingConfig.v1', bindingConfigId: '', ...graphComparisonIdentity(graph),
    ledgerId: ledger?.ledgerId || '', attachmentSetIdentity, bindings,
    summary: summarizeBindings(bindings), validation: { ok: false, errors: [], warnings: [] },
  };
  base.bindingConfigId = await createComparisonIdentity('master-binding-config', {
    graph: graphComparisonIdentity(graph), ledgerId: base.ledgerId, attachmentSetIdentity, bindings,
  }, hashText);
  base.validation = await validateMasterFieldBindingConfig(base, graph, ledger, attachmentSet, registry, { hashText });
  return deepFreezeArtifact(base);
}

export function serializeMasterFieldBindingConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}
