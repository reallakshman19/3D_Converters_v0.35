/**
 * InputXmlUxmlRoundTripRoute.js
 *
 * Runs the native InputXML -> UXML -> topology -> viewer round-trip route.
 */

import { createUxmlDocument, createUxmlSource } from '../uxml/UxmlTypes.js';
import { XML_PROFILES } from '../uxml/UxmlConstants.js';
import { mapInputXmlToUxml } from '../uxml/UxmlInputXmlSchemaMapper.js';
import { validateUxmlDocument } from '../uxml/UxmlValidationGate.js';
import { buildUxmlFaceModel } from '../uxml/UxmlFaceModelBuilder.js';
import { buildUxmlUniversalTopoGraph } from '../uxml/UxmlUniversalTopoGraphBuilder.js';
import { buildUxmlRayTopoGraph } from '../uxml/UxmlRayTopoGraphBuilder.js';
import { compareUxmlTopoGraphs } from '../uxml/UxmlTopoGraphComparator.js';
import { decideUxmlTopologyAcceptance } from '../uxml/UxmlTopologyDecisionGate.js';
import { uxmlToViewerComponents } from './InputXmlUxmlToViewerComponents.js';

const INPUTXML_UXML_ROUND_TRIP_ROUTE_SCHEMA = 'inputxml-uxml-roundtrip-route/v1';

function clean(value) {
  return String(value ?? '').trim();
}

function numberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function severityOf(diagnostic = {}) {
  const raw = String(diagnostic.severity || diagnostic.level || 'INFO').toUpperCase();

  if (raw === 'ERR' || raw === 'ERROR' || raw === 'FATAL') return 'ERROR';
  if (raw === 'WARN' || raw === 'WARNING') return 'WARNING';
  return 'INFO';
}

function cloneDiagnostic(diagnostic, source) {
  return {
    ...diagnostic,
    severity: severityOf(diagnostic),
    level: severityOf(diagnostic),
    _source: source,
  };
}

function collectDiagnostics(source, value, out) {
  if (!out) return;

  const items = [];

  if (Array.isArray(value)) {
    items.push(...value);
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value.diagnostics)) items.push(...value.diagnostics);
    if (Array.isArray(value.warnings)) items.push(...value.warnings);
    if (Array.isArray(value.blockers)) items.push(...value.blockers);
    if (Array.isArray(value.lossContract)) items.push(...value.lossContract);
  }

  for (const item of items) {
    out.push(cloneDiagnostic(item, source));
  }
}

export function flattenInputXmlUxmlDiagnostics(parts = {}) {
  const diagnostics = [];
  collectDiagnostics('uxml', parts.uxml, diagnostics);
  collectDiagnostics('validation', parts.validation, diagnostics);
  collectDiagnostics('faceModel', parts.faceModel, diagnostics);
  collectDiagnostics('universalGraph', parts.universalGraph, diagnostics);
  collectDiagnostics('rayGraph', parts.rayGraph, diagnostics);
  collectDiagnostics('comparison', parts.comparison, diagnostics);
  collectDiagnostics('topologyDecision', parts.topologyDecision, diagnostics);
  return diagnostics;
}

