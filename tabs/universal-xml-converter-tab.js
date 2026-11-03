/**
 * universal-xml-converter-tab.js
 * Universal XML converter workbench with CL1 route package chain.
 *
 * Inputs:
 * - XML, InputXML, or UXML source text plus optional source metadata.
 * Outputs:
 * - Profile detection, UXML pipeline state, route handoff, CL1 package,
 *   CL1 snapshot, replay validation, and one-screen CL1 summary.
 * Fallback:
 * - Raw PCF, JSON, TXT, PDF, and REV sources must use the existing
 *   converter bridge before UXML normalization.
 */

import { XML_PROFILES } from '../uxml/UxmlConstants.js';
import { detectXmlProfile } from '../uxml/UxmlProfileDetector.js';
import { normalizeXmlToUxml } from '../uxml/UxmlNormalizer.js';
import { validateUxmlDocument } from '../uxml/UxmlValidationGate.js';
import { buildUxmlFaceModel } from '../uxml/UxmlFaceModelBuilder.js';
import { buildUxmlUniversalTopoGraph } from '../uxml/UxmlUniversalTopoGraphBuilder.js';
import { buildUxmlRayTopoGraph } from '../uxml/UxmlRayTopoGraphBuilder.js';
import { compareUxmlTopoGraphs } from '../uxml/UxmlTopoGraphComparator.js';
import { decideUxmlTopologyAcceptance } from '../uxml/UxmlTopologyDecisionGate.js';
import {
  UXML_ROUTE_TARGETS,
  createUxmlRouteHandoffPayload,
  summarizeUxmlRouteHandoff,
} from '../uxml/UxmlRouteHandoffPolicy.js';
import {
  createUxmlCl1RoutePackage,
  summarizeUxmlCl1RoutePackage,
} from '../uxml/UxmlCl1RoutePackage.js';
import {
  buildUxmlCl1PackageSnapshot,
  serializeUxmlCl1PackageSnapshot,
} from '../uxml/UxmlCl1PackageSnapshot.js';
import {
  summarizeUxmlCl1SnapshotReplay,
  validateUxmlCl1SnapshotReplay,
} from '../uxml/UxmlCl1SnapshotReplayValidator.js';
import {
  buildUxmlCl1WorkbenchSummary,
  summarizeUxmlCl1WorkbenchSummary,
} from '../uxml/UxmlCl1WorkbenchSummary.js';
import {
  resolveUxmlSourceIntakeRoute,
  runUxmlSourceIntakeBridge,
} from '../uxml/UxmlSourceIntakeBridge.js';

const SOURCE_TYPES = Object.freeze([
  { value: 'AUTO', label: 'Auto detect' },
  { value: 'STANDARD_XML', label: 'Standard XML' },
  { value: 'INPUT_XML', label: 'InputXML' },
  { value: 'UXML', label: 'UXML' },
  { value: 'PCF', label: 'PCF -> Standard XML -> UXML' },
  { value: 'PDF', label: 'PDF -> InputXML -> UXML' },
  { value: 'STAGED_JSON', label: 'Staged JSON -> InputXML -> UXML' },
  { value: 'REV_TO_XML', label: 'REV -> XML' },
  { value: 'JSON_TO_XML', label: 'JSON / staged JSON (legacy alias)' },
  { value: 'TXT_TO_XML', label: 'Attribute TXT -> XML' },
]);

const PIPELINE_STAGES = Object.freeze([
  { id: 'source', title: '1. Source Intake', description: 'Load PDF, REV, JSON, TXT, PCF, or XML source.' },
  { id: 'existing-converter', title: '2. Source Intake Bridge', description: 'Route PCF/PDF/Staged JSON through bridge conversion before UXML normalization.' },
  { id: 'uxml', title: '3. UXML Normalization', description: 'Normalize InputXML, Standard XML, or UXML into the Universal XML contract.' },
  { id: 'geometry-preview', title: '4. Geometry Preview', description: 'Render a lightweight UXML segment preview before topology decisions.' },
  { id: 'validation', title: '5. UXML Validation', description: 'Validate UXML structure, anchors, bore, branches, supports, and loss contract.' },
  { id: 'face-model', title: '6. Pre-Topology Face Model', description: 'Emit component/fitting faces for RayTopoBuilder before final topology.' },
  { id: 'universal-topology', title: '7. UniversalTopoGraph', description: 'Build a source-faithful topology graph from UXML faces.' },
  { id: 'ray-topology', title: '8. RayTopoGraph', description: 'Run the legacy-inspired Ray topology as an independent benchmark.' },
  { id: 'comparison', title: '9. Topology Comparison', description: 'Compare UniversalTopoGraph and RayTopoGraph evidence.' },
  { id: 'decision-gate', title: '10. Decision Gate', description: 'Convert comparator evidence into accepted, manual, or rejected topology decisions.' },
  { id: 'route-handoff', title: '11. Route Handoff Policy', description: 'Decide what downstream route may receive accepted topology evidence.' },
  { id: 'cl1-package', title: '12. Route Package', description: 'Create deterministic downstream route payload metadata without emitting PCF.' },
  { id: 'cl1-snapshot', title: '13. Snapshot JSON', description: 'Create deterministic debug/replay JSON snapshot from the CL1 package.' },
  { id: 'cl1-replay', title: '14. Replay Validator', description: 'Validate saved CL1 snapshot structure for debug/replay readiness.' },
  { id: 'cl1-summary', title: '15. QA Summary', description: 'One-screen status summary for decision, route handoff, CL1 package, and replay validation.' },
  { id: 'outputs', title: '16. Route Targets', description: 'Target routes such as Extract PCF, GLB, 2D, InputXML, or CII.' },
  { id: 'masters', title: '17. Masters by Target Route', description: 'Masters are handled by the downstream route. JSON/RVM -> PCF uses the existing legacy master route.' },
]);

const FULL_PIPELINE_ACTIONS = Object.freeze([
  'detect-profile',
  'convert-uxml',
  'build-geometry-preview',
  'validate-uxml',
  'build-face-model',
  'build-universal-topology',
  'build-ray-topology',
  'compare-topology',
  'run-decision-gate',
  'run-route-handoff',
  'run-cl1-package',
  'run-cl1-snapshot',
  'run-cl1-replay',
  'run-cl1-summary',
]);

let defaultUniversalXmlConverterExecutor = null;

export function setUniversalXmlConverterExecutor(executor) {
  defaultUniversalXmlConverterExecutor = typeof executor === 'function' ? executor : null;
}

// ── UI grouping constants ──────────────────────────────────────────────────

const STAGE_SHORT_TITLES = Object.freeze({
  'source':             'Source Intake',
  'existing-converter': 'Intake Bridge',
  'uxml':               'UXML Normalize',
  'geometry-preview':   'Geometry Preview',
  'validation':         'UXML Validation',
  'face-model':         'Face Model',
  'universal-topology': 'Universal Topo',
  'ray-topology':       'Ray TopoGraph',
  'comparison':         'Topo Compare',
  'decision-gate':      'Decision Gate',
  'route-handoff':      'Route Handoff',
  'cl1-package':        'Package',
  'cl1-snapshot':       'Snapshot',
  'cl1-replay':         'Replay',
  'cl1-summary':        'QA Summary',
  'outputs':            'Route Targets',
  'masters':            'Masters/Route',
});

const STAGE_GROUPS = Object.freeze([
  { label: 'Input',        stages: ['source', 'existing-converter'] },
  { label: 'Normalize',    stages: ['uxml', 'geometry-preview'] },
  { label: 'Validate',     stages: ['validation', 'face-model'] },
  { label: 'Topology',     stages: ['universal-topology', 'ray-topology', 'comparison', 'decision-gate'] },
  { label: 'Pipeline', stages: ['route-handoff', 'cl1-package', 'cl1-snapshot', 'cl1-replay', 'cl1-summary'] },
  { label: 'Downstream',   stages: ['outputs', 'masters'] },
]);

