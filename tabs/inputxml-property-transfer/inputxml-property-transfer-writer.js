import { runInputXmlPropertyTransferPreview } from './inputxml-property-transfer-matcher.js';

const WRITABLE_DECISION = 'TRANSFERRED';

export function applyInputXmlPropertyTransfer(input = {}) {
  const targetXmlText = String(input.targetXmlText || input.targetXml || '');
  const preview = input.previewResult || runInputXmlPropertyTransferPreview(input);
  const writePlan = buildWritePlan(preview.rows || []);
  const updatedXmlText = applyWritePlanToTargetXml(targetXmlText, writePlan);
  const auditRows = buildAuditRows(preview.rows || []);

  return {
    ...preview,
    targetXmlText,
    updatedXmlText,
    xmlChanged: updatedXmlText !== targetXmlText,
    writePlan,
    auditRows,
    writerSummary: summarizeAudit(auditRows),
  };
}

export function buildWritePlan(rows = []) {
  const nodeChangesByTarget = new Map();
  const branchChangesByName = new Map();

  for (const row of rows || []) {
    if (row?.decision !== WRITABLE_DECISION) continue;
    const nodeKey = targetNodeKey(row.targetNodeNumber, row.targetNode);
    for (const change of row.changes || []) {
      if (!isWritableChange(change)) continue;
      if (change.scope === 'node') {
        if (!nodeChangesByTarget.has(nodeKey)) nodeChangesByTarget.set(nodeKey, []);
        nodeChangesByTarget.get(nodeKey).push({ ...change, row });
      } else if (change.scope === 'branch') {
        const branchKey = normalizeBranchKey(row.targetBranch);
        if (!branchChangesByName.has(branchKey)) branchChangesByName.set(branchKey, []);
        branchChangesByName.get(branchKey).push({ ...change, row });
      }
    }
  }

  return { nodeChangesByTarget, branchChangesByName };
}

export function applyWritePlanToTargetXml(targetXmlText, writePlan) {
  return String(targetXmlText || '').replace(/<Branch\b[^>]*>[\s\S]*?<\/Branch>/gi, (branchXml) => {
    const branchName = textBetween(branchXml, 'BranchName');
    const branchKey = normalizeBranchKey(branchName);
    let nextBranchXml = applyElementChanges(branchXml, writePlan.branchChangesByName.get(branchKey) || []);

    nextBranchXml = nextBranchXml.replace(/<Node\b[^>]*>[\s\S]*?<\/Node>/gi, (nodeXml) => {
      const nodeNumber = textBetween(nodeXml, 'NodeNumber');
      const nodeName = textBetween(nodeXml, 'NodeName');
      const nodeKey = targetNodeKey(nodeNumber, nodeName);
      return applyElementChanges(nodeXml, writePlan.nodeChangesByTarget.get(nodeKey) || []);
    });

    return nextBranchXml;
  });
}

export function buildAuditRows(rows = []) {
  const auditRows = [];

  for (const row of rows || []) {
    if (row.decision !== WRITABLE_DECISION) {
      auditRows.push({
        recordType: 'MATCH_DECISION',
        targetNode: row.targetNode,
        targetNodeNumber: row.targetNodeNumber,
        targetBranch: row.targetBranch,
        sourceNode: row.sourceNode,
        sourceNodeNumber: row.sourceNodeNumber,
        decision: row.decision,
        property: '',
        before: '',
        sourceValue: '',
        after: '',
        action: 'RETAINED_TARGET',
        reason: row.reason || 'Target retained because no writable transfer decision was produced.',
      });
      continue;
    }

    for (const change of row.changes || []) {
      auditRows.push({
        recordType: 'PROPERTY_CHANGE',
        targetNode: row.targetNode,
        targetNodeNumber: row.targetNodeNumber,
        targetBranch: row.targetBranch,
        sourceNode: row.sourceNode,
        sourceNodeNumber: row.sourceNodeNumber,
        decision: row.decision,
        property: `${change.scope}:${change.prop}`,
        before: change.before,
        sourceValue: change.sourceValue,
        after: change.after,
        action: isWritableChange(change) ? 'WRITTEN' : 'SKIPPED',
        reason: isWritableChange(change) ? 'Preview-approved property transfer written to target XML.' : 'Non-writable change skipped.',
      });
    }
  }

  return auditRows;
}

export function propertyTransferAuditRowsToCsv(rows = []) {
  const columns = [
    'recordType',
    'targetNode',
    'targetNodeNumber',
    'targetBranch',
    'sourceNode',
    'sourceNodeNumber',
    'decision',
    'property',
    'before',
    'sourceValue',
    'after',
    'action',
    'reason',
  ];
  return [columns.join(','), ...(rows || []).map((row) => columns.map((column) => csvCell(row?.[column] ?? '')).join(','))].join('\n');
}

function applyElementChanges(elementXml, changes = []) {
  let nextXml = String(elementXml || '');
  const lastByProp = new Map();
  for (const change of changes) {
    if (isWritableChange(change)) lastByProp.set(change.prop, change);
  }

  for (const [prop, change] of lastByProp.entries()) {
    nextXml = replaceTagValue(nextXml, prop, change.after);
  }
  return nextXml;
}

function replaceTagValue(xml, tag, value) {
  const tagName = String(tag || '').trim();
  if (!tagName) return xml;
  const safeValue = encodeXmlText(value);
  const re = new RegExp(`(<${escapeRegExp(tagName)}\\b[^>]*>)([\\s\\S]*?)(<\\/${escapeRegExp(tagName)}>)`, 'i');
  if (re.test(xml)) return xml.replace(re, `$1${safeValue}$3`);

  return xml.replace(/(<\/(?:Node|Branch)>\s*)$/i, `<${tagName}>${safeValue}</${tagName}>$1`);
}

function isWritableChange(change) {
  return change?.action === 'TRANSFERRED' && change.scope && change.prop && change.after !== undefined && change.after !== null && String(change.after).trim() !== '';
}

function summarizeAudit(auditRows = []) {
  return {
    written: auditRows.filter((row) => row.action === 'WRITTEN').length,
    retained: auditRows.filter((row) => row.action === 'RETAINED_TARGET').length,
    skipped: auditRows.filter((row) => row.action === 'SKIPPED').length,
  };
}

function targetNodeKey(nodeNumber, nodeName) {
  return `${String(nodeNumber || '').trim()}||${String(nodeName || '').trim()}`;
}

function normalizeBranchKey(value) {
  return String(value || '').trim();
}

function textBetween(xml, tag) {
  const match = String(xml || '').match(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i'));
  return match ? decodeXmlText(match[1].trim()) : '';
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function encodeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
