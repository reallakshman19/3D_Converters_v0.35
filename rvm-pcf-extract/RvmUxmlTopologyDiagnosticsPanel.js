/**
 * RvmUxmlTopologyDiagnosticsPanel.js
 *
 * Agent 12: Extract PCF UXML topology diagnostics UI.
 *
 * Purpose:
 * - Render audit-ready UXML topology evidence inside the existing
 *   RVM / JSON → PCF Extract diagnostics panel.
 *
 * Important:
 * - UI/report rendering only.
 * - Does not mutate rows.
 * - Does not apply fixes.
 * - Does not emit PCF.
 * - Does not resolve masters.
 */

import {
  RVM_PCF_TOPOLOGY_MODES,
  normalizeRvmPcfTopologyMode,
  topologyModeLabel,
} from './RvmPcfTopologyModes.js';

const PANEL_SCHEMA = 'rvm-pcf-uxml-topology-diagnostics-panel/v1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function boolText(value) {
  return value === true ? 'YES' : 'NO';
}

function pillClass(value) {
  if (value === true) return 'ok';
  if (value === false) return 'warn';
  return 'muted';
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return fallback;
}

function componentPairText(item = {}) {
  const a =
    item.sourceComponentId ||
    item.universalEdge?.sourceComponentId ||
    item.rayCandidate?.sourceComponentId ||
    '';

  const b =
    item.targetComponentId ||
    item.universalEdge?.targetComponentId ||
    item.rayCandidate?.targetComponentId ||
    '';

  if (!a && !b) return '';
  return `${a} → ${b}`;
}

function diagIdentity(d = {}) {
  return {
    rowNo: pick(d, ['rowNo', 'row', 'sourceRow'], ''),
    refNo: pick(d, ['refNo', 'ref', 'CA97'], ''),
    seqNo: pick(d, ['seqNo', 'seq', 'CA98'], ''),
    lineNo: pick(d, ['lineNo', 'lineNoKey', 'lineKey'], ''),
    pipelineRef: pick(d, ['pipelineRef', 'pipeline'], ''),
    type: pick(d, ['type', 'componentType'], ''),
    name: pick(d, ['name', 'tag'], ''),
  };
}