const STAGE_TO_ACTION = Object.freeze({
  'source':             null,
  'existing-converter': 'run-source-intake-bridge',
  'uxml':               'convert-uxml',
  'geometry-preview':   'build-geometry-preview',
  'validation':         'validate-uxml',
  'face-model':         'build-face-model',
  'universal-topology': 'build-universal-topology',
  'ray-topology':       'build-ray-topology',
  'comparison':         'compare-topology',
  'decision-gate':      'run-decision-gate',
  'route-handoff':      'run-route-handoff',
  'cl1-package':        'run-cl1-package',
  'cl1-snapshot':       'run-cl1-snapshot',
  'cl1-replay':         'run-cl1-replay',
  'cl1-summary':        'run-cl1-summary',
  'outputs':            null,
  'masters':            null,
});

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isScalar(value) {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

function statusClass(kind) {
  const value = String(kind || 'info').toLowerCase();
  if (value === 'ok') return 'uxml-status-ok';
  if (value === 'warn') return 'uxml-status-warn';
  if (value === 'error') return 'uxml-status-error';
  return 'uxml-status-info';
}

function reportPass(report) {
  if (!report) return false;
  return report.pass === true ||
    report.ok === true ||
    report.ready === true ||
    report.replayReady === true ||
    report.allowed === true ||
    report.outputBridgeReady === true ||
    report.exportAllowed === true ||
    report.readyForRouteConsumption === true ||
    report.schema === 'uxml-cl1-package-snapshot/v1';
}

function summarizeReport(report) {
  if (!report) return { pass: false, label: 'Not run', rows: [] };

  const rows = [];
  const push = (key, value) => {
    if (isScalar(value)) rows.push([key, value]);
  };

  push('schema', report.schema);
  push('profile', report.profile);
  push('confidence', report.confidence);
  push('targetRoute', report.targetRoute);
  push('snapshotId', report.snapshotId);
  push('packageId', report.packageId);
  push('overallStatus', report.overallStatus);
  push('ready', report.ready);
  push('ok', report.ok);
  push('allowed', report.allowed);
  push('replayReady', report.replayReady);
  push('outputBridgeReady', report.outputBridgeReady);
  push('exportAllowed', report.exportAllowed);
  push('blockCode', report.blockCode);
  push('blockedReason', report.blockedReason);

  const stats = report.stats || report.summary || {};
  for (const [key, value] of Object.entries(stats)) push(key, value);

  for (const [key, value] of Object.entries(report)) {
    if ([
      'stats',
      'summary',
      'report',
      'payload',
      'policy',
      'diagnostics',
      'lossContract',
      'stages',
    ].includes(key)) continue;
    push(key, value);
  }

  return {
    pass: reportPass(report),
    label: reportPass(report) ? 'Ready' : 'Review',
    rows: rows.slice(0, 36),
  };
}

function createInitialState() {
  return {
    sourceFile: null,
    sourceFileObject: null,
    sourceBlob: null,
    sourceArrayBuffer: null,
    sourceText: '',
    selectedSourceType: 'AUTO',
    detectedSourceType: 'AUTO',
    converterExecutor: null,
    bridgeOutputText: '',
    bridgeOutputProfile: '',
    activePanel: 'source',
    status: { kind: 'info', message: 'Universal XML Converter tab is ready.' },
    pipeline: {
      profileReport: null,
      sourceIntakeBridge: null,
      normalizerResult: null,
      uxml: null,
      geometryPreview: null,
      validationReport: null,
      faceModel: null,
      universalGraph: null,
      rayGraph: null,
      comparison: null,
      topologyDecision: null,
      routeHandoff: null,
      cl1RoutePackage: null,
      cl1Snapshot: null,
      cl1ReplayValidation: null,
      cl1WorkbenchSummary: null,
    },
    reports: {
      source: null,
      'existing-converter': null,
      uxml: null,
      'geometry-preview': null,
      validation: null,
      'face-model': null,
      'universal-topology': null,
      'ray-topology': null,
      comparison: null,
      'decision-gate': null,
      'route-handoff': null,
      'cl1-package': null,
      'cl1-snapshot': null,
      'cl1-replay': null,
      'cl1-summary': null,
      outputs: null,
      masters: null,
    },
  };
}

function sourceTypeFromProfile(profile) {
  if (profile === XML_PROFILES.UXML) return 'UXML';
  if (profile === XML_PROFILES.INPUT_XML) return 'INPUT_XML';
  if (profile === XML_PROFILES.STANDARD_XML || profile === XML_PROFILES.BENCHMARK_XML) return 'STANDARD_XML';
  return 'AUTO';
}

function extensionFallbackSourceType(fileName, text) {
  const name = String(fileName || '').toLowerCase();
  const trimmed = String(text || '').trimStart();

  if (name.endsWith('.pcf')) return 'PCF';
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.rev') || name.endsWith('.rvm')) return 'REV_TO_XML';
  if (name.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) return 'STAGED_JSON';
  if (name.endsWith('.txt')) return 'TXT_TO_XML';
  return 'AUTO';
}

export function detectSourceType(fileName, text) {
  const safeFileName = String(fileName || '');
  const profile = detectXmlProfile(text, { fileName: safeFileName });

  if (profile.isKnownProfile) {
    return sourceTypeFromProfile(profile.profile);
  }

  if (safeFileName.toLowerCase().includes('input') && safeFileName.toLowerCase().endsWith('.xml')) {
    return 'INPUT_XML';
  }

  return extensionFallbackSourceType(safeFileName, text);
}

function normalizeSelectedSourceType(value) {
  const selected = String(value || 'AUTO').toUpperCase();

  if (selected === 'EXISTING_XML') return 'STANDARD_XML';
  if (selected === 'PDF_TO_INPUTXML') return 'PDF';
  if (selected === 'JSON_TO_XML') return 'STAGED_JSON';
  if (selected === 'STAGEDJSON_TO_INPUTXML') return 'STAGED_JSON';

  return selected || 'AUTO';
}

function effectiveSourceType(state) {
  const selected = normalizeSelectedSourceType(state.selectedSourceType);

  return selected === 'AUTO'
    ? normalizeSelectedSourceType(state.detectedSourceType)
    : selected;
}

function isDirectXmlSourceType(sourceType) {
  return ['AUTO', 'UXML', 'INPUT_XML', 'STANDARD_XML', 'EXISTING_XML'].includes(
    normalizeSelectedSourceType(sourceType)
  );
}

function isBridgeSourceType(sourceType) {
  return ['PCF', 'PDF', 'STAGED_JSON'].includes(normalizeSelectedSourceType(sourceType));
}

function sourceIntakeRouteSummary(state) {
  return resolveUxmlSourceIntakeRoute({
    fileName: state.sourceFile?.name || '',
    text: state.sourceText || '',
    selectedSourceType: effectiveSourceType(state),
  });
}

function stageReport(stageId, report) {
  return {
    stageId,
    pass: reportPass(report),
    schema: report?.schema || '',
    summary: report?.summary || report?.stats || {},
    report,
  };
}

function ensureXmlSource(state) {
  const selected = effectiveSourceType(state);

  if (!String(state.sourceText || '').trim()) {
    throw new Error('Load XML/InputXML/UXML source text before running the UXML pipeline.');
  }

  if (isDirectXmlSourceType(selected)) {
    return;
  }

  if (isBridgeSourceType(selected) && state.pipeline.sourceIntakeBridge?.normalized?.uxml) {
    return;
  }

  if (isBridgeSourceType(selected)) {
    throw new Error(`${selected} must go through the existing converter bridge before UXML normalization. Source Intake Bridge covers PCF/PDF/Staged JSON.`);
  }

  if (!['AUTO', 'UXML', 'INPUT_XML', 'STANDARD_XML', 'EXISTING_XML'].includes(selected)) {
    throw new Error(`${selected} must go through the existing converter bridge before UXML normalization.`);
  }
}

function setSourceReport(state, profileReport) {
  state.reports.source = stageReport('source', {
    pass: profileReport.isKnownProfile,
    profile: profileReport.profile,
    confidence: profileReport.confidence,
    blockers: profileReport.blockers || [],
    stats: profileReport.stats || {},
    shouldBlockTopologyBuild: profileReport.shouldBlockTopologyBuild,
    rootName: profileReport.rootName || '',
  });
}

function isFinitePoint(point) {
  return point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    Number.isFinite(Number(point.z));
}

function pointKey(point) {
  return [
    Number(point.x).toFixed(3),
    Number(point.y).toFixed(3),
    Number(point.z).toFixed(3),
  ].join(',');
}

function buildUxmlGeometryPreview(uxml) {
  const anchors = Array.isArray(uxml?.anchors) ? uxml.anchors : [];
  const segments = Array.isArray(uxml?.segments) ? uxml.segments : [];
  const components = Array.isArray(uxml?.components) ? uxml.components : [];
  const anchorById = new Map(anchors.map(anchor => [anchor.id, anchor]));
  const componentById = new Map(components.map(component => [component.id, component]));
  const lines = [];
  const coordCounts = new Map();
  const componentTypeCounts = {};
  let zeroBoreComponentCount = 0;
  let missingSegmentComponentCount = 0;

  for (const anchor of anchors) {
    if (!isFinitePoint(anchor.point)) continue;
    const key = pointKey(anchor.point);
    coordCounts.set(key, (coordCounts.get(key) || 0) + 1);
  }

  for (const component of components) {
    const componentType = String(component.normalizedType || component.type || 'UNKNOWN').toUpperCase();
    componentTypeCounts[componentType] = (componentTypeCounts[componentType] || 0) + 1;

    if (!Number.isFinite(Number(component.bore)) || Number(component.bore) <= 0) {
      zeroBoreComponentCount += 1;
    }
    if (!Array.isArray(component.segmentIds) || component.segmentIds.length === 0) {
      missingSegmentComponentCount += 1;
    }
  }

  for (const segment of segments) {
    const start = anchorById.get(segment.startAnchorId);
    const end = anchorById.get(segment.endAnchorId);
    if (!isFinitePoint(start?.point) || !isFinitePoint(end?.point)) continue;

    const component = componentById.get(segment.componentId);
    lines.push({
      componentId: segment.componentId,
      type: component?.normalizedType || component?.type || segment.type || 'UNKNOWN',
      bore: Number(segment.bore || component?.bore || 0),
      start: start.point,
      end: end.point,
    });
  }

  const finitePoints = lines.flatMap(line => [line.start, line.end]);
  const xs = finitePoints.map(point => Number(point.x));
  const ys = finitePoints.map(point => Number(point.y));
  const zs = finitePoints.map(point => Number(point.z));
  const bounds = finitePoints.length ? {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  } : null;
  const collapsedAnchorGroupCount = [...coordCounts.values()].filter(value => value > 12).length;
  const allFiniteAnchorsCollapsed = coordCounts.size === 1 && anchors.length > 2;
  const caesarDetails = (Array.isArray(uxml?.diagnostics) ? uxml.diagnostics : [])
    .find(diagnostic => diagnostic.code === 'UXML-INPUTXML-CAESAR-PIPINGELEMENTS')?.details || {};
  const absoluteGeometryCommentCount = count(caesarDetails.absoluteGeometryCommentCount);
  const seededComponentCount = count(caesarDetails.seededComponentCount);
  const fallbackCoordinateReconstruction =
    absoluteGeometryCommentCount === 0 && seededComponentCount > 1;
  const geometrySource = absoluteGeometryCommentCount > 0
    ? 'absolute UXML_GEOM'
    : fallbackCoordinateReconstruction
      ? 'delta fallback only'
      : 'source coordinates';
  const ok = lines.length > 0 &&
    !allFiniteAnchorsCollapsed &&
    zeroBoreComponentCount === 0 &&
    !fallbackCoordinateReconstruction;

  return {
    schema: 'uxml-geometry-preview/v1',
    ok,
    summary: {
      componentCount: components.length,
      anchorCount: anchors.length,
      segmentCount: segments.length,
      lineCount: lines.length,
      uniqueAnchorCoordinateCount: coordCounts.size,
      collapsedAnchorGroupCount,
      zeroBoreComponentCount,
      missingSegmentComponentCount,
      componentTypeCounts,
      allFiniteAnchorsCollapsed,
      geometrySource,
      absoluteGeometryCommentCount,
      seededComponentCount,
      fallbackCoordinateReconstruction,
    },
    bounds,
    lines,
  };
}

function ensureValidationReady(state, stageName) {
  if (!state.pipeline.uxml) runPipelineAction(state, 'convert-uxml');
  const report = state.pipeline.validationReport || runPipelineAction(state, 'validate-uxml');

  if (!report.ready) {
    throw new Error(`${stageName} blocked because UXML validation has ${count(report.stats?.blockerCount)} blocker(s).`);
  }

  return report;
}

export function runPipelineAction(state, action) {
  if (!state || typeof state !== 'object') {
    throw new Error('runPipelineAction requires a state object.');
  }

  if (action === 'detect-profile') {
    const profileReport = detectXmlProfile(state.sourceText, {
      fileName: state.sourceFile?.name || '',
      selectedSourceType: state.selectedSourceType,
    });

    state.pipeline.profileReport = profileReport;
    state.detectedSourceType = profileReport.isKnownProfile
      ? sourceTypeFromProfile(profileReport.profile)
      : extensionFallbackSourceType(state.sourceFile?.name || '', state.sourceText);
    setSourceReport(state, profileReport);
    state.status = profileReport.shouldBlockTopologyBuild
      ? { kind: 'warn', message: `Profile requires review: ${profileReport.blockers.join(', ') || profileReport.profile}` }
      : { kind: 'ok', message: `Detected XML profile: ${profileReport.profile}.` };
    return profileReport;
  }

  if (action === 'convert-uxml') {
    const selected = effectiveSourceType(state);

    if (isBridgeSourceType(selected) && state.pipeline.sourceIntakeBridge?.normalized?.uxml) {
      const normalized = state.pipeline.sourceIntakeBridge.normalized;

      state.pipeline.normalizerResult = normalized;
      state.pipeline.uxml = normalized.uxml;
      state.reports.uxml = stageReport('uxml', normalized);
      state.status = normalized.ok
        ? {
            kind: 'ok',
            message: `UXML normalization complete from ${selected} bridge. Components=${count(normalized.stats?.componentCount)}, Anchors=${count(normalized.stats?.anchorCount)}.`,
          }
        : {
            kind: 'error',
            message: 'UXML normalization from bridge output blocked.',
          };

      return normalized;
    }

    ensureXmlSource(state);
    const profileReport = state.pipeline.profileReport || runPipelineAction(state, 'detect-profile');
    const result = normalizeXmlToUxml(state.sourceText, {
      name: state.sourceFile?.name || '',
      fileName: state.sourceFile?.name || '',
      selectedSourceType: state.selectedSourceType,
      profileReport,
    });

    state.pipeline.normalizerResult = result;
    state.pipeline.uxml = result.uxml;
    state.reports.uxml = stageReport('uxml', result);
    state.status = result.ok
      ? { kind: 'ok', message: `UXML normalization complete. Components=${count(result.stats?.componentCount)}, Anchors=${count(result.stats?.anchorCount)}.` }
      : { kind: 'error', message: 'UXML normalization blocked. Review diagnostics and loss contract.' };
    return result;
  }

  if (action === 'build-geometry-preview') {
    if (!state.pipeline.uxml) runPipelineAction(state, 'convert-uxml');
    const preview = buildUxmlGeometryPreview(state.pipeline.uxml);
    state.pipeline.geometryPreview = preview;
    state.reports['geometry-preview'] = stageReport('geometry-preview', preview);
    state.status = preview.ok
      ? { kind: 'ok', message: `Geometry preview built. Segments=${count(preview.summary?.lineCount)}.` }
      : { kind: 'warn', message: 'Geometry preview needs review before topology.' };
    return preview;
  }

  if (action === 'validate-uxml') {
    if (!state.pipeline.uxml) runPipelineAction(state, 'convert-uxml');
    const report = validateUxmlDocument(state.pipeline.uxml);
    state.pipeline.validationReport = report;
    state.reports.validation = stageReport('validation', report);
    state.status = report.ready
      ? { kind: 'ok', message: 'UXML validation passed.' }
      : { kind: 'warn', message: `UXML validation needs review. Blockers=${count(report.stats?.blockerCount)}.` };
    return report;
  }

  if (action === 'build-face-model') {
    ensureValidationReady(state, 'Face model');
    const model = buildUxmlFaceModel(state.pipeline.uxml, { allowPartial: false });
    state.pipeline.faceModel = model;
    state.reports['face-model'] = stageReport('face-model', model);
    state.status = model.ok
      ? { kind: 'ok', message: `Face model built. Faces=${count(model.summary?.faceCount)}.` }
      : { kind: 'warn', message: 'Face model built with warnings or blockers.' };
    return model;
  }

  if (action === 'build-universal-topology') {
    ensureValidationReady(state, 'UniversalTopoGraph');
    if (!state.pipeline.faceModel) runPipelineAction(state, 'build-face-model');
    const graph = buildUxmlUniversalTopoGraph(state.pipeline.uxml, {
      faceModel: state.pipeline.faceModel,
      allowPartialFaceModel: false,
      allowBlockedFaceModel: false,
    });
    state.pipeline.universalGraph = graph;
    state.reports['universal-topology'] = stageReport('universal-topology', graph);
    state.status = graph.ok
      ? { kind: 'ok', message: `UniversalTopoGraph built. Edges=${count(graph.summary?.edgeCount)}.` }
      : { kind: 'warn', message: `UniversalTopoGraph built with disconnected=${count(graph.summary?.disconnectedCount)}.` };
    return graph;
  }

  if (action === 'build-ray-topology') {
    ensureValidationReady(state, 'RayTopoGraph');
    if (!state.pipeline.faceModel) runPipelineAction(state, 'build-face-model');
    if (!state.pipeline.universalGraph) runPipelineAction(state, 'build-universal-topology');
    const graph = buildUxmlRayTopoGraph(state.pipeline.uxml, {
      faceModel: state.pipeline.faceModel,
      universalGraph: state.pipeline.universalGraph,
      allowPartialFaceModel: false,
      allowBlockedFaceModel: false,
    });
    state.pipeline.rayGraph = graph;
    state.reports['ray-topology'] = stageReport('ray-topology', graph);
    state.status = graph.ok
      ? { kind: 'ok', message: `RayTopoGraph built. Candidates=${count(graph.summary?.rayCandidateCount)}.` }
      : { kind: 'warn', message: 'RayTopoGraph built with review items.' };
    return graph;
  }

  if (action === 'compare-topology') {
    ensureValidationReady(state, 'Topology comparison');
    if (!state.pipeline.universalGraph) runPipelineAction(state, 'build-universal-topology');
    if (!state.pipeline.rayGraph) runPipelineAction(state, 'build-ray-topology');
    const comparison = compareUxmlTopoGraphs(state.pipeline.uxml, {
      universalGraph: state.pipeline.universalGraph,
      rayGraph: state.pipeline.rayGraph,
      allowBlockedGraphs: true,
    });
    state.pipeline.comparison = comparison;
    state.reports.comparison = stageReport('comparison', comparison);
    state.status = comparison.ok
      ? { kind: 'ok', message: `Topology comparison complete. Promotions=${count(comparison.summary?.promotionCandidateCount)}, Manual=${count(comparison.summary?.manualReviewCount)}.` }
      : { kind: 'warn', message: 'Topology comparison needs review.' };
    return comparison;
  }

  if (action === 'run-decision-gate') {
    ensureValidationReady(state, 'Decision gate');
    if (!state.pipeline.comparison) runPipelineAction(state, 'compare-topology');
    const decision = decideUxmlTopologyAcceptance(state.pipeline.uxml, {
      comparison: state.pipeline.comparison,
      allowPartialExport: false,
      acceptUniversalOnly: false,
      allowSafeRayPromotions: true,
      allowFaceProximityPromotions: false,
      maxPromotionDistanceAlongRayMm: 500,
      maxPromotionPerpendicularMissMm: 12,
    });
    state.pipeline.topologyDecision = decision;
    state.reports['decision-gate'] = stageReport('decision-gate', decision);
    state.status = decision.outputBridgeReady
      ? {
          kind: decision.exportAllowed ? 'ok' : 'warn',
          message: `Decision gate complete. Accepted=${count(decision.summary?.acceptedConnectionCount)}, Manual=${count(decision.summary?.manualReviewCount)}, Unresolved=${count(decision.summary?.unresolvedCount)}.`,
        }
      : { kind: 'warn', message: 'Decision gate complete, but output bridge is not ready.' };
    return decision;
  }

  if (action === 'run-route-handoff') {
    ensureValidationReady(state, 'Route handoff');
    if (!state.pipeline.topologyDecision) runPipelineAction(state, 'run-decision-gate');
    const routeHandoff = createUxmlRouteHandoffPayload({
      targetRoute: UXML_ROUTE_TARGETS.DIAGNOSTICS_ONLY,
      uxml: state.pipeline.uxml,
      topologyDecision: state.pipeline.topologyDecision,
      acceptedTopologyHandoff: null,
      diagnostics: state.pipeline.uxml?.diagnostics || [],
      lossContract: state.pipeline.uxml?.lossContract || [],
      allowPartialExport: false,
    });
    state.pipeline.routeHandoff = routeHandoff;
    state.reports['route-handoff'] = stageReport('route-handoff', routeHandoff);
    state.status = {
      kind: routeHandoff.allowed ? 'ok' : 'warn',
      message: summarizeUxmlRouteHandoff(routeHandoff.policy),
    };
    return routeHandoff;
  }

  if (action === 'run-cl1-package') {
    ensureValidationReady(state, 'CL1 package');
    if (!state.pipeline.routeHandoff) runPipelineAction(state, 'run-route-handoff');
    const cl1RoutePackage = createUxmlCl1RoutePackage({
      targetRoute: UXML_ROUTE_TARGETS.EXTRACT_PCF_LEGACY,
      uxml: state.pipeline.uxml,
      topologyDecision: state.pipeline.topologyDecision,
      acceptedTopologyHandoff: state.pipeline.routeHandoff,
      diagnostics: state.pipeline.uxml?.diagnostics || [],
      lossContract: state.pipeline.uxml?.lossContract || [],
      allowPartialExport: false,
      sourceInfo: {
        sourceFile: state.sourceFile?.name || '',
        selectedSourceType: state.selectedSourceType,
        detectedSourceType: state.detectedSourceType,
        profile: state.pipeline.profileReport?.profile || '',
      },
    });
    state.pipeline.cl1RoutePackage = cl1RoutePackage;
    state.reports['cl1-package'] = stageReport('cl1-package', cl1RoutePackage);
    state.status = {
      kind: cl1RoutePackage.allowed ? 'ok' : 'warn',
      message: summarizeUxmlCl1RoutePackage(cl1RoutePackage),
    };
    return cl1RoutePackage;
  }

  if (action === 'run-cl1-snapshot') {
    if (!state.pipeline.cl1RoutePackage) runPipelineAction(state, 'run-cl1-package');
    const cl1Snapshot = buildUxmlCl1PackageSnapshot(state.pipeline.cl1RoutePackage, {
      includePayload: false,
      includeDiagnostics: true,
      includeLossContract: true,
    });
    state.pipeline.cl1Snapshot = cl1Snapshot;
    state.reports['cl1-snapshot'] = stageReport('cl1-snapshot', { ok: true, ...cl1Snapshot });
    state.status = {
      kind: 'ok',
      message: `CL1 snapshot ready: ${cl1Snapshot.snapshotId}. Debug JSON only; no PCF or masters generated.`,
    };
    return cl1Snapshot;
  }

  if (action === 'run-cl1-replay') {
    if (!state.pipeline.cl1Snapshot) runPipelineAction(state, 'run-cl1-snapshot');
    const cl1ReplayValidation = validateUxmlCl1SnapshotReplay(state.pipeline.cl1Snapshot, {
      requirePayloadForReplay: false,
    });
    state.pipeline.cl1ReplayValidation = cl1ReplayValidation;
    state.reports['cl1-replay'] = stageReport('cl1-replay', cl1ReplayValidation);
    state.status = {
      kind: cl1ReplayValidation.replayReady ? 'ok' : 'warn',
      message: summarizeUxmlCl1SnapshotReplay(cl1ReplayValidation),
    };
    return cl1ReplayValidation;
  }

  if (action === 'run-cl1-summary') {
    if (!state.pipeline.cl1ReplayValidation) runPipelineAction(state, 'run-cl1-replay');
    const cl1WorkbenchSummary = buildUxmlCl1WorkbenchSummary({
      topologyDecision: state.pipeline.topologyDecision,
      routeHandoff: state.pipeline.routeHandoff,
      cl1RoutePackage: state.pipeline.cl1RoutePackage,
      cl1Snapshot: state.pipeline.cl1Snapshot,
      cl1ReplayValidation: state.pipeline.cl1ReplayValidation,
    });
    state.pipeline.cl1WorkbenchSummary = cl1WorkbenchSummary;
    state.reports['cl1-summary'] = stageReport('cl1-summary', { ok: cl1WorkbenchSummary.readyForRouteConsumption, ...cl1WorkbenchSummary });
    state.status = {
      kind: cl1WorkbenchSummary.overallStatus === 'PASS' ? 'ok' : cl1WorkbenchSummary.overallStatus === 'WARN' ? 'warn' : 'error',
      message: summarizeUxmlCl1WorkbenchSummary(cl1WorkbenchSummary),
    };
    return cl1WorkbenchSummary;
  }

  if (action === 'run-full-pipeline') {
    for (const step of FULL_PIPELINE_ACTIONS) runPipelineAction(state, step);
    return state.pipeline.cl1WorkbenchSummary || state.pipeline.routeHandoff;
  }

  throw new Error(`Unknown UXML action: ${action}`);
}

function canRunXmlActions(state) {
  const selected = effectiveSourceType(state);
  return ['AUTO', 'UXML', 'INPUT_XML', 'STANDARD_XML', 'EXISTING_XML', 'PCF', 'PDF', 'STAGED_JSON'].includes(selected);
}

export async function runPipelineActionAsync(state, action) {
  if (!state || typeof state !== 'object') {
    throw new Error('runPipelineActionAsync requires a state object.');
  }

  if (action === 'run-existing-converter') {
    const route = sourceIntakeRouteSummary(state);

    if (!route.ok) {
      throw new Error(route.reason || 'No UXML source intake route is available.');
    }

    if (route.strategy !== 'EXISTING_CONVERTER_BRIDGE') {
      throw new Error(`Run existing converter applies only to converter-backed routes. Current strategy: ${route.strategy}.`);
    }

    return runPipelineActionAsync(state, 'run-source-intake-bridge');
  }

  if (action === 'run-source-intake-bridge') {
    if (!String(state.sourceText || '').trim()) {
      throw new Error('Load a source file before running Source Intake Bridge.');
    }

    const selected = effectiveSourceType(state);
    const route = sourceIntakeRouteSummary(state);

    if (!route.ok) {
      const blocked = {
        schema: 'uxml-source-intake-bridge/ui-blocked',
        ok: false,
        blocked: true,
        route,
        summary: {
          sourceType: selected,
          reason: route.reason || 'No intake route.',
        },
      };

      state.pipeline.sourceIntakeBridge = blocked;
      state.reports['existing-converter'] = stageReport('existing-converter', blocked);
      state.status = {
        kind: 'error',
        message: route.reason || 'No UXML source intake route is available.',
      };

      return blocked;
    }

    if (isDirectXmlSourceType(selected)) {
      const direct = {
        schema: 'uxml-source-intake-bridge/direct-ui-route',
        ok: true,
        blocked: false,
        route,
        bridgeOutputProfile: route.directProfile || selected,
        bridgeOutputText: state.sourceText,
        normalized: null,
        summary: {
          sourceType: selected,
          strategy: 'DIRECT_XML_NORMALIZATION',
        },
        generatedPcf: false,
        pcfTextByPipelineRef: undefined,
        masterResolution: undefined,
        masterResolutionRequests: undefined,
      };

      state.pipeline.sourceIntakeBridge = direct;
      state.bridgeOutputText = state.sourceText;
      state.bridgeOutputProfile = direct.bridgeOutputProfile;
      state.reports['existing-converter'] = stageReport('existing-converter', direct);
      state.status = {
        kind: 'ok',
        message: `${selected} uses direct UXML normalization; no converter bridge required.`,
      };

      return direct;
    }

    const intake = await runUxmlSourceIntakeBridge({
      text: state.sourceText,
      fileName: state.sourceFile?.name || '',
      selectedSourceType: selected,
      sourceFile: state.sourceFileObject || state.sourceBlob || null,
      sourceBlob: state.sourceBlob || null,
      sourceArrayBuffer: state.sourceArrayBuffer || null,
      converterExecutor: state.converterExecutor || defaultUniversalXmlConverterExecutor || null,
      converterOptions: {
        defaultPipelineRef: '/PCF-IMPORT',
      },
    });

    state.pipeline.sourceIntakeBridge = intake;
    state.bridgeOutputText = intake.bridgeOutputText || '';
    state.bridgeOutputProfile = intake.bridgeOutputProfile || '';
    state.reports['existing-converter'] = stageReport('existing-converter', intake);

    if (intake.normalized?.uxml) {
      state.pipeline.normalizerResult = intake.normalized;
      state.pipeline.uxml = intake.normalized.uxml;
      state.reports.uxml = stageReport('uxml', intake.normalized);
    }

    state.status = intake.ok
      ? {
          kind: 'ok',
          message: `${selected} intake bridge complete. Output=${intake.bridgeOutputProfile}; Components=${count(intake.normalized?.stats?.componentCount)}.`,
        }
      : {
          kind: 'error',
          message: intake.diagnostics?.[0]?.message || `${selected} intake bridge blocked.`,
        };

    return intake;
  }

  if (action === 'convert-uxml') {
    const selected = effectiveSourceType(state);

    if (isBridgeSourceType(selected)) {
      if (!state.pipeline.sourceIntakeBridge) {
        await runPipelineActionAsync(state, 'run-source-intake-bridge');
      }

      const intake = state.pipeline.sourceIntakeBridge;

      if (!intake?.normalized?.uxml) {
        throw new Error(`${selected} intake bridge did not produce UXML normalization output.`);
      }

      state.pipeline.normalizerResult = intake.normalized;
      state.pipeline.uxml = intake.normalized.uxml;
      state.reports.uxml = stageReport('uxml', intake.normalized);
      state.status = intake.normalized.ok
        ? {
            kind: 'ok',
            message: `UXML normalization complete from ${selected} bridge. Components=${count(intake.normalized.stats?.componentCount)}, Anchors=${count(intake.normalized.stats?.anchorCount)}.`,
          }
        : {
            kind: 'error',
            message: 'UXML normalization from bridge output blocked.',
          };

      return intake.normalized;
    }

    return runPipelineAction(state, action);
  }

  if (action === 'run-full-pipeline') {
    const selected = effectiveSourceType(state);

    if (isBridgeSourceType(selected)) {
      await runPipelineActionAsync(state, 'run-source-intake-bridge');
      await runPipelineActionAsync(state, 'convert-uxml');

      for (const step of FULL_PIPELINE_ACTIONS.filter(step => step !== 'detect-profile' && step !== 'convert-uxml')) {
        runPipelineAction(state, step);
      }

      return state.pipeline.cl1WorkbenchSummary || state.pipeline.routeHandoff;
    }

    return runPipelineAction(state, action);
  }

  return runPipelineAction(state, action);
}

// ── Stage rail (compact timeline) ─────────────────────────────────────────

function computeProgress(state) {
  const active = PIPELINE_STAGES.filter(s => !s.deferred);
  const done = active.filter(s => state.reports?.[s.id] && reportPass(state.reports[s.id]));
  const next = active.find(s => !state.reports?.[s.id]);
  return { total: active.length, done: done.length, next };
}

function renderPanelHeader(state) {
  const { total, done, next } = computeProgress(state);
  const pct = total ? Math.round(done / total * 100) : 0;
  const nextAction = next ? STAGE_TO_ACTION[next.id] : null;
  const nextLabel = next ? (STAGE_SHORT_TITLES[next.id] || next.title) : 'All done';
  const nextBtnHtml = nextAction
    ? `<button class="uxml-panel-next-btn" data-uxml-action="${esc(nextAction)}" type="button">▶ Next: ${esc(nextLabel)}</button>`
    : `<span class="uxml-panel-all-done">✓ All stages complete</span>`;
  return `<div class="uxml-panel-header"><span class="uxml-panel-progress-text">${done} of ${total} complete</span><div class="uxml-panel-progress-bar"><div style="width:${pct}%"></div></div>${nextBtnHtml}</div>`;
}

function collapsibleSection(label, content, defaultOpen) {
  return `<details class="uxml-collapsible"${defaultOpen ? ' open' : ''}><summary class="uxml-collapsible-summary">${esc(label)}</summary><div class="uxml-collapsible-body">${content}</div></details>`;
}

function renderStageItem(stage, stageIndex, state, nextId) {
  const report = state.reports?.[stage.id] || null;
  const isActive = state.activePanel === stage.id;
  const pass = reportPass(report);
  const deferred = stage.deferred === true;
  const isNext = stage.id === nextId;
  let badgeClass, pillText;
  if (deferred)     { badgeClass = 'deferred'; pillText = ''; }
  else if (isNext)  { badgeClass = 'next';     pillText = 'Next'; }
  else if (!report) { badgeClass = 'idle';     pillText = ''; }
  else if (pass)    { badgeClass = 'ok';       pillText = 'Ready'; }
  else              { badgeClass = 'warn';     pillText = 'Review'; }
  const shortTitle = esc(STAGE_SHORT_TITLES[stage.id] || stage.title);
  const pillHtml = pillText ? `<span class="uxml-stage-pill ${badgeClass}">${pillText}</span>` : '';
  return `<button class="uxml-stage-item${isActive ? ' is-active' : ''}" data-uxml-panel="${esc(stage.id)}" type="button"><span class="uxml-stage-num ${badgeClass}">${stageIndex + 1}</span><span class="uxml-stage-name">${shortTitle}</span>${pillHtml}</button>`;
}

function renderStages(state) {
  const active = PIPELINE_STAGES.filter(s => !s.deferred);
  const nextStage = active.find(s => !state.reports?.[s.id]);
  const nextId = nextStage?.id;
  return STAGE_GROUPS.map(group => {
    const items = group.stages.map(id => {
      const stage = PIPELINE_STAGES.find(s => s.id === id);
      const idx = PIPELINE_STAGES.findIndex(s => s.id === id);
      return stage ? renderStageItem(stage, idx, state, nextId) : '';
    }).join('');
    return `<div class="uxml-stage-group"><div class="uxml-stage-group-label">${esc(group.label)}</div>${items}</div>`;
  }).join('');
}

// kept for backward-compat if anything calls it externally
function renderStageCard(stage, state) {
  const idx = PIPELINE_STAGES.findIndex(s => s.id === stage.id);
  return renderStageItem(stage, idx, state, undefined);
}

function sourceSummaryHtml(state) {
  const file = state.sourceFile;
  if (!file) return '<div class="uxml-empty">No source loaded.</div>';
  return `<div class="uxml-kv-grid"><div>File</div><div>${esc(file.name)}</div><div>Size</div><div>${esc(`${count(file.size)} B`)}</div><div>Selected source type</div><div>${esc(state.selectedSourceType)}</div><div>Detected source type</div><div>${esc(state.detectedSourceType)}</div><div>Characters loaded</div><div>${esc(state.sourceText.length)}</div></div>`;
}

function reportSummaryHtml(report, title) {
  if (!report) return '<div class="uxml-empty">Not run yet.</div>';
  const summary = summarizeReport(report);

  // Tier 1 — compact summary card (always visible)
  const stats = report.stats || report.summary || {};
  const chips = [
    stats.componentCount != null ? `${count(stats.componentCount)} comps` : '',
    stats.anchorCount    != null ? `${count(stats.anchorCount)} anchors` : '',
    stats.segmentCount   != null ? `${count(stats.segmentCount)} segs` : '',
    stats.edgeCount      != null ? `${count(stats.edgeCount)} edges` : '',
    stats.faceCount      != null ? `${count(stats.faceCount)} faces` : '',
    stats.lineCount      != null ? `${count(stats.lineCount)} lines` : '',
  ].filter(Boolean).join(' · ');
  const sc = summary.pass ? 'ok' : 'warn';
  const icon = summary.pass ? '✓' : '⚠';
  const summaryCard = `<div class="uxml-summary-card"><span class="uxml-summary-status ${sc}">${icon} ${esc(summary.label)}</span>${chips ? `<span class="uxml-summary-chips">${esc(chips)}</span>` : ''}<span class="uxml-summary-meta">${esc(report.schema || '')}</span></div>`;

  // Tier 2 — collapsible full details
  const rows = summary.rows.map(([key, value]) => `<div>${esc(key)}</div><div>${esc(String(value ?? ''))}</div>`).join('');
  const detailsHtml = rows ? `<div class="uxml-kv-grid uxml-kv-compact">${rows}</div>` : '<div class="uxml-empty">No fields.</div>';

  return summaryCard + collapsibleSection('Full report details', detailsHtml, false);
}

function geometryColorFor(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('BEND') || t.includes('ELBOW')) return '#c084fc';
  if (t.includes('VALVE')) return '#22c55e';
  if (t.includes('FLANGE')) return '#f59e0b';
  if (t.includes('TEE') || t.includes('OLET')) return '#fb7185';
  return '#38bdf8';
}

