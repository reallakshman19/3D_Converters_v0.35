function graphIdentity(graph) {
  if (!graph?.validation?.ok || graph.schema !== 'UniversalSourceGraph.v1') return null;
  return {
    sourceFileId: graph.sourceFileId,
    sourceRevision: graph.sourceRevision,
    sourceGraphSchema: graph.schema,
    sourceContentHash: graph.contentHash,
  };
}

function registryMap(registry) {
  return new Map((registry?.datasets || []).map((dataset) => [dataset.datasetId, dataset]));
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((item) => deepFreeze(item, seen));
  return Object.freeze(value);
}

function jsonSafetyError(value) {
  const seen = new Set();
  function visit(item) {
    if (item === null || ['string', 'boolean'].includes(typeof item)) return '';
    if (typeof item === 'number') return Number.isFinite(item) ? '' : 'Attachment set contains a non-finite number.';
    if (typeof item !== 'object') return `Attachment set contains unsupported type ${typeof item}.`;
    if (seen.has(item)) return 'Attachment set contains a cycle.';
    seen.add(item);
    for (const child of Object.values(item)) { const error = visit(child); if (error) return error; }
    seen.delete(item);
    return '';
  }
  return visit(value);
}

export function validateMasterAttachmentSet(attachmentSet, graph, registry) {
  const errors = [];
  if (attachmentSet?.schema !== 'MasterAttachmentSet.v1') errors.push('Attachment schema must be MasterAttachmentSet.v1.');
  const identity = graphIdentity(graph);
  if (!identity) errors.push('A valid UniversalSourceGraph.v1 is required.');
  for (const [key, value] of Object.entries(identity || {})) if (attachmentSet?.[key] !== value) errors.push(`Attachment graph metadata mismatch: ${key}.`);
  const datasets = registryMap(registry);
  const ids = new Set();
  const orders = new Set();
  const attachments = Array.isArray(attachmentSet?.attachments) ? attachmentSet.attachments : [];
  if (!Array.isArray(attachmentSet?.attachments)) errors.push('Attachments must be an array.');
  attachments.forEach((attachment, index) => {
    if (ids.has(attachment.datasetId)) errors.push(`Duplicate attachment: ${attachment.datasetId}.`);
    ids.add(attachment.datasetId);
    if (!Number.isInteger(attachment.attachmentOrder) || attachment.attachmentOrder < 0) errors.push(`Attachment ${index + 1} has invalid order.`);
    if (orders.has(attachment.attachmentOrder)) errors.push('Attachment order values must be unique.');
    orders.add(attachment.attachmentOrder);
    if (attachment.attachmentOrder !== index) errors.push('Attachment order values must be contiguous and deterministic.');
    const dataset = datasets.get(attachment.datasetId);
    if (!dataset) errors.push(`Unknown attachment dataset: ${attachment.datasetId}.`);
    else if (dataset.datasetRole !== attachment.datasetRole) errors.push(`Attachment role mismatch for ${attachment.datasetId}.`);
  });
  const safetyError = jsonSafetyError(attachmentSet);
  if (safetyError) errors.push(safetyError);
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
}

export function createMasterAttachmentSet(graph, attachments = [], registry = { datasets: [] }) {
  const identity = graphIdentity(graph) || {
    sourceFileId: '', sourceRevision: 0, sourceGraphSchema: 'UniversalSourceGraph.v1', sourceContentHash: '',
  };
  const normalized = attachments.map((attachment, attachmentOrder) => ({
    datasetId: attachment.datasetId,
    datasetRole: attachment.datasetRole,
    attachmentOrder,
  }));
  const base = { schema: 'MasterAttachmentSet.v1', ...identity, attachments: normalized };
  const validation = validateMasterAttachmentSet(base, graph, registry);
  return deepFreeze({ ...base, validation });
}

export function attachMasterDataset(attachmentSet, graph, registry, dataset) {
  const current = attachmentSet?.attachments || [];
  if (current.some((item) => item.datasetId === dataset.datasetId)) return attachmentSet;
  return createMasterAttachmentSet(graph, [...current, dataset], registry);
}

export function detachMasterDataset(attachmentSet, graph, registry, datasetId) {
  const current = attachmentSet?.attachments || [];
  return createMasterAttachmentSet(graph, current.filter((item) => item.datasetId !== datasetId), registry);
}

export function serializeMasterAttachmentSet(attachmentSet) {
  return `${JSON.stringify(attachmentSet, null, 2)}\n`;
}
