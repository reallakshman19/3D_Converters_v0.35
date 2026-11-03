import { buildPcfTopoGraph } from '../rvm-pcf-topology/RvmPcfTopoGraphBuilder.js';
import { createGapOverlapFixPlan } from '../rvm-pcf-topology/RvmPcfGapOverlapResolver.js';
import {
  normalizeTopoConfig,
  componentType,
  isPipe,
  clean,
} from '../rvm-pcf-topology/RvmPcfTopoTypes.js';

/**
 * RvmPcfReadinessGate.js
 *
 * Medium ROI gate:
 * - Read-only topology check
 * - TEE/OLET check
 * - Gap/overlap candidate check up to configurable max 100mm
 * - CA unit-bearing check
 * - No mutation
 */

function hasUnit(value, rx) {
  return rx.test(String(value ?? ''));
}

function checkCaUnits(row) {
  const ca = row?.ca || {};
  const blockers = [];
  const warnings = [];

  if (ca['1'] != null && !hasUnit(ca['1'], /\bkPa\b|\bMPa\b|\bbar\b|\bbarg\b|\bpsi\b|\bkg\s*\/\s*cm2\b/i)) {
    blockers.push('CA1-MISSING-UNIT');
  }

  if (ca['2'] != null && !hasUnit(ca['2'], /\bC\b|\bF\b|\bK\b|°\s*C|°\s*F/i)) {
    blockers.push('CA2-MISSING-UNIT');
  }

  if (ca['5'] != null && !hasUnit(ca['5'], /\bmm\b|\bm\b|\binch\b|\bin\b|["″]/i)) {
    blockers.push('CA5-MISSING-UNIT');
  }

  if (ca['8'] != null && !hasUnit(ca['8'], /\bkg\b|\bkgs\b|\blb\b|\blbs\b|\btonne\b/i)) {
    blockers.push('CA8-MISSING-UNIT');
  }

  if (ca['10'] != null && !hasUnit(ca['10'], /\bkPa\b|\bMPa\b|\bbar\b|\bbarg\b|\bpsi\b|\bkg\s*\/\s*cm2\b/i)) {
    blockers.push('CA10-MISSING-UNIT');
  }

  return { blockers, warnings };
}

function checkRowEmissionBasics(row) {
  const type = componentType(row);
  const blockers = [];
  const warnings = [];

  if (!type) blockers.push('TYPE-MISSING');

  if (row.include === false) {
    warnings.push('ROW-EXCLUDED');
    return { blockers, warnings };
  }

  if (isPipe(row)) {
    if (row.skey || row.SKEY || row.attributes?.SKEY) {
      warnings.push('PIPE-SKEY-SHOULD-BE-SUPPRESSED');
    }
  }

  if (row.convertedBore == null && type !== 'SUPPORT') {
    warnings.push('CONVERTED-BORE-MISSING');
  }

  return { blockers, warnings };
}

function makeByRow(rows) {
  const byRow = new Map();

  for (const row of rows || []) {
    const key = String(row.rowNo ?? row.sourceCanonicalId ?? row.id ?? '');
    byRow.set(key, {
      rowNo: row.rowNo ?? null,
      sourceCanonicalId: row.sourceCanonicalId ?? null,
      type: componentType(row),
      pcfReady: true,
      pcfBlockers: [],
      pcfWarnings: [],
      pcfFixCandidates: [],
    });
  }

  return byRow;
}

function getByRow(byRow, rowNo) {
  const key = String(rowNo ?? '');
  if (!byRow.has(key)) {
    byRow.set(key, {
      rowNo,
      sourceCanonicalId: null,
      type: null,
      pcfReady: true,
      pcfBlockers: [],
      pcfWarnings: [],
      pcfFixCandidates: [],
    });
  }

  return byRow.get(key);
}

const DEFAULT_SKIPPABLE_READINESS_CODES = new Set([
  'TOPO-OLET-BRANCH-DISCONNECTED',
  'TOPO-TEE-BRANCH-DISCONNECTED',
  'TOPO-TEE-MAIN-DISCONNECTED',
  'TOPO-PORT-DISCONNECTED',
]);

function normalizeSkipPolicy(rawOptions = {}) {
  if (rawOptions.skipReadinessErrors !== true) {
    return {
      skipAllErrors: false,
      skipCodes: new Set(),
    };
  }

  const rawCodes = Array.isArray(rawOptions.skipReadinessErrorCodes)
    ? rawOptions.skipReadinessErrorCodes
    : String(rawOptions.skipReadinessErrorCodes || '')
        .split(/[,\n\r\t ]+/)
        .map(s => s.trim())
        .filter(Boolean);

  if (!rawCodes.length) {
    return {
      skipAllErrors: true,
      skipCodes: new Set(DEFAULT_SKIPPABLE_READINESS_CODES),
    };
  }

  return {
    skipAllErrors: false,
    skipCodes: new Set(rawCodes.map(code => String(code || '').trim()).filter(Boolean)),
  };
}

function applyReadinessSkipPolicy(diagnostic, skipPolicy) {
  if (!diagnostic || diagnostic.severity !== 'ERROR') return diagnostic;
  if (!skipPolicy.skipAllErrors && !skipPolicy.skipCodes.has(diagnostic.code)) return diagnostic;

  return {
    ...diagnostic,
    originalSeverity: diagnostic.severity,
    severity: 'WARNING',
    skipApplied: true,
    skipReason: 'Skipped by Run Readiness Check option',
    message: `[SKIPPED ERROR] ${diagnostic.message}`,
  };
}

export function runPcfReadinessGate(rows = [], rawOptions = {}) {
  const config = normalizeTopoConfig(rawOptions);
  const skipPolicy = normalizeSkipPolicy(rawOptions);

  const graph = buildPcfTopoGraph(rows, config);
  const graphDiagnostics = (graph.diagnostics || []).map(d =>
    applyReadinessSkipPolicy(d, skipPolicy)
  );

  const skippedReadinessErrors = graphDiagnostics.filter(d => d.skipApplied === true);

  const fixPlan = createGapOverlapFixPlan(rows, graph, config);

  const byRow = makeByRow(rows);

  for (const row of rows || []) {
    const key = String(row.rowNo ?? row.sourceCanonicalId ?? row.id ?? '');
    const state = byRow.get(key);
    if (!state) continue;

    const basics = checkRowEmissionBasics(row);
    const ca = checkCaUnits(row);

    state.pcfBlockers.push(...basics.blockers);
    state.pcfWarnings.push(...basics.warnings, ...ca.warnings);

    for (const code of ca.blockers) {
      if (skipPolicy.skipAllErrors || skipPolicy.skipCodes.has(code)) {
        state.pcfWarnings.push(`SKIPPED-${code}`);
      } else {
        state.pcfBlockers.push(code);
      }
    }
  }

  for (const diagnostic of graphDiagnostics) {
    const state = getByRow(byRow, diagnostic.rowNo);

    if (diagnostic.severity === 'ERROR') {
      state.pcfBlockers.push(diagnostic.code);
    } else {
      state.pcfWarnings.push(
        diagnostic.skipApplied
          ? `SKIPPED-${diagnostic.code}`
          : diagnostic.code
      );
    }
  }

  for (const candidate of graph.gapCandidates || []) {
    const state = getByRow(byRow, candidate.sourceRowNo);
    state.pcfFixCandidates.push(candidate);
    state.pcfWarnings.push('TOPO-GAP-CANDIDATE');
  }

  for (const candidate of graph.overlapCandidates || []) {
    const state = getByRow(byRow, candidate.pipeRowNo);
    state.pcfFixCandidates.push(candidate);
    state.pcfWarnings.push('TOPO-OVERLAP-CANDIDATE');
  }

  for (const state of byRow.values()) {
    state.pcfBlockers = [...new Set(state.pcfBlockers)];
    state.pcfWarnings = [...new Set(state.pcfWarnings)];
    state.pcfReady = state.pcfBlockers.length === 0;
  }

  const rowStates = [...byRow.values()];

  const summary = {
    pcfReady: rowStates.every(r => r.pcfReady) && graphDiagnostics.filter(d => d.severity === 'ERROR').length === 0,

    readyRows: rowStates.filter(r => r.pcfReady).length,
    blockedRows: rowStates.filter(r => !r.pcfReady).length,
    warningRows: rowStates.filter(r => r.pcfWarnings.length > 0).length,

    skippedReadinessErrorCount: skippedReadinessErrors.length,
    skippedReadinessErrorCodes: [...new Set(skippedReadinessErrors.map(d => d.code))],
    readinessSkipEnabled: skipPolicy.skipAllErrors || skipPolicy.skipCodes.size > 0,

    topoComponentCount: graph.stats.topoComponentCount,
    topoPortCount: graph.stats.topoPortCount,
    pipeSegmentCount: graph.stats.pipeSegmentCount,

    exactEndpointConnectionCount: graph.stats.exactEndpointConnectionCount,
    oletSegmentTapCount: graph.stats.oletSegmentTapCount,

    gapCandidateCount: graph.stats.gapCandidateCount,
    overlapCandidateCount: graph.stats.overlapCandidateCount,

    gapFixPlanCount: fixPlan.summary.gapFixPlanCount,
    overlapFixPlanCount: fixPlan.summary.overlapFixPlanCount,
    safeFixPlanCount: fixPlan.summary.safeFixPlanCount,
    blockedFixPlanCount: fixPlan.summary.blockedFixPlanCount,

    teeIssueCount: graph.stats.teeIssueCount,
    oletIssueCount: graph.stats.oletIssueCount,
    unresolvedRequiredPortCount: graph.stats.unresolvedRequiredPortCount,

    rowMutationCount: 0,
    fittingMovedCount: 0,
    fittingTrimmedCount: 0,
    pipeEndpointModifiedCount: 0,
    ambiguousAutoAcceptedCount: graph.stats.ambiguousAutoAcceptedCount,
    crossPipelineAutoAcceptedCount: graph.stats.crossPipelineAutoAcceptedCount,

    connectToleranceMm: config.connectToleranceMm,
    fixToleranceMm: config.fixToleranceMm,
    maxFixToleranceMm: config.maxFixToleranceMm,
  };

  return {
    schema: 'rvm-pcf-readiness-gate/v1',
    pass: summary.pcfReady,
    summary,
    rowStates,
    graph,
    fixPlan,
    report: {
      allowPcfExport: summary.pcfReady,
      summary,
    },
    diagnostics: [
      ...graphDiagnostics,
      ...rowStates.flatMap(state =>
        state.pcfBlockers.map(code => ({
          severity: 'ERROR',
          code,
          rowNo: state.rowNo,
          type: state.type,
          sourceCanonicalId: state.sourceCanonicalId,
          message: `PCF readiness blocker: ${code}`,
          _source: 'pcf-readiness-gate',
        }))
      ),
    ],
  };
}

export function assertPcfExportAllowed(gateResult, config = {}) {
  const pass = !!gateResult?.pass;
  const allowPartial = config.allowPartialExport !== false;

  if (pass) {
    return { ok: true, reason: 'PCF readiness passed completely.' };
  }

  if (!allowPartial) {
    return { ok: false, reason: 'PCF readiness failed and allowPartialExport is false.' };
  }

  const s = gateResult?.summary;
  if (!s) {
    return { ok: false, reason: 'No readiness summary available.' };
  }

  if (s.blockedRows > 0) {
    return {
      ok: false,
      reason: `Cannot export: ${s.blockedRows} row(s) are blocked by fatal errors (e.g., missing mandatory masters, missing geometry, unresolved BRLEN).`,
    };
  }

  return {
    ok: true,
    reason: `Exporting partial PCF (ignoring warnings/continuity issues).`,
  };
}

export function readinessSummaryText(result) {
  const s = result?.summary || {};

  return [
    `PCF Ready: ${s.pcfReady ? 'YES' : 'NO'}`,
    `Ready rows: ${s.readyRows ?? 0}`,
    `Blocked rows: ${s.blockedRows ?? 0}`,
    `Skipped readiness errors: ${s.skippedReadinessErrorCount ?? 0}`,
    `Skipped readiness codes: ${(s.skippedReadinessErrorCodes || []).join(', ') || '-'}`,
    `Topology components: ${s.topoComponentCount ?? 0}`,
    `Ports: ${s.topoPortCount ?? 0}`,
    `Pipe segments: ${s.pipeSegmentCount ?? 0}`,
    `Exact connections: ${s.exactEndpointConnectionCount ?? 0}`,
    `OLET segment taps: ${s.oletSegmentTapCount ?? 0}`,
    `Gap candidates: ${s.gapCandidateCount ?? 0}`,
    `Overlap candidates: ${s.overlapCandidateCount ?? 0}`,
    `Safe fix plans: ${s.safeFixPlanCount ?? 0}`,
    `TEE issues: ${s.teeIssueCount ?? 0}`,
    `OLET issues: ${s.oletIssueCount ?? 0}`,
    `Unresolved required ports: ${s.unresolvedRequiredPortCount ?? 0}`,
    `Fix tolerance: ${s.fixToleranceMm ?? 25} mm`,
  ].join('\n');
}