function isBranchFittingType(type) {
  const t = String(type || '').toUpperCase();
  return t.includes('TEE') || t.includes('OLET');
}

function componentTypeCountsText(countsByType) {
  const entries = Object.entries(countsByType || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  if (!entries.length) return '';

  return entries
    .map(([type, value]) => `${type}:${count(value)}`)
    .join(', ');
}

function projectPreviewPoint(point, projection, zScale) {
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z) * zScale;

  if (projection === 'XY') return { a: x, b: y };
  if (projection === 'XZ') return { a: x, b: z };
  if (projection === 'YZ') return { a: y, b: z };

  return {
    a: (x - y) * 0.8660254,
    b: (x + y) * 0.5 - z,
  };
}

function renderGeometrySvg(lines, projection, label, width, height, zScale) {
  const projected = [];

  for (const line of lines) {
    projected.push({
      line,
      start: projectPreviewPoint(line.start, projection, zScale),
      end: projectPreviewPoint(line.end, projection, zScale),
    });
  }

  const all = projected.flatMap(item => [item.start, item.end]);
  const minA = all.length ? Math.min(...all.map(point => point.a)) : 0;
  const maxA = all.length ? Math.max(...all.map(point => point.a)) : 1;
  const minB = all.length ? Math.min(...all.map(point => point.b)) : 0;
  const maxB = all.length ? Math.max(...all.map(point => point.b)) : 1;
  const padSize = 24;
  const spanA = Math.max(1, maxA - minA);
  const spanB = Math.max(1, maxB - minB);
  const sx = point => padSize + ((point.a - minA) / spanA) * (width - padSize * 2);
  const sy = point => height - padSize - ((point.b - minB) / spanB) * (height - padSize * 2);
  const paths = projected.map(item => {
    const title = esc(`${item.line.type} ${item.line.componentId}`);
    const color = geometryColorFor(item.line.type);
    const lineSvg = `<line x1="${sx(item.start).toFixed(2)}" y1="${sy(item.start).toFixed(2)}" x2="${sx(item.end).toFixed(2)}" y2="${sy(item.end).toFixed(2)}" stroke="${color}" stroke-width="2" stroke-linecap="round"><title>${title}</title></line>`;
    if (!isBranchFittingType(item.line.type)) return lineSvg;

    const cx = ((sx(item.start) + sx(item.end)) / 2).toFixed(2);
    const cy = ((sy(item.start) + sy(item.end)) / 2).toFixed(2);
    return `${lineSvg}<circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="#f8fafc" stroke-width="1.5"><title>${title}</title></circle>`;
  }).join('');

  return `<div class="uxml-geometry-card"><div class="uxml-preview-title">${esc(label)}</div><svg class="uxml-geometry-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${paths || `<text x="24" y="48" fill="#94a3b8">No drawable segments.</text>`}</svg></div>`;
}