function tableHtml(columns, rows, emptyText = 'No items.') {
  if (!rows.length) {
    return `<div class="rvm-uxml-topo-empty">${esc(emptyText)}</div>`;
  }

  return `
    <div class="rvm-uxml-topo-table-wrap">
      <table class="rvm-uxml-topo-table">
        <thead>
          <tr>${columns.map(col => `<th>${esc(col.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${columns.map(col => `<td>${esc(col.value(row))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function kvRowsHtml(rows) {
  return rows.map(([label, value, intent = '']) => `
    <div class="rvm-pcf-status-row">
      <span class="rvm-pcf-label">${esc(label)}</span>
      <span class="${intent ? `rvm-uxml-topo-value-${esc(intent)}` : ''}">${esc(value)}</span>
    </div>
  `).join('');
}

function statusPill(label, value) {
  return `<span class="rvm-uxml-topo-pill ${pillClass(value)}">${esc(label)}: ${esc(boolText(value))}</span>`;
}

function decisionPill(label, value) {
  const n = number(value);
  const cls = n > 0 ? 'warn' : 'ok';
  return `<span class="rvm-uxml-topo-pill ${cls}">${esc(label)}: ${esc(n)}</span>`;
}

export function buildRvmUxmlTopologyDiagnosticsViewModel({
  topologyMode = RVM_PCF_TOPOLOGY_MODES.LEGACY,
  uxmlTopology = null,
  readinessGate = null,
  diagnostics = [],
} = {}) {
  const mode = normalizeRvmPcfTopologyMode(topologyMode);
  const decision = uxmlTopology?.topologyDecision || readinessGate?.topologyDecision || null;

  const universalSummary =
    uxmlTopology?.universalGraph?.summary ||
    readinessGate?.summary ||
    {};

  const raySummary =
    uxmlTopology?.rayGraph?.summary ||
    {};

  const comparisonSummary =
    uxmlTopology?.comparison?.summary ||
    {};

  const decisionSummary =
    decision?.summary ||
    readinessGate?.summary ||
    {};

  const enrichedDiagnostics = list(diagnostics).filter(d =>
    d?._source === 'uxml-topology' ||
    String(d?.code || '').startsWith('UXML-') ||
    String(d?.code || '').startsWith('RVM-UXML-')
  );

  return {
    schema: PANEL_SCHEMA,
    mode,
    modeLabel: topologyModeLabel(mode),
    active: mode === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY || !!uxmlTopology,
    hasTopology: !!uxmlTopology,
    exportAllowed: decision?.exportAllowed ?? readinessGate?.report?.allowPcfExport ?? false,
    outputBridgeReady: decision?.outputBridgeReady ?? readinessGate?.summary?.outputBridgeReady ?? false,
    legacyRoutingContinues:
      readinessGate?.summary?.legacyRoutingContinues === true ||
      uxmlTopology?.readinessGate?.summary?.legacyRoutingContinues === true,
    mastersDeferredToLegacyRoute:
      readinessGate?.summary?.mastersDeferredToLegacyRoute === true ||
      uxmlTopology?.readinessGate?.summary?.mastersDeferredToLegacyRoute === true,
    pcfEmitterDeferredToLegacyRoute:
      readinessGate?.summary?.pcfEmitterDeferredToLegacyRoute === true ||
      uxmlTopology?.readinessGate?.summary?.pcfEmitterDeferredToLegacyRoute === true,

    universal: {
      componentCount: number(uxmlTopology?.adapter?.stats?.componentCount),
      anchorCount: number(uxmlTopology?.adapter?.stats?.anchorCount),
      portCount: number(uxmlTopology?.adapter?.stats?.portCount),
      nodeCount: number(universalSummary.nodeCount || universalSummary.universalNodeCount),
      edgeCount: number(universalSummary.edgeCount || universalSummary.universalEdgeCount),
      disconnectedCount: number(universalSummary.disconnectedCount),
    },

    ray: {
      faceSnapCandidateCount: number(raySummary.faceSnapCandidateCount),
      rayCandidateCount: number(raySummary.rayCandidateCount),
      rayConnectionCount: number(raySummary.rayConnectionCount),
      branchConnectionCount: number(raySummary.branchConnectionCount),
      safeCandidateCount: number(raySummary.safeCandidateCount),
      blockedCandidateCount: number(raySummary.blockedCandidateCount),
      orphanCount: number(raySummary.orphanCount),
      ambiguousHitCount: number(raySummary.ambiguousHitCount),
      fallbackRayCandidateCount: number(raySummary.fallbackRayCandidateCount),
    },

    comparison: {
      agreementCount: number(comparisonSummary.agreementCount),
      universalOnlyCount: number(comparisonSummary.universalOnlyCount),
      rayOnlyCount: number(comparisonSummary.rayOnlyCount),
      promotionCandidateCount: number(comparisonSummary.promotionCandidateCount),
      faceProximityCandidateCount: number(comparisonSummary.faceProximityCandidateCount),
      rejectedRayCount: number(comparisonSummary.rejectedRayCount),
      manualReviewCount: number(comparisonSummary.manualReviewCount),
      unresolvedUniversalDisconnectedCount: number(comparisonSummary.unresolvedUniversalDisconnectedCount),
    },

    decision: {
      acceptedConnectionCount: number(decisionSummary.acceptedConnectionCount),
      agreementAcceptedCount: number(decisionSummary.agreementAcceptedCount),
      universalOnlyAcceptedCount: number(decisionSummary.universalOnlyAcceptedCount),
      rayPromotionAcceptedCount: number(decisionSummary.rayPromotionAcceptedCount),
      faceProximityAcceptedCount: number(decisionSummary.faceProximityAcceptedCount),
      manualReviewCount: number(decisionSummary.manualReviewCount),
      rejectedCount: number(decisionSummary.rejectedCount),
      unresolvedCount: number(decisionSummary.unresolvedCount),
    },

    acceptedConnections: list(decision?.acceptedConnections),
    manualReview: list(decision?.manualReview),
    rejected: list(decision?.rejected),
    unresolved: list(decision?.unresolved),
    diagnostics: enrichedDiagnostics,
  };
}

function acceptedConnectionTableHtml(items) {
  return tableHtml(
    [
      { label: 'Source', value: row => row.source || '' },
      { label: 'Decision', value: row => row.decision || '' },
      { label: 'Confidence', value: row => row.confidence || '' },
      { label: 'Component pair', value: row => componentPairText(row) },
      { label: 'Action', value: row => row.action || '' },
    ],
    list(items).slice(0, 80),
    'No accepted topology connections.'
  );
}

function manualReviewTableHtml(items) {
  return tableHtml(
    [
      { label: 'Source', value: row => row.source || '' },
      { label: 'Decision', value: row => row.decision || '' },
      { label: 'Component pair', value: row => componentPairText(row) },
      { label: 'Reason', value: row => row.reason || '' },
      { label: 'Recommended action', value: row => row.recommendedAction || row.rayCandidate?.recommendedAction || '' },
    ],
    list(items).slice(0, 80),
    'No manual-review topology items.'
  );
}

function unresolvedTableHtml(items) {
  return tableHtml(
    [
      { label: 'Component', value: row => row.universalDisconnected?.componentId || '' },
      { label: 'Role', value: row => row.universalDisconnected?.role || '' },
      { label: 'Pipeline', value: row => row.universalDisconnected?.pipelineRef || '' },
      { label: 'Decision', value: row => row.decision || '' },
      { label: 'Reason', value: row => row.reason || '' },
    ],
    list(items).slice(0, 80),
    'No unresolved disconnected topology items.'
  );
}

function rowIdentityDiagnosticsHtml(items) {
  return tableHtml(
    [
      { label: 'Severity', value: row => row.severity || row.level || 'INFO' },
      { label: 'Code', value: row => row.code || '' },
      { label: 'Row', value: row => diagIdentity(row).rowNo },
      { label: 'Ref', value: row => diagIdentity(row).refNo },
      { label: 'Seq', value: row => diagIdentity(row).seqNo },
      { label: 'Line', value: row => diagIdentity(row).lineNo },
      { label: 'Pipeline', value: row => diagIdentity(row).pipelineRef },
      { label: 'Message', value: row => row.message || '' },
    ],
    list(items).slice(0, 120),
    'No UXML topology diagnostics with row identity.'
  );
}

export function renderRvmUxmlTopologyDiagnosticsHtml({
  topologyMode = RVM_PCF_TOPOLOGY_MODES.LEGACY,
  uxmlTopology = null,
  readinessGate = null,
  diagnostics = [],
} = {}) {
  const vm = buildRvmUxmlTopologyDiagnosticsViewModel({
    topologyMode,
    uxmlTopology,
    readinessGate,
    diagnostics,
  });

  if (!vm.active) {
    return '';
  }

  return `
    <div class="rvm-pcf-extract-status-card rvm-uxml-topo-card">
      <div class="rvm-uxml-topo-title">
        <span>UXML Topology Mode Diagnostics</span>
        <span class="rvm-uxml-topo-mode">${esc(vm.modeLabel)}</span>
      </div>

      <div class="rvm-uxml-topo-pills">
        ${statusPill('Output bridge ready', vm.outputBridgeReady)}
        ${statusPill('Export allowed', vm.exportAllowed)}
        ${statusPill('Legacy route continues', vm.legacyRoutingContinues)}
        ${decisionPill('Accepted', vm.decision.acceptedConnectionCount)}
        ${decisionPill('Manual', vm.decision.manualReviewCount)}
        ${decisionPill('Rejected', vm.decision.rejectedCount)}
        ${decisionPill('Unresolved', vm.decision.unresolvedCount)}
      </div>

      <div class="rvm-uxml-topo-note">
        UXML mode replaces topology generation/checking only. Legacy master resolution and the existing PCF emitter continue after this gate.
      </div>

      <div class="rvm-uxml-topo-grid">
        <div class="rvm-uxml-topo-section">
          <h4>UniversalTopoGraph</h4>
          ${kvRowsHtml([
            ['Components', vm.universal.componentCount],
            ['Anchors', vm.universal.anchorCount],
            ['Ports', vm.universal.portCount],
            ['Nodes', vm.universal.nodeCount],
            ['Edges', vm.universal.edgeCount, vm.universal.edgeCount > 0 ? 'ok' : 'warn'],
            ['Disconnected', vm.universal.disconnectedCount, vm.universal.disconnectedCount > 0 ? 'warn' : 'ok'],
          ])}
        </div>

        <div class="rvm-uxml-topo-section">
          <h4>RayTopoGraph</h4>
          ${kvRowsHtml([
            ['P0 face snap candidates', vm.ray.faceSnapCandidateCount],
            ['Ray candidates', vm.ray.rayCandidateCount],
            ['Ray connections', vm.ray.rayConnectionCount],
            ['Branch connections', vm.ray.branchConnectionCount],
            ['Safe candidates', vm.ray.safeCandidateCount],
            ['Blocked candidates', vm.ray.blockedCandidateCount, vm.ray.blockedCandidateCount > 0 ? 'warn' : 'ok'],
            ['Orphans', vm.ray.orphanCount, vm.ray.orphanCount > 0 ? 'warn' : 'ok'],
            ['Fallback candidates', vm.ray.fallbackRayCandidateCount, vm.ray.fallbackRayCandidateCount > 0 ? 'warn' : ''],
          ])}
        </div>

        <div class="rvm-uxml-topo-section">
          <h4>Comparator</h4>
          ${kvRowsHtml([
            ['Agreements', vm.comparison.agreementCount],
            ['Universal-only', vm.comparison.universalOnlyCount],
            ['Ray-only', vm.comparison.rayOnlyCount],
            ['Promotions', vm.comparison.promotionCandidateCount],
            ['P0 review candidates', vm.comparison.faceProximityCandidateCount],
            ['Rejected Ray', vm.comparison.rejectedRayCount, vm.comparison.rejectedRayCount > 0 ? 'warn' : 'ok'],
            ['Manual review', vm.comparison.manualReviewCount, vm.comparison.manualReviewCount > 0 ? 'warn' : 'ok'],
            ['Unresolved disconnected', vm.comparison.unresolvedUniversalDisconnectedCount, vm.comparison.unresolvedUniversalDisconnectedCount > 0 ? 'warn' : 'ok'],
          ])}
        </div>

        <div class="rvm-uxml-topo-section">
          <h4>Decision Gate</h4>
          ${kvRowsHtml([
            ['Accepted connections', vm.decision.acceptedConnectionCount, vm.decision.acceptedConnectionCount > 0 ? 'ok' : 'warn'],
            ['Agreement accepted', vm.decision.agreementAcceptedCount],
            ['Universal-only accepted', vm.decision.universalOnlyAcceptedCount],
            ['Ray promotions accepted', vm.decision.rayPromotionAcceptedCount],
            ['P0 accepted', vm.decision.faceProximityAcceptedCount],
            ['Manual review', vm.decision.manualReviewCount, vm.decision.manualReviewCount > 0 ? 'warn' : 'ok'],
            ['Rejected', vm.decision.rejectedCount, vm.decision.rejectedCount > 0 ? 'warn' : 'ok'],
            ['Unresolved', vm.decision.unresolvedCount, vm.decision.unresolvedCount > 0 ? 'warn' : 'ok'],
          ])}
        </div>
      </div>

      <div class="rvm-uxml-topo-section rvm-uxml-topo-wide">
        <h4>Accepted topology connections</h4>
        ${acceptedConnectionTableHtml(vm.acceptedConnections)}
      </div>

      <div class="rvm-uxml-topo-section rvm-uxml-topo-wide">
        <h4>Manual review topology items</h4>
        ${manualReviewTableHtml(vm.manualReview)}
      </div>

      <div class="rvm-uxml-topo-section rvm-uxml-topo-wide">
        <h4>Unresolved disconnected items</h4>
        ${unresolvedTableHtml(vm.unresolved)}
      </div>

      <div class="rvm-uxml-topo-section rvm-uxml-topo-wide">
        <h4>UXML diagnostics with row identity</h4>
        ${rowIdentityDiagnosticsHtml(vm.diagnostics)}
      </div>
    </div>
  `;
}

export const createRvmUxmlTopologyDiagnosticsViewModel =
  buildRvmUxmlTopologyDiagnosticsViewModel;