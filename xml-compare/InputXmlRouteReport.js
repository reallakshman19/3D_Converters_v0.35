/**
 * InputXmlRouteReport.js
 *
 * Compact reporting layer for InputXML route results. This module summarizes
 * both native and UXML round-trip routes for display in the XML Diff panel.
 */

import {
  INPUTXML_IMPORT_ROUTES,
  inputXmlImportRouteLabel,
  normalizeInputXmlImportRoute,
} from './InputXmlImportRoutes.js';

function clean(value) {
  return String(value ?? '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function severityOf(diagnostic = {}) {
  const raw = String(diagnostic.severity || diagnostic.level || 'INFO').toUpperCase();

  if (raw === 'ERR' || raw === 'ERROR' || raw === 'FATAL') return 'ERROR';
  if (raw === 'WARN' || raw === 'WARNING') return 'WARNING';
  return 'INFO';
}

export function summarizeInputXmlDiagnostics(diagnostics = []) {
  const summary = {
    total: 0,
    error: 0,
    warning: 0,
    info: 0,
    byCode: {},
  };

  for (const diagnostic of asArray(diagnostics)) {
    const severity = severityOf(diagnostic);
    const code = clean(diagnostic.code || 'NO_CODE') || 'NO_CODE';

    summary.total += 1;
    summary[severity.toLowerCase()] += 1;
    summary.byCode[code] = (summary.byCode[code] || 0) + 1;
  }

  return summary;
}

function countUxmlAnchors(uxml) {
  if (Array.isArray(uxml?.anchors)) {
    return uxml.anchors.length;
  }

  const components = asArray(uxml?.components);
  return components.reduce((sum, component) => sum + countArray(component?.anchors), 0);
}

function countUxmlPorts(uxml) {
  if (Array.isArray(uxml?.ports)) {
    return uxml.ports.length;
  }

  const components = asArray(uxml?.components);
  return components.reduce((sum, component) => sum + countArray(component?.ports), 0);
}

function countUxmlPipelines(uxml) {
  return countArray(uxml?.pipelines);
}

function graphStats(graph) {
  const summary = graph?.summary || graph?.stats || {};

  return {
    nodeCount: Number(summary.nodeCount ?? graph?.nodeCount ?? countArray(graph?.nodes)),
    edgeCount: Number(summary.edgeCount ?? graph?.edgeCount ?? countArray(graph?.edges)),
    disconnectedCount: Number(
      summary.disconnectedCount ??
      graph?.disconnectedCount ??
      countArray(graph?.disconnected) ??
      countArray(graph?.disconnectedNodes)
    ),
  };
}

function countRayCandidates(graph) {
  const summary = graph?.summary || graph?.stats || {};
  return Number(
    summary.rayCandidateCount ??
    graph?.rayCandidateCount ??
    countArray(graph?.rayCandidates) ??
    countArray(graph?.candidates)
  );
}

function countRayConnections(graph) {
  const summary = graph?.summary || graph?.stats || {};
  return Number(
    summary.rayConnectionCount ??
    graph?.rayConnectionCount ??
    countArray(graph?.rayConnections) ??
    countArray(graph?.connections)
  );
}

function countPromotionCandidates(comparison) {
  const summary = comparison?.summary || comparison?.stats || {};
  return Number(
    summary.promotionCandidateCount ??
    comparison?.promotionCandidateCount ??
    countArray(comparison?.promotionCandidates)
  );
}

function countManualReview(decision) {
  const summary = decision?.summary || decision?.stats || {};
  return Number(
    summary.manualReviewCount ??
    decision?.manualReviewCount ??
    countArray(decision?.manualReview)
  );
}

function nativeRouteReport(importResult, diagnosticsSummary) {
  const components = asArray(importResult?.components);

  return {
    nativeBuilder: true,
    parsedFormat: clean(importResult?.native?.parsedFormat || importResult?.summary?.parsedFormat),
    componentCount: components.length,
    supportCount: components.filter((component) => String(component?.type || '').toUpperCase() === 'SUPPORT').length,
    graph: {
      nativeBuilder: true,
      universalNodeCount: null,
      universalEdgeCount: null,
      rayCandidateCount: null,
      rayConnectionCount: null,
      exportAllowed: null,
    },
    diagnostics: diagnosticsSummary,
  };
}

function uxmlRouteReport(importResult, diagnosticsSummary) {
  const roundTrip = importResult?.uxmlRoundTrip || {};
  const uxml = roundTrip.uxml || {};
  const universalStats = graphStats(roundTrip.universalGraph);
  const rayStats = graphStats(roundTrip.rayGraph);
  const comparison = roundTrip.comparison || {};
  const decision = roundTrip.topologyDecision || {};

  return {
    nativeBuilder: false,
    componentCount: countArray(importResult?.components),
    uxml: {
      componentCount: countArray(uxml?.components),
      anchorCount: countUxmlAnchors(uxml),
      portCount: countUxmlPorts(uxml),
      pipelineCount: countUxmlPipelines(uxml),
      validationPass: roundTrip.validation?.pass ?? roundTrip.validation?.ok ?? roundTrip.validation?.ready ?? null,
    },
    topology: {
      universalNodeCount: universalStats.nodeCount,
      universalEdgeCount: universalStats.edgeCount,
      universalDisconnectedCount: universalStats.disconnectedCount,
      rayNodeCount: rayStats.nodeCount,
      rayEdgeCount: rayStats.edgeCount,
      rayDisconnectedCount: rayStats.disconnectedCount,
      rayCandidateCount: countRayCandidates(roundTrip.rayGraph),
      rayConnectionCount: countRayConnections(roundTrip.rayGraph),
      promotionCandidateCount: countPromotionCandidates(comparison),
      manualReviewCount: countManualReview(decision),
      exportAllowed: decision?.exportAllowed === true,
      outputBridgeReady: decision?.outputBridgeReady === true || roundTrip.summary?.outputBridgeReady === true,
    },
    diagnostics: diagnosticsSummary,
  };
}

export function buildInputXmlRouteReport(importResult, options = {}) {
  const route = normalizeInputXmlImportRoute(importResult?.route || options.route);
  const diagnostics = asArray(importResult?.diagnostics);
  const diagnosticsSummary = summarizeInputXmlDiagnostics(diagnostics);
  const fileName = clean(importResult?.fileName || options.fileName || 'input.xml');

  const base = {
    schema: 'inputxml-route-report/v1',
    route,
    routeLabel: inputXmlImportRouteLabel(route),
    fileName,
    ok: importResult?.ok !== false,
    componentCount: countArray(importResult?.components),
    diagnosticsCount: diagnostics.length,
    diagnosticsSummary,
  };

  if (route === INPUTXML_IMPORT_ROUTES.NATIVE_XML_BUILDER) {
    const native = nativeRouteReport(importResult, diagnosticsSummary);
    return {
      ...base,
      mode: 'native',
      native,
      uxml: null,
      topology: native.graph,
    };
  }

  const uxml = uxmlRouteReport(importResult, diagnosticsSummary);

  return {
    ...base,
    mode: 'uxml-round-trip',
    native: null,
    uxml: uxml.uxml,
    topology: uxml.topology,
  };
}

export function formatInputXmlRouteReportLines(report) {
  if (!report) return ['No InputXML route report available.'];

  const lines = [
    `Route: ${report.routeLabel || report.route}`,
    `File: ${report.fileName || '-'}`,
    `Status: ${report.ok ? 'OK' : 'FAILED'}`,
    `Components: ${report.componentCount ?? 0}`,
    `Diagnostics: ${report.diagnosticsSummary?.total ?? report.diagnosticsCount ?? 0}`,
  ];

  if (report.mode === 'native') {
    lines.push('Native Builder: yes');
    lines.push(`Parsed Format: ${report.native?.parsedFormat || '-'}`);
    lines.push(`Supports: ${report.native?.supportCount ?? 0}`);
    return lines;
  }

  lines.push(`UXML Components: ${report.uxml?.componentCount ?? 0}`);
  lines.push(`UXML Anchors: ${report.uxml?.anchorCount ?? 0}`);
  lines.push(`UXML Ports: ${report.uxml?.portCount ?? 0}`);
  lines.push(`Universal Nodes: ${report.topology?.universalNodeCount ?? '-'}`);
  lines.push(`Universal Edges: ${report.topology?.universalEdgeCount ?? '-'}`);
  lines.push(`Ray Candidates: ${report.topology?.rayCandidateCount ?? '-'}`);
  lines.push(`Ray Connections: ${report.topology?.rayConnectionCount ?? '-'}`);
  lines.push(`Export Allowed: ${report.topology?.exportAllowed === true ? 'yes' : 'no'}`);

  return lines;
}
