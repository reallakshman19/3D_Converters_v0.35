#!/usr/bin/env node

import fs from 'node:fs';
import { adaptRvmRowsToUxml } from '../../rvm-pcf-extract/RvmRowsToUxmlAdapter.js';
import { buildRvmPcfAcceptedTopologyHandoff } from '../../rvm-pcf-extract/RvmPcfAcceptedTopologyHandoff.js';
import { validateUxmlDocument } from '../../uxml/UxmlValidationGate.js';
import { buildUxmlFaceModel } from '../../uxml/UxmlFaceModelBuilder.js';
import { buildUxmlUniversalTopoGraph } from '../../uxml/UxmlUniversalTopoGraphBuilder.js';
import { buildUxmlRayTopoGraph } from '../../uxml/UxmlRayTopoGraphBuilder.js';
import { compareUxmlTopoGraphs } from '../../uxml/UxmlTopoGraphComparator.js';
import { decideUxmlTopologyAcceptance } from '../../uxml/UxmlTopologyDecisionGate.js';

function clean(value) { return String(value ?? '').trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function severity(value) {
  const raw = clean(value?.severity || value?.level || 'INFO').toUpperCase();
  if (['FATAL', 'ERROR', 'ERR'].includes(raw)) return 'ERROR';
  if (['WARNING', 'WARN'].includes(raw)) return 'WARNING';
  return 'INFO';
}
function flattenDiagnostics(parts) {
  const out = [];
  for (const [source, value] of Object.entries(parts)) {
    const items = [
      ...asArray(value?.diagnostics),
      ...asArray(value?.warnings),
      ...asArray(value?.blockers),
      ...asArray(value?.lossContract),
    ];
    for (const item of items) out.push({ ...item, severity: severity(item), _source: source });
  }
  return out;
}
function inputMode(payload, context) {
  const explicit = clean(context.inputKind || payload?.inputKind).toUpperCase();
  if (['UXML', 'UXML_DOCUMENT'].includes(explicit)) return 'UXML_DOCUMENT';
  if (['RVM_ROWS', 'RVM-ROWS', 'ROWS'].includes(explicit)) return 'RVM_ROWS';
  const doc = payload?.uxml || payload;
  if (doc && typeof doc === 'object' && doc.schemaVersion === 'uxml-topology-v1') return 'UXML_DOCUMENT';
  if (Array.isArray(payload) || Array.isArray(payload?.rows) || Array.isArray(payload?.rvmRows)) return 'RVM_ROWS';
  throw new Error('Unable to determine UXML/RVM intake kind. Supply inputKind=UXML_DOCUMENT or RVM_ROWS.');
}

try {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  const context = JSON.parse(process.env.INPUTXML_COMPILER_UXML_RVM_CONTEXT || '{}');
  const mode = inputMode(payload, context);
  let uxml;
  let rows = [];
  let adapter = null;
  let rowIdentityByComponentId = {};
  if (mode === 'UXML_DOCUMENT') {
    uxml = payload?.uxml || payload;
  } else {
    rows = Array.isArray(payload) ? payload : (payload.rows || payload.rvmRows || []);
    adapter = adaptRvmRowsToUxml(rows, {
      name: clean(context.sourceName || 'rvm-extract-rows'),
      path: clean(context.sourcePath || ''),
      hash: clean(context.sourceHash || `rows:${rows.length}`),
    });
    uxml = adapter.uxml;
    rowIdentityByComponentId = adapter.rowIdentityByComponentId || {};
  }

  const validation = validateUxmlDocument(uxml);
  const faceModel = buildUxmlFaceModel(uxml, { allowPartial: false });
  const universalGraph = buildUxmlUniversalTopoGraph(uxml, {
    faceModel,
    allowPartialFaceModel: false,
    allowBlockedFaceModel: false,
    connectToleranceMm: Number(context.connectToleranceMm ?? 6),
  });
  const rayGraph = buildUxmlRayTopoGraph(uxml, {
    faceModel,
    universalGraph,
    allowPartialFaceModel: false,
    allowBlockedFaceModel: false,
    maxRayLengthMm: Number(context.maxRayLengthMm ?? 500),
    tubeToleranceMm: Number(context.tubeToleranceMm ?? 12),
  });
  const comparison = compareUxmlTopoGraphs(uxml, {
    universalGraph,
    rayGraph,
    allowBlockedGraphs: true,
  });
  const topologyDecision = decideUxmlTopologyAcceptance(uxml, {
    comparison,
    allowPartialExport: false,
    acceptUniversalOnly: true,
    allowSafeRayPromotions: false,
    allowFaceProximityPromotions: false,
    maxPromotionDistanceAlongRayMm: Number(context.maxRayLengthMm ?? 500),
    maxPromotionPerpendicularMissMm: Number(context.tubeToleranceMm ?? 12),
  });
  const acceptedTopologyHandoff = mode === 'RVM_ROWS'
    ? buildRvmPcfAcceptedTopologyHandoff({ rows, topologyDecision, rowIdentityByComponentId })
    : null;
  const diagnostics = flattenDiagnostics({
    adapter,
    uxml,
    validation,
    faceModel,
    universalGraph,
    rayGraph,
    comparison,
    topologyDecision,
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    mode,
    rows,
    rowIdentityByComponentId,
    uxml,
    adapter,
    validation,
    faceModel,
    universalGraph,
    rayGraph,
    comparison,
    topologyDecision,
    acceptedTopologyHandoff,
    diagnostics,
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error), stack: error?.stack || '' }));
  process.exitCode = 2;
}