function buildSourceDocument(fileName) {
  const doc = createUxmlDocument();
  const source = createUxmlSource({
    id: 'INPUTXML-PRIMARY',
    format: XML_PROFILES.INPUT_XML,
    name: fileName,
    role: 'PRIMARY',
  });

  doc.sources.push(source);
  doc.profile = XML_PROFILES.INPUT_XML;
  return { doc, sourceId: source.id };
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function runInputXmlUxmlRoundTrip(xmlText, options = {}) {
  const normalizedOptions = {
    fileName: clean(options.fileName || 'input.xml'),
    connectToleranceMm: clampNumber(options.connectToleranceMm, 0, 1000, 6),
    fixToleranceMm: clampNumber(options.fixToleranceMm, 0, 100, 25),
    maxRayLengthMm: clampNumber(options.maxRayLengthMm, 1, 5000, 500),
    tubeToleranceMm: clampNumber(
      options.tubeToleranceMm ?? options.perpendicularToleranceMm,
      0,
      1000,
      12
    ),
    allowPartialImport: options.allowPartialImport === true,
    allowPartialExport: options.allowPartialExport === true,
  };

  const result = {
    schema: INPUTXML_UXML_ROUND_TRIP_ROUTE_SCHEMA,
    ok: false,
    route: 'UXML_ROUND_TRIP',
    fileName: normalizedOptions.fileName,
    profile: XML_PROFILES.INPUT_XML,
    options: normalizedOptions,
    uxml: null,
    validation: null,
    faceModel: null,
    universalGraph: null,
    rayGraph: null,
    comparison: null,
    topologyDecision: null,
    components: [],
    diagnostics: [],
    summary: {
      route: 'UXML_ROUND_TRIP',
      componentCount: 0,
      uxmlComponentCount: 0,
      anchorCount: 0,
      portCount: 0,
      universalNodeCount: 0,
      universalEdgeCount: 0,
      disconnectedCount: 0,
      rayCandidateCount: 0,
      rayConnectionCount: 0,
      promotionCandidateCount: 0,
      manualReviewCount: 0,
      exportAllowed: false,
      outputBridgeReady: false,
    },
  };

  try {
    const { doc, sourceId } = buildSourceDocument(normalizedOptions.fileName);

    const mapperResult = mapInputXmlToUxml(String(xmlText ?? ''), doc, sourceId, {
      fileName: normalizedOptions.fileName,
      sourceName: normalizedOptions.fileName,
    });

    const uxml = mapperResult?.doc || doc;
    const validation = validateUxmlDocument(uxml);
    const faceModel = buildUxmlFaceModel(uxml, {
      allowPartial: true,
    });
    const universalGraph = buildUxmlUniversalTopoGraph(uxml, {
      faceModel,
      allowPartialFaceModel: true,
      allowBlockedFaceModel: true,
      connectToleranceMm: normalizedOptions.connectToleranceMm,
    });
    const rayGraph = buildUxmlRayTopoGraph(uxml, {
      faceModel,
      universalGraph,
      allowPartialFaceModel: true,
      allowBlockedFaceModel: true,
      maxRayLengthMm: normalizedOptions.maxRayLengthMm,
      tubeToleranceMm: normalizedOptions.tubeToleranceMm,
    });
    const comparison = compareUxmlTopoGraphs(uxml, {
      universalGraph,
      rayGraph,
      allowBlockedGraphs: true,
    });
    const topologyDecision = decideUxmlTopologyAcceptance(uxml, {
      comparison,
      allowPartialExport: normalizedOptions.allowPartialExport,
      acceptUniversalOnly: true,
      allowSafeRayPromotions: true,
      allowFaceProximityPromotions: false,
      maxPromotionDistanceAlongRayMm: normalizedOptions.maxRayLengthMm,
      maxPromotionPerpendicularMissMm: normalizedOptions.tubeToleranceMm,
    });

    const diagnostics = flattenInputXmlUxmlDiagnostics({
      uxml: {
        diagnostics: asArray(uxml?.diagnostics),
        lossContract: asArray(uxml?.lossContract),
      },
      validation,
      faceModel,
      universalGraph,
      rayGraph,
      comparison,
      topologyDecision,
    });

    const components = uxmlToViewerComponents(uxml, {
      diagnostics,
      faceModel,
      universalGraph,
      rayGraph,
      topologyDecision,
    });

    const exportAllowed = topologyDecision?.exportAllowed === true;
    const ok = exportAllowed || normalizedOptions.allowPartialImport === true;

    result.ok = ok;
    result.uxml = uxml;
    result.validation = validation;
    result.faceModel = faceModel;
    result.universalGraph = universalGraph;
    result.rayGraph = rayGraph;
    result.comparison = comparison;
    result.topologyDecision = topologyDecision;
    result.components = components;
    result.diagnostics = diagnostics;
    result.summary = {
      route: 'UXML_ROUND_TRIP',
      componentCount: components.length,
      uxmlComponentCount: countArray(uxml?.components),
      anchorCount: countArray(uxml?.anchors),
      portCount: countArray(uxml?.ports),
      universalNodeCount: countArray(universalGraph?.nodes),
      universalEdgeCount: countArray(universalGraph?.edges),
      disconnectedCount: countArray(universalGraph?.disconnected),
      rayCandidateCount: countArray(rayGraph?.rayCandidates),
      rayConnectionCount: countArray(rayGraph?.rayConnections),
      promotionCandidateCount: countArray(comparison?.promotionCandidates),
      manualReviewCount: countArray(topologyDecision?.manualReview),
      exportAllowed,
      outputBridgeReady: topologyDecision?.outputBridgeReady === true,
    };

    return result;
  } catch (error) {
    const message = String(error?.message || error);
    result.ok = false;
    result.diagnostics = [
      {
        severity: 'ERROR',
        level: 'ERROR',
        code: 'INPUTXML-UXML-ROUNDTRIP-FAILED',
        message,
        _source: 'route',
      },
    ];
    result.summary.error = message;
    return result;
  }
}