function renderGeometryOrientationControls(mainSvg) {
  return `<div class="uxml-geometry-orient-shell"><div class="uxml-geometry-orient-controls" aria-label="Preview orientation controls"><input id="uxml-geometry-orient-original" name="uxml-geometry-orientation" type="radio" checked><label for="uxml-geometry-orient-original">Original</label><input id="uxml-geometry-orient-rotate180" name="uxml-geometry-orientation" type="radio"><label for="uxml-geometry-orient-rotate180">Rotate 180</label><input id="uxml-geometry-orient-flipx" name="uxml-geometry-orientation" type="radio"><label for="uxml-geometry-orient-flipx">Flip X</label><input id="uxml-geometry-orient-flipy" name="uxml-geometry-orientation" type="radio"><label for="uxml-geometry-orient-flipy">Flip Y</label></div><div class="uxml-geometry-orient-frame">${mainSvg}</div></div>`;
}

function renderGeometryPreviewHtml(preview) {
  if (!preview) return '<div class="uxml-placeholder">Run geometry preview after UXML normalization.</div>';

  const bounds = preview.bounds;
  const lines = Array.isArray(preview.lines) ? preview.lines.slice(0, 700) : [];
  const spanX = bounds ? Math.abs(bounds.maxX - bounds.minX) : 1;
  const spanY = bounds ? Math.abs(bounds.maxY - bounds.minY) : 1;
  const spanZ = bounds ? Math.abs(bounds.maxZ - bounds.minZ) : 1;
  const zScale = Math.max(1, Math.min(8, Math.max(spanX, spanY) / Math.max(spanZ, 1) / 6));
  const mainSvg = renderGeometrySvg(lines, 'ISO', `Isometric preview (Z x ${zScale.toFixed(1)})`, 720, 420, zScale);
  const orientableMainSvg = renderGeometryOrientationControls(mainSvg);
  const xySvg = renderGeometrySvg(lines, 'XY', 'Top XY', 360, 220, 1);
  const xzSvg = renderGeometrySvg(lines, 'XZ', 'Side XZ', 360, 220, 1);
  const yzSvg = renderGeometrySvg(lines, 'YZ', 'End YZ', 360, 220, 1);
  const fallbackWarning = preview.summary?.fallbackCoordinateReconstruction
    ? '<div class="uxml-placeholder uxml-geometry-warning">InputXML has disconnected delta-only coordinate islands and no UXML_GEOM absolute source coordinates. This is a fallback sketch, not a reality preview. Regenerate InputXML from staged JSON with the current converter to embed APOS/LPOS geometry.</div>'
    : '';

  return `<div class="uxml-preview-block"><div class="uxml-preview-title">Geometry Preview</div><div class="uxml-kv-grid uxml-kv-compact"><div>Components</div><div>${count(preview.summary?.componentCount)}</div><div>Segments drawn</div><div>${count(preview.summary?.lineCount)}</div><div>Unique coordinates</div><div>${count(preview.summary?.uniqueAnchorCoordinateCount)}</div><div>Component types</div><div>${esc(componentTypeCountsText(preview.summary?.componentTypeCounts))}</div><div>Geometry source</div><div>${esc(preview.summary?.geometrySource || '')}</div><div>Absolute geometry comments</div><div>${count(preview.summary?.absoluteGeometryCommentCount)}</div><div>Seeded coordinate islands</div><div>${count(preview.summary?.seededComponentCount)}</div><div>Zero/missing bore components</div><div>${count(preview.summary?.zeroBoreComponentCount)}</div></div>${fallbackWarning}${orientableMainSvg}<div class="uxml-geometry-projections">${xySvg}${xzSvg}${yzSvg}</div>${preview.summary?.allFiniteAnchorsCollapsed ? '<div class="uxml-placeholder">All finite anchors collapsed to one coordinate. This is blocked from topology.</div>' : ''}</div>`;
}

