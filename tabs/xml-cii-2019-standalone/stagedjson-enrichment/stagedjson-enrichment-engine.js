/**
 * Functionality: orchestrates the parallel stagedJson enrichment workflow.
 * Parameters: stagedJson, explicit master rows, visible config, source name,
 * and evaluation time. Outputs: enriched stagedJson plus JSON/CSV audit while
 * preserving original attributes, coordinates, and supported source root shape.
 * Fallback: none.
 */

import { collectStagedJsonBranchContexts, stagedJsonGeometrySnapshot } from './stagedjson-branch-context.js';
import { buildStagedJsonEnrichmentAudit, stagedJsonUnresolvedCsv } from './stagedjson-enrichment-audit.js';
import { normalizeVisibleStagedJsonConfig } from './stagedjson-enrichment-contract.js';
import { buildStagedJsonMasterContext, summarizeStagedJsonMasters } from './stagedjson-master-adapter.js';
import { resolveStagedJsonContext } from './stagedjson-resolver-adapter.js';
import { normalizeStagedJson } from '../../../contracts/stagedjson-contract.js';

export function enrichStagedJson(input) {
  const { branches, envelope, sourceShape } = parseStagedJson(input?.stagedJson);
  const config = normalizeVisibleStagedJsonConfig(input?.config);
  const masters = buildStagedJsonMasterContext(input?.masters || {}, config);
  const contexts = collectStagedJsonBranchContexts(branches, config);
  const rows = contexts.map((context) => ({ context, enrichedAttributes: resolveStagedJsonContext(context, masters, config) }));
  const enrichedBranches = writeEnrichment(branches, rows);
  const geometryChanged = JSON.stringify(stagedJsonGeometrySnapshot(branches)) !== JSON.stringify(stagedJsonGeometrySnapshot(enrichedBranches));
  if (geometryChanged) throw new Error('stagedJson enrichment changed geometry coordinates; export blocked.');
  const audit = buildStagedJsonEnrichmentAudit({ rows, masterSummary: summarizeStagedJsonMasters(masters), geometryChanged, sourceFileName: input?.sourceFileName, evaluatedAt: input?.evaluatedAt });
  return {
    enrichedStagedJson: restoreStagedJsonShape(enrichedBranches, sourceShape),
    audit,
    unresolvedCsv: stagedJsonUnresolvedCsv(audit),
    previewRows: rows.map(previewRow),
    config,
    ...(envelope ? { sourceEnvelope: envelope } : {}),
  };
}

export function parseStagedJson(value) {
  const raw = typeof value === 'string' ? JSON.parse(value) : value;
  const { branches, envelope } = normalizeStagedJson(raw);
  return {
    branches: clone(branches),
    envelope: envelope ? clone(envelope) : null,
    sourceShape: isSingleBranchObject(raw) ? 'single-branch-object' : 'branch-array',
  };
}

function isSingleBranchObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.type && Array.isArray(value.children));
}

function restoreStagedJsonShape(branches, sourceShape) {
  if (sourceShape !== 'single-branch-object') return branches;
  if (branches.length !== 1) throw new Error(`Single-object stagedJson normalized to ${branches.length} root branches; export blocked.`);
  return branches[0];
}

function writeEnrichment(stagedJson, rows) {
  const output = clone(stagedJson);
  for (const row of rows) {
    const node = nodeAt(output, row.context.indexPath);
    if (!node) throw new Error(`Could not locate stagedJson node at ${row.context.indexPath.join('/')}.`);
    node.enrichedAttributes = clone(row.enrichedAttributes);
    node.diagnostics = mergeDiagnostics(node.diagnostics, row.enrichedAttributes.diagnostics);
  }
  return output;
}

function nodeAt(root, path) {
  let cursor = root;
  for (const part of path) cursor = cursor?.[part];
  return cursor || null;
}

function mergeDiagnostics(existing, enrichment) {
  const rows = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(enrichment) ? enrichment : [])];
  return [...new Map(rows.map((row) => [row?.id || JSON.stringify(row), clone(row)])).values()];
}

function previewRow(row) {
  return {
    nodeId: row.context.nodeId,
    path: row.context.hierarchyPath,
    type: row.context.type,
    branchName: row.context.branchName,
    boreMm: row.context.nominalBoreMm,
    lineNo: row.enrichedAttributes.lineNo,
    pipingClass: row.enrichedAttributes.pipingClass,
    status: row.enrichedAttributes.status,
    missing: [...row.enrichedAttributes.missing],
    pipeOdMm: row.enrichedAttributes.pipeOdMm,
    wallThicknessMm: row.enrichedAttributes.wallThicknessMm,
    material: row.enrichedAttributes.material,
    pipeWeightKgPerM: row.enrichedAttributes.pipeWeightKgPerM,
    fluidDensityOpeKgM3: row.enrichedAttributes.fluidDensityOpeKgM3,
    fluidDensityHydKgM3: row.enrichedAttributes.fluidDensityHydKgM3,
    insulationThicknessMm: row.enrichedAttributes.insulationThicknessMm,
    lineBasis: `${row.enrichedAttributes.trace?.lineKeyResolver?.method || 'none'} (${row.enrichedAttributes.trace?.lineKeyResolver?.candidateCount || 0})`,
    classBasis: `${row.enrichedAttributes.trace?.pipingClassResolver?.method || 'none'}`,
  };
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
