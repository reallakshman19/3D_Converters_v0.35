/**
 * Functionality: builds machine-readable JSON and unresolved CSV audits from
 * per-node enrichment results. Parameters: contexts, resolved rows, master
 * summary, and geometry comparison. Outputs: stable audit artifacts.
 * Fallback: unresolved values remain listed explicitly.
 */

import { STAGEDJSON_AUDIT_SCHEMA } from './stagedjson-enrichment-contract.js';

export function buildStagedJsonEnrichmentAudit(input) {
  const rows = input?.rows || [];
  const count = (status) => rows.filter((row) => row.enrichedAttributes.status === status).length;
  const unresolved = rows.filter((row) => row.enrichedAttributes.status !== 'resolved');
  return {
    schema: STAGEDJSON_AUDIT_SCHEMA,
    evaluatedAt: input?.evaluatedAt || '',
    sourceFileName: input?.sourceFileName || '',
    summary: {
      totalNodesComponentsScanned: rows.length,
      totalEnriched: count('resolved'),
      totalPartial: count('partial'),
      totalMissing: count('missing'),
      totalConflicts: count('conflict'),
      geometryChanged: input?.geometryChanged === true,
      coordinateChanged: input?.geometryChanged === true,
    },
    masters: { ...(input?.masterSummary || {}) },
    unresolvedBranches: unique(unresolved.map((row) => row.context.branchName)),
    unresolvedLineKeys: unique(unresolved.filter((row) => row.enrichedAttributes.missing.includes('lineNo')).map((row) => row.context.hierarchyPath)),
    unresolvedPipingClasses: unique(unresolved.filter((row) => row.enrichedAttributes.missing.includes('pipingClass')).map((row) => row.enrichedAttributes.lineNo || row.context.hierarchyPath)),
    unresolvedWeights: unique(unresolved.filter((row) => row.enrichedAttributes.missing.includes('componentWeightKg')).map((row) => row.context.nodeId)),
    nodes: rows.map(auditRow),
  };
}

export function stagedJsonUnresolvedCsv(audit) {
  const headers = ['nodeId', 'hierarchyPath', 'componentType', 'status', 'lineNo', 'pipingClass', 'missing', 'conflicts', 'diagnostics'];
  const rows = (audit?.nodes || []).filter((row) => row.status !== 'resolved');
  return [headers.join(','), ...rows.map((row) => headers.map((key) => csv(row[key])).join(','))].join('\n');
}

function auditRow(row) {
  const enriched = row.enrichedAttributes;
  return {
    nodeId: row.context.nodeId,
    hierarchyPath: row.context.hierarchyPath,
    componentType: row.context.type,
    status: enriched.status,
    lineNo: enriched.lineNo,
    pipingClass: enriched.pipingClass,
    missing: [...enriched.missing],
    conflicts: [...enriched.conflicts],
    diagnostics: enriched.diagnostics.map((item) => item.id),
    sources: { ...enriched.sources },
    trace: { ...enriched.trace },
  };
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function csv(value) { const text = Array.isArray(value) ? value.join('|') : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); return `"${text.replace(/"/g, '""')}"`; }