function renderRouteAndCl1Guide() {
  return `<div class="uxml-placeholder"><b>Route Handoff</b><br>Topology decisions are routed through the handoff policy before any downstream package is created.</div><div class="uxml-placeholder"><b>CL1 Route Package</b><br>This route package is deterministic metadata only. It does not emit PCF, does not resolve masters, and does not mutate topology.</div><div class="uxml-placeholder"><b>Masters by Target Route</b><br>Masters are handled by the downstream route. This tab only prepares topology and CL1 route evidence.</div><div class="uxml-placeholder"><b>Route contract</b><br>UXML mutates coordinates: NO<br>UXML applies fixes: NO<br>UXML emits PCF directly: NO</div>`;
}

function panelHtml(state) {
  const panel = state.activePanel;
  const pipeline = state.pipeline;

  if (panel === 'source') {
    const sourcePreviewHtml = `<pre>${esc((state.sourceText || '').slice(0, 12000))}</pre>`;
    const route = sourceIntakeRouteSummary(state);

    const routeHtml = route.ok
      ? `<div class="uxml-kv-grid uxml-kv-compact">
          <div>Source type</div><div>${esc(route.sourceType)}</div>
          <div>Strategy</div><div>${esc(route.strategy || route.directProfile || '')}</div>
          <div>Bridge converter</div><div>${esc(route.bridgeConverterId || 'DIRECT')}</div>
          <div>Bridge output profile</div><div>${esc(route.bridgeOutputProfile || route.directProfile || '')}</div>
        </div>`
      : `<div class="uxml-placeholder">No route: ${esc(route.reason || '')}</div>`;

    return `<section class="uxml-panel-section">
      <h3>Source Intake</h3>
      <p>
        Load PCF, PDF, staged JSON, InputXML, Standard XML, or UXML.
        PCF is bridged to Standard XML. PDF and staged JSON are routed through existing converters before UXML normalization.
      </p>
      ${sourceSummaryHtml(state)}
      <h4>Resolved intake route</h4>
      ${routeHtml}
      ${reportSummaryHtml(pipeline.profileReport, 'Profile Detection')}
      ${collapsibleSection('Source preview (first 12 000 chars)', sourcePreviewHtml, false)}
      ${collapsibleSection('Route guide', renderRouteAndCl1Guide(), false)}
    </section>`;
  }

  if (panel === 'existing-converter') {
    const intake = pipeline.sourceIntakeBridge;
    const bridgePreview = state.bridgeOutputText
      ? `<pre>${esc(state.bridgeOutputText.slice(0, 16000))}</pre>`
      : '<div class="uxml-empty">No bridge output yet.</div>';

    return `<section class="uxml-panel-section">
      <h3>Source Intake Bridge</h3>
      <p>
        PCF, PDF, and staged JSON are converted into XML profiles before UXML normalization.
        PCF uses an internal Standard XML bridge. PDF and staged JSON use existing converter routes.
      </p>

      ${reportSummaryHtml(intake, 'Source Intake Bridge')}

      ${intake ? `
        <div class="uxml-kv-grid uxml-kv-compact">
          <div>Source type</div><div>${esc(intake.route?.sourceType || '')}</div>
          <div>Strategy</div><div>${esc(intake.route?.strategy || '')}</div>
          <div>Converter</div><div>${esc(intake.route?.bridgeConverterId || 'DIRECT')}</div>
          <div>Output profile</div><div>${esc(intake.bridgeOutputProfile || '')}</div>
          <div>Normalized components</div><div>${count(intake.normalized?.stats?.componentCount)}</div>
          <div>Normalized anchors</div><div>${count(intake.normalized?.stats?.anchorCount)}</div>
          <div>Normalized ports</div><div>${count(intake.normalized?.stats?.portCount)}</div>
          <div>Normalized segments</div><div>${count(intake.normalized?.stats?.segmentCount)}</div>
        </div>

        <div class="uxml-placeholder" style="margin-top:12px;">
          <b>Boundary:</b><br>
          PCF generated here: ${intake.generatedPcf ? 'YES' : 'NO'}<br>
          PCF text emitted here: ${intake.pcfTextByPipelineRef ? 'YES' : 'NO'}<br>
          Masters resolved here: ${intake.masterResolution ? 'YES' : 'NO'}<br>
          Topology built here: NO
        </div>
      ` : `
        <div class="uxml-placeholder">
          Select PCF, PDF, or staged JSON, then run Source Intake Bridge. Direct XML/InputXML/UXML does not need bridge conversion.
        </div>
      `}

      ${collapsibleSection('Bridge XML output preview', bridgePreview, false)}
    </section>`;
  }

  if (panel === 'uxml') {
    const uxmlJsonHtml = `<pre>${esc(JSON.stringify(pipeline.uxml || null, null, 2).slice(0, 24000))}</pre>`;
    return `<section class="uxml-panel-section"><h3>UXML Normalization</h3>${reportSummaryHtml(pipeline.normalizerResult, 'UXML Result')}${collapsibleSection('Normalized UXML JSON (first 24 000 chars)', uxmlJsonHtml, false)}</section>`;
  }

  if (panel === 'geometry-preview') return `<section class="uxml-panel-section"><h3>Geometry Preview</h3>${reportSummaryHtml(pipeline.geometryPreview, 'Geometry Preview')}${renderGeometryPreviewHtml(pipeline.geometryPreview)}</section>`;

  if (panel === 'validation') return `<section class="uxml-panel-section"><h3>UXML Validation</h3>${reportSummaryHtml(pipeline.validationReport, 'Validation')}</section>`;
  if (panel === 'face-model') return `<section class="uxml-panel-section"><h3>Face Model</h3>${reportSummaryHtml(pipeline.faceModel, 'Face Model')}</section>`;
  if (panel === 'universal-topology') return `<section class="uxml-panel-section"><h3>UniversalTopoGraph</h3>${reportSummaryHtml(pipeline.universalGraph, 'UniversalTopoGraph')}</section>`;
  if (panel === 'ray-topology') return `<section class="uxml-panel-section"><h3>RayTopoGraph</h3>${reportSummaryHtml(pipeline.rayGraph, 'RayTopoGraph')}</section>`;
  if (panel === 'comparison') return `<section class="uxml-panel-section"><h3>Topology Comparison</h3>${reportSummaryHtml(pipeline.comparison, 'Comparison')}</section>`;
  if (panel === 'decision-gate') return `<section class="uxml-panel-section"><h3>Decision Gate</h3>${reportSummaryHtml(pipeline.topologyDecision, 'Decision Gate')}</section>`;

  if (panel === 'route-handoff') {
    return `<section class="uxml-panel-section"><h3>Route Handoff</h3><p>This stage only prepares route-handoff decisions.</p>${pipeline.routeHandoff ? `<div class="uxml-placeholder"><b>Route handoff</b><br>${esc(summarizeUxmlRouteHandoff(pipeline.routeHandoff.policy))}</div>` : '<div class="uxml-placeholder">Run decision gate, then route handoff.</div>'}<div class="uxml-placeholder" style="margin-top:12px;"><b>Route contract</b><br>UXML mutates coordinates: NO<br>UXML applies fixes: NO<br>UXML emits PCF directly: NO<br>Masters resolved here: NO</div></section>`;
  }

  if (panel === 'cl1-package') {
    return `<section class="uxml-panel-section"><h3>Route Package</h3><p>This route package is deterministic metadata only. It does not emit PCF, does not resolve masters, and does not mutate topology.</p>${pipeline.cl1RoutePackage ? `<div class="uxml-kv-grid"><div><b>Schema</b></div><div>${esc(pipeline.cl1RoutePackage.schema)}</div><div><b>Package ID</b></div><div>${esc(pipeline.cl1RoutePackage.packageId)}</div><div><b>Target route</b></div><div>${esc(pipeline.cl1RoutePackage.targetRoute)}</div><div><b>Allowed</b></div><div>${pipeline.cl1RoutePackage.allowed ? 'YES' : 'NO'}</div><div><b>Components</b></div><div>${count(pipeline.cl1RoutePackage.entityCounts?.componentCount)}</div><div><b>Accepted topology</b></div><div>${count(pipeline.cl1RoutePackage.topologyCounts?.acceptedConnectionCount)}</div></div><div class="uxml-placeholder" style="margin-top:12px;"><b>Route contract</b><br>Does not emit PCF: ${pipeline.cl1RoutePackage.routeContract?.uxmlEmitsPcfDirectly ? 'YES' : 'NO'}<br>Does not resolve masters: YES<br>Does not mutate coordinates: ${pipeline.cl1RoutePackage.routeContract?.uxmlMutatesCoordinates ? 'NO' : 'YES'}</div>` : '<div class="uxml-placeholder">Run route handoff, then build CL1 package.</div>'}</section>`;
  }

  if (panel === 'cl1-snapshot') {
    return `<section class="uxml-panel-section"><h3>Snapshot JSON</h3><p>Creates a deterministic debug/replay JSON snapshot from the CL1 route package. This is not PCF export and does not resolve masters.</p>${pipeline.cl1Snapshot ? `<div class="uxml-kv-grid"><div><b>Schema</b></div><div>${esc(pipeline.cl1Snapshot.schema)}</div><div><b>Snapshot ID</b></div><div>${esc(pipeline.cl1Snapshot.snapshotId)}</div><div><b>Package ID</b></div><div>${esc(pipeline.cl1Snapshot.packageId)}</div><div><b>Target route</b></div><div>${esc(pipeline.cl1Snapshot.targetRoute)}</div><div><b>Debug only</b></div><div>${pipeline.cl1Snapshot.debugOnly ? 'YES' : 'NO'}</div><div><b>Payload included</b></div><div>${pipeline.cl1Snapshot.payloadIncluded ? 'YES' : 'NO'}</div><div><b>Components</b></div><div>${count(pipeline.cl1Snapshot.entityCounts?.componentCount)}</div><div><b>Accepted topology</b></div><div>${count(pipeline.cl1Snapshot.topologyCounts?.acceptedConnectionCount)}</div></div><div class="uxml-placeholder" style="margin-top:12px;"><b>Snapshot contract</b><br>PCF generated: ${pipeline.cl1Snapshot.pcfGenerated ? 'YES' : 'NO'}<br>Masters resolved: ${pipeline.cl1Snapshot.mastersResolved ? 'YES' : 'NO'}<br>Coordinates mutated: ${pipeline.cl1Snapshot.coordinatesMutated ? 'YES' : 'NO'}<br>Fixes applied: ${pipeline.cl1Snapshot.fixesApplied ? 'YES' : 'NO'}</div>${collapsibleSection('Snapshot JSON preview', `<pre>${esc(serializeUxmlCl1PackageSnapshot(pipeline.cl1Snapshot))}</pre>`, false)}` : '<div class="uxml-placeholder">Run route handoff, then build CL1 snapshot.</div>'}</section>`;
  }

  if (panel === 'cl1-replay') {
    return `<section class="uxml-panel-section"><h3>Replay Validator</h3><p>Validates a CL1 snapshot for debug/replay readiness. This does not parse XML, rebuild topology, emit PCF, resolve masters, mutate coordinates, or apply fixes.</p>${pipeline.cl1ReplayValidation ? `<div class="uxml-kv-grid"><div><b>Schema</b></div><div>${esc(pipeline.cl1ReplayValidation.schema)}</div><div><b>Replay ready</b></div><div>${pipeline.cl1ReplayValidation.replayReady ? 'YES' : 'NO'}</div><div><b>Blocking issues</b></div><div>${count(pipeline.cl1ReplayValidation.summary?.blockingIssueCount)}</div><div><b>Warnings</b></div><div>${count(pipeline.cl1ReplayValidation.summary?.warningCount)}</div><div><b>Components</b></div><div>${count(pipeline.cl1ReplayValidation.countSummary?.componentCount)}</div><div><b>Accepted topology</b></div><div>${count(pipeline.cl1ReplayValidation.countSummary?.acceptedConnectionCount)}</div><div><b>Manual / rejected / unresolved</b></div><div>${count(pipeline.cl1ReplayValidation.countSummary?.manualReviewCount)} / ${count(pipeline.cl1ReplayValidation.countSummary?.rejectedCount)} / ${count(pipeline.cl1ReplayValidation.countSummary?.unresolvedCount)}</div></div><div class="uxml-placeholder" style="margin-top:12px;"><b>Replay safety flags</b><br>Debug only: ${pipeline.cl1ReplayValidation.debugOnly ? 'YES' : 'NO'}<br>PCF generated: ${pipeline.cl1ReplayValidation.pcfGenerated ? 'YES' : 'NO'}<br>Masters resolved: ${pipeline.cl1ReplayValidation.mastersResolved ? 'YES' : 'NO'}<br>Coordinates mutated: ${pipeline.cl1ReplayValidation.coordinatesMutated ? 'YES' : 'NO'}<br>Fixes applied: ${pipeline.cl1ReplayValidation.fixesApplied ? 'YES' : 'NO'}</div>${pipeline.cl1ReplayValidation.issues?.length ? `<div class="uxml-placeholder" style="margin-top:12px;"><b>Issues</b><ul>${pipeline.cl1ReplayValidation.issues.map((issue) => `<li><code>${esc(issue.code)}</code> - ${esc(issue.message)}</li>`).join('')}</ul></div>` : ''}` : '<div class="uxml-placeholder">Build CL1 snapshot, then validate replay readiness.</div>'}</section>`;
  }

  if (panel === 'cl1-summary') {
    return `<section class="uxml-panel-section"><h3>QA Summary</h3><p>One-screen status for Decision Gate, Route Handoff, Route Package, Snapshot, and Replay Validation. This is read-only QA status.</p>${pipeline.cl1WorkbenchSummary ? `<div class="uxml-kv-grid"><div><b>Overall status</b></div><div>${esc(pipeline.cl1WorkbenchSummary.overallStatus)}</div><div><b>Ready for route consumption</b></div><div>${pipeline.cl1WorkbenchSummary.readyForRouteConsumption ? 'YES' : 'NO'}</div><div><b>Blocked / warning / not-run</b></div><div>${count(pipeline.cl1WorkbenchSummary.blockedCount)} / ${count(pipeline.cl1WorkbenchSummary.warningCount)} / ${count(pipeline.cl1WorkbenchSummary.notRunCount)}</div><div><b>Components</b></div><div>${count(pipeline.cl1WorkbenchSummary.counts?.componentCount)}</div><div><b>Accepted topology</b></div><div>${count(pipeline.cl1WorkbenchSummary.counts?.acceptedConnectionCount)}</div></div><div class="uxml-placeholder" style="margin-top:12px;"><b>Safety summary</b><br>PCF generated: ${pipeline.cl1WorkbenchSummary.safety?.pcfGenerated ? 'YES' : 'NO'}<br>Masters resolved: ${pipeline.cl1WorkbenchSummary.safety?.mastersResolved ? 'YES' : 'NO'}<br>Coordinates mutated: ${pipeline.cl1WorkbenchSummary.safety?.coordinatesMutated ? 'YES' : 'NO'}<br>Fixes applied: ${pipeline.cl1WorkbenchSummary.safety?.fixesApplied ? 'YES' : 'NO'}</div>` : '<div class="uxml-placeholder">Run CL1 replay validator, then build CL1 QA summary.</div>'}</section>`;
  }

  if (panel === 'masters') {
    return `<section class="uxml-panel-section"><h3>Masters by Target Route</h3><div class="uxml-placeholder">Masters are owned by the downstream route. This tab only prepares topology and CL1 route evidence.</div></section>`;
  }

  if (panel === 'outputs') {
    return `<section class="uxml-panel-section"><h3>Route Targets</h3><div class="uxml-placeholder">Target routes include Extract PCF, GLB, 2D, InputXML, and CII.</div></section>`;
  }

  return `<section class="uxml-panel-section"><h3>Unknown panel</h3><div class="uxml-placeholder">${esc(panel)}</div></section>`;
}

function renderToolbar(state, xmlReady, canConvert) {
  const p = state.pipeline;
  const d = (cond) => cond ? '' : ' disabled';
  const sourceTypeOptions = SOURCE_TYPES.map(o =>
    `<option value="${esc(o.value)}"${state.selectedSourceType === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');

  const sep = '<div class="uxml-tb-sep"></div>';

  const grpSource = `<div class="uxml-tb-group">
    <div class="uxml-tb-group-label">Source</div>
    <div class="uxml-tb-group-row">
      <select class="uxml-tb-select" data-uxml-source-type>${sourceTypeOptions}</select>
      <label class="uxml-file-btn">Load<input data-uxml-file-input type="file" /></label>
      <button data-uxml-action="run-source-intake-bridge" type="button" class="uxml-tb-btn-ghost"${d(xmlReady)}>Source Intake Bridge</button>
      <button data-uxml-action="run-existing-converter" type="button" class="uxml-tb-btn-ghost"${d(xmlReady)}>Run existing converter</button>
    </div>
  </div>`;

  const grpNorm = `<div class="uxml-tb-group">
    <div class="uxml-tb-group-label">Normalize</div>
    <div class="uxml-tb-group-row">
      <button data-uxml-action="detect-profile" type="button">Detect Profile</button>
      <button data-uxml-action="convert-uxml" type="button"${d(canConvert)}>Convert→UXML</button>
      <button data-uxml-action="build-geometry-preview" type="button"${d(p.uxml)}>Preview Geom</button>
    </div>
  </div>`;

  const grpValidate = `<div class="uxml-tb-group">
    <div class="uxml-tb-group-label">Validate</div>
    <div class="uxml-tb-group-row">
      <button data-uxml-action="validate-uxml" type="button"${d(p.uxml)}>Validate</button>
      <button data-uxml-action="build-face-model" type="button"${d(p.uxml)}>Face Model</button>
    </div>
  </div>`;

  const grpTopo = `<div class="uxml-tb-group">
    <div class="uxml-tb-group-label">Topology</div>
    <div class="uxml-tb-group-row">
      <button data-uxml-action="build-universal-topology" type="button"${d(p.faceModel)}>Universal</button>
      <button data-uxml-action="build-ray-topology" type="button"${d(p.faceModel)}>Ray</button>
      <button data-uxml-action="compare-topology" type="button"${d(p.universalGraph && p.rayGraph)}>Compare</button>
      <button data-uxml-action="run-decision-gate" type="button"${d(p.comparison)}>Decision</button>
    </div>
  </div>`;

  const grpCl1 = `<div class="uxml-tb-group">
    <div class="uxml-tb-group-label">Pipeline</div>
    <div class="uxml-tb-group-row">
      <button data-uxml-action="run-route-handoff" type="button"${d(p.topologyDecision)}>Handoff</button>
      <button data-uxml-action="run-cl1-package" type="button"${d(p.routeHandoff)}>Pkg</button>
      <button data-uxml-action="run-cl1-snapshot" type="button"${d(p.cl1RoutePackage)}>Snapshot</button>
      <button data-uxml-action="run-cl1-replay" type="button"${d(p.cl1Snapshot)}>Replay</button>
      <button data-uxml-action="run-cl1-summary" type="button"${d(p.cl1ReplayValidation)}>QA</button>
    </div>
  </div>`;

  const grpActions = `<div class="uxml-tb-group">
    <div class="uxml-tb-group-label">Actions</div>
    <div class="uxml-tb-group-row">
      <button data-uxml-action="run-full-pipeline" type="button" class="uxml-tb-btn-primary"${d(canConvert)}>▶ Run Full</button>
      <button data-uxml-action="export-summary" type="button">Export JSON</button>
    </div>
  </div>`;

  return `<div class="uxml-toolbar">${grpSource}${sep}${grpNorm}${sep}${grpValidate}${sep}${grpTopo}${sep}${grpCl1}${sep}${grpActions}</div>`;
}

function render(container, state) {
  const xmlReady = canRunXmlActions(state);
  const selected = effectiveSourceType(state);
  const canConvert = xmlReady && ['AUTO', 'UXML', 'INPUT_XML', 'STANDARD_XML', 'EXISTING_XML', 'PCF', 'PDF', 'STAGED_JSON'].includes(selected);

  container.innerHTML = `<div class="uxml-tab">
    <header class="uxml-header">
      <div><h2>Universal XML Converter</h2><p>XML/InputXML/UXML topology workbench -> UXML -> validation -> topology -> route handoff -> package chain.</p></div>
      <div class="uxml-header-badges"></div>
    </header>
    ${renderToolbar(state, xmlReady, canConvert)}
    <div class="uxml-status ${statusClass(state.status.kind)}">${esc(state.status.message)}</div>
    <main class="uxml-layout">
      <aside class="uxml-stages">${renderStages(state)}</aside>
      <section class="uxml-panel">${renderPanelHeader(state)}${panelHtml(state)}</section>
    </main>
  </div>`;
}

function buildSummary(state) {
  return {
    schema: 'pcf-glb-viewer/universal-xml-converter-tab-summary/v2',
    phase: 'Agent09',
    generatedAt: new Date().toISOString(),
    source: state.sourceFile
      ? {
          name: state.sourceFile.name,
          size: state.sourceFile.size,
          selectedSourceType: state.selectedSourceType,
          detectedSourceType: state.detectedSourceType,
          charactersLoaded: state.sourceText.length,
        }
      : null,
    reports: Object.fromEntries(
      Object.entries(state.reports).map(([key, value]) => [
        key,
        value ? { pass: reportPass(value), summary: value.summary || value.stats || null } : null,
      ])
    ),
    comparator: state.pipeline.comparison ? state.pipeline.comparison.summary || state.pipeline.comparison : null,
    deferred: {
      existingConverterBridge: false,
      outputBridges: true,
      masters: true,
    },
    intakeBridge: state.pipeline.sourceIntakeBridge
      ? {
          ok: state.pipeline.sourceIntakeBridge.ok,
          sourceType: state.pipeline.sourceIntakeBridge.route?.sourceType || '',
          strategy: state.pipeline.sourceIntakeBridge.route?.strategy || '',
          bridgeConverterId: state.pipeline.sourceIntakeBridge.route?.bridgeConverterId || '',
          bridgeOutputProfile: state.pipeline.sourceIntakeBridge.bridgeOutputProfile || '',
        }
      : null,
  };
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportSummary(state) {
  downloadText(
    'universal_xml_converter_agent09_summary.json',
    JSON.stringify(buildSummary(state), null, 2),
    'application/json'
  );
}

function bindEvents(container, state) {
  const onChange = async (event) => {
    const sourceSelect = event.target.closest('[data-uxml-source-type]');
    if (sourceSelect) {
      state.selectedSourceType = sourceSelect.value || 'AUTO';
      state.status = { kind: 'info', message: `Source type set to ${state.selectedSourceType}.` };
      render(container, state);
      return;
    }

    const fileInput = event.target.closest('[data-uxml-file-input]');
    if (!fileInput) return;

    const file = fileInput.files?.[0] || null;
    if (!file) {
      state.status = { kind: 'warn', message: 'No file selected.' };
      render(container, state);
      return;
    }

    try {
      const text = await file.text();
      const arrayBuffer = await file.arrayBuffer();
      state.sourceFile = {
        name: file.name,
        size: file.size,
        type: file.type || '',
        lastModified: file.lastModified || null,
      };
      state.sourceFileObject = file;
      state.sourceBlob = file;
      state.sourceArrayBuffer = arrayBuffer;
      state.sourceText = text;
      state.detectedSourceType = detectSourceType(file.name, text);
      state.reports.source = {
        pass: true,
        fileName: file.name,
        size: file.size,
        detectedSourceType: state.detectedSourceType,
      };
      state.status = {
        kind: 'ok',
        message: `Loaded ${file.name}. Detected source type: ${state.detectedSourceType}.`,
      };
    } catch (error) {
      state.status = { kind: 'error', message: `Failed to read source file: ${error.message}` };
    }

    render(container, state);
  };

  const onClick = async (event) => {
    const panelButton = event.target.closest('[data-uxml-panel]');
    if (panelButton) {
      state.activePanel = panelButton.dataset.uxmlPanel || 'source';
      render(container, state);
      return;
    }

    const actionButton = event.target.closest('[data-uxml-action]');
    if (!actionButton) return;

    const action = actionButton.dataset.uxmlAction;

    if (action === 'detect-profile' && !String(state.sourceText || '').trim()) {
      state.status = { kind: 'warn', message: 'Load a source file before detecting profile.' };
      render(container, state);
      return;
    }

    try {
      if (action === 'export-summary') {
        exportSummary(state);
        state.status = { kind: 'ok', message: 'Universal XML Converter summary exported.' };
      } else {
        await runPipelineActionAsync(state, action);
      }
    } catch (error) {
      state.status = { kind: 'error', message: error.message };
    }

    render(container, state);
  };

  container.addEventListener('change', onChange);
  container.addEventListener('click', onClick);

  return () => {
    container.removeEventListener('change', onChange);
    container.removeEventListener('click', onClick);
  };
}

export function renderUniversalXmlConverterTab(container, options = {}) {
  if (!container) {
    throw new Error('renderUniversalXmlConverterTab requires a container element.');
  }

  const state = createInitialState();
  state.converterExecutor = typeof options.converterExecutor === 'function'
    ? options.converterExecutor
    : defaultUniversalXmlConverterExecutor;
  render(container, state);
  return bindEvents(container, state);
}

export function runUniversalXmlPipelineFromText(text, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const sourceName = opts.sourceName || 'inline.xml';
  const state = createInitialState();

  state.sourceFile = {
    name: sourceName,
    size: String(text ?? '').length,
    type: 'text/xml',
    lastModified: null,
  };
  state.sourceText = String(text ?? '');
  state.selectedSourceType = opts.selectedSourceType || 'AUTO';
  state.detectedSourceType = detectSourceType(sourceName, state.sourceText);
  state.reports.source = { pass: true, fileName: sourceName, detectedSourceType: state.detectedSourceType };

  for (const action of FULL_PIPELINE_ACTIONS) {
    runPipelineAction(state, action);
  }

  return state;
}

export async function runUniversalXmlPipelineFromTextAsync(text, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const sourceName = opts.sourceName || 'inline.xml';
  const state = createInitialState();

  state.sourceFile = {
    name: sourceName,
    size: String(text ?? '').length,
    type: opts.mimeType || 'text/plain',
    lastModified: null,
  };
  state.sourceText = String(text ?? '');
  state.selectedSourceType = opts.selectedSourceType || 'AUTO';
  state.detectedSourceType = detectSourceType(sourceName, state.sourceText);
  state.converterExecutor = typeof opts.converterExecutor === 'function'
    ? opts.converterExecutor
    : defaultUniversalXmlConverterExecutor;
  state.reports.source = {
    pass: true,
    fileName: sourceName,
    detectedSourceType: state.detectedSourceType,
  };

  await runPipelineActionAsync(state, 'run-full-pipeline');

  return state;
}

export const _test = Object.freeze({
  createInitialState,
  summarizeReport,
  buildSummary,
  canRunXmlActions,
  effectiveSourceType,
  isBridgeSourceType,
  isDirectXmlSourceType,
  sourceIntakeRouteSummary,
  PIPELINE_STAGES,
});
