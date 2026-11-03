import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { AIV_CANVAS_MODE } from '../tabs/vibration-aiv-canvas-relationship.js';
import { renderAivCanvasSelectedDetailHtml, renderAivCanvasWorkspaceHtml } from '../tabs/vibration-aiv-canvas-view.js';
import { renderAivInputWorkspaceHtml } from '../tabs/vibration-aiv-input-view.js';

function tables() {
  return {
    sources: {
      kind: 'sources',
      header: ['Source Canonical ID', 'Operating Case', 'Source Device Type', 'Source State', 'Low Noise Trim State', 'Sonic State', 'Source', 'Source Revision', 'Record ID'],
      rows: [
        ['PSV-1', 'CASE-A', 'RELIEF_VALVE', 'RELIEVING', 'NONE', 'SONIC', 'TEST', '1', 'SRC-1'],
        ['CV-1', 'CASE-A', 'CONTROL_VALVE', 'ACTIVE', 'MANUFACTURER_REDUCTION', 'NON_SONIC', 'TEST', '1', 'SRC-2'],
        ['RO-1', 'CASE-B', 'RESTRICTION_ORIFICE', 'ACTIVE', 'NONE', 'NON_SONIC', 'TEST', '1', 'SRC-3'],
        ['PRD-1', 'CASE-B', 'PRESSURE_REDUCING_BRANCH_CONNECTION', 'CLOSED', 'NONE', 'NON_SONIC', 'TEST', '1', 'SRC-4'],
      ],
    },
    assessments: {
      kind: 'assessments',
      header: ['Assessment Canonical ID', 'Assessment Type', 'Source', 'Source Revision', 'Record ID'],
      rows: [
        ['WO-1', 'WELDOLET', 'TEST', '1', 'A-1'],
        ['TEE-1', 'WELDED_TEE', 'TEST', '1', 'A-2'],
        ['SUP-1', 'WELDED_SUPPORT', 'TEST', '1', 'A-3'],
        ['OTH-1', 'OTHER_WELDED_DISCONTINUITY', 'TEST', '1', 'A-4'],
      ],
    },
    relationships: {
      kind: 'relationships',
      header: ['Source Canonical ID', 'Assessment Canonical ID', 'Operating Case', 'Physical Distance', 'Physical Distance Unit', 'Distance Source', 'Distance Source Revision', 'Simultaneous Source Group', 'Applicability Disposition', 'Source', 'Source Revision', 'Record ID'],
      rows: [
        ['PSV-1', 'WO-1', 'CASE-A', '0.8', 'm', 'ISO', '1', 'SIM-1', 'APPLICABLE', 'TEST', '1', 'R-1'],
        ['CV-1', 'WO-1', 'CASE-A', '1.0', 'm', 'ISO', '1', 'SIM-1', 'APPLICABLE', 'TEST', '1', 'R-2'],
        ['RO-1', 'TEE-1', 'CASE-B', '1.2', 'm', 'ISO', '1', '', 'UNRESOLVED', 'TEST', '1', 'R-3'],
      ],
    },
  };
}

const topology = {
  elements: [
    { canonicalId: 'PSV-1', tag: 'PSV-1', type: 'VALV', line: 'L-1' },
    { canonicalId: 'CV-1', tag: 'CV-1', type: 'VALV', line: 'L-1' },
    { canonicalId: 'RO-1', tag: 'RO-1', type: 'ORIFICE', line: 'L-2' },
    { canonicalId: 'PRD-1', tag: 'PRD-1', type: 'VALV', line: 'L-2' },
    { canonicalId: 'WO-1', tag: 'WO-1', type: 'OLET', line: 'L-1' },
    { canonicalId: 'TEE-1', tag: 'TEE-1', type: 'TEE', line: 'L-2' },
    { canonicalId: 'SUP-1', tag: 'SUP-1', type: 'SUPPORT', line: 'L-3' },
    { canonicalId: 'OTH-1', tag: 'OTH-1', type: 'WELD', line: 'L-3' },
    { canonicalId: 'J-1', tag: 'Junction', type: 'JUNCTION', line: 'L-1' },
    { canonicalId: 'N-1', tag: 'Node', type: 'CONNECTION_NODE', line: 'L-1' },
    { canonicalId: 'OFF-1', tag: 'Off page', type: 'OFF_PAGE', line: 'L-2' },
    { canonicalId: 'BND-1', tag: 'Boundary', type: 'VESSEL', line: 'L-3' },
  ],
};

test('canvas has explicit RESULTS mode in addition to navigate and relationships', () => {
  assert.equal(AIV_CANVAS_MODE.NAVIGATE, 'NAVIGATE');
  assert.equal(AIV_CANVAS_MODE.RELATIONSHIPS, 'RELATIONSHIPS');
  assert.equal(AIV_CANVAS_MODE.RESULTS, 'RESULTS');
  const controller = readFileSync(new URL('../tabs/vibration-aiv-canvas-controller.js', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8');
  assert.match(controller, /querySelector\('\.aiv-canvas-card'\)/u);
  assert.match(controller, /card\.dataset\.aivCanvasActiveMode = runtime\.relationship\.mode/u);
  assert.match(controller, /button\.setAttribute\('aria-pressed'/u);
  assert.match(view, /data-aiv-canvas-mode="RESULTS"/u);
  assert.match(view, /data-aiv-canvas-active-mode="RESULTS"/u);
});

test('projection and renderer expose engineering-specific source assessment and infrastructure icons', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), topology });
  const byId = new Map(projection.nodes.map((item) => [item.canonicalId, item.iconType]));
  assert.equal(byId.get('PSV-1'), 'RELIEF_VALVE');
  assert.equal(byId.get('CV-1'), 'CONTROL_VALVE');
  assert.equal(byId.get('RO-1'), 'RESTRICTION_ORIFICE');
  assert.equal(byId.get('PRD-1'), 'PRESSURE_REDUCING_DEVICE');
  assert.equal(byId.get('WO-1'), 'WELDOLET');
  assert.equal(byId.get('TEE-1'), 'WELDED_TEE');
  assert.equal(byId.get('SUP-1'), 'WELDED_SUPPORT');
  assert.equal(byId.get('OTH-1'), 'OTHER_WELDED_DISCONTINUITY');
  assert.equal(byId.get('J-1'), 'JUNCTION');
  assert.equal(byId.get('N-1'), 'CONNECTION_NODE');
  assert.equal(byId.get('OFF-1'), 'OFF_PAGE');
  assert.equal(byId.get('BND-1'), 'BOUNDARY');

  const html = renderAivCanvasWorkspaceHtml({ tables: tables(), topology });
  for (const icon of ['RELIEF_VALVE', 'CONTROL_VALVE', 'RESTRICTION_ORIFICE', 'PRESSURE_REDUCING_DEVICE', 'WELDOLET', 'WELDED_TEE', 'WELDED_SUPPORT', 'OTHER_WELDED_DISCONTINUITY', 'JUNCTION', 'CONNECTION_NODE', 'OFF_PAGE', 'BOUNDARY']) {
    assert.match(html, new RegExp(`data-aiv-icon-type="${icon}"`, 'u'));
  }
});

test('source and relationship status glyphs expose active closed sonic trim applicability result-readiness vocabulary', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), topology });
  const psv = projection.nodes.find((item) => item.canonicalId === 'PSV-1');
  const cv = projection.nodes.find((item) => item.canonicalId === 'CV-1');
  const prd = projection.nodes.find((item) => item.canonicalId === 'PRD-1');
  const applicable = projection.relationships.find((item) => item.sourceCanonicalId === 'PSV-1');
  const unresolved = projection.relationships.find((item) => item.sourceCanonicalId === 'RO-1');
  assert(psv.statusGlyphs.includes('ACTIVE'));
  assert(psv.statusGlyphs.includes('SONIC'));
  assert(psv.statusGlyphs.includes('TRACE_AVAILABLE'));
  assert(cv.statusGlyphs.includes('TRIMMED'));
  assert(cv.statusGlyphs.includes('NON_SONIC'));
  assert(prd.statusGlyphs.includes('CLOSED'));
  assert(applicable.statusGlyphs.includes('APPLICABLE'));
  assert(unresolved.statusGlyphs.includes('UNRESOLVED'));
});

test('workspace renders one selected-detail host and selected records render on demand', () => {
  const state = { tables: tables(), topology };
  const workspace = renderAivCanvasWorkspaceHtml(state);
  assert.match(workspace, /data-aiv-canvas-selected-detail-host/u);
  assert.doesNotMatch(workspace, /data-aiv-canvas-assumption-detail="SOURCE:PSV-1:CASE-A"/u);

  const source = renderAivCanvasSelectedDetailHtml(state, 'SOURCE:PSV-1:CASE-A');
  const assessment = renderAivCanvasSelectedDetailHtml(state, 'ASSESSMENT:WO-1');
  const relationship = renderAivCanvasSelectedDetailHtml(state, 'REL:PSV-1:WO-1:CASE-A');
  assert.match(source, /data-aiv-canvas-assumption-detail="SOURCE:PSV-1:CASE-A"/u);
  assert.match(assessment, /data-aiv-canvas-assumption-detail="ASSESSMENT:WO-1"/u);
  assert.match(relationship, /data-aiv-canvas-assumption-detail="REL:PSV-1:WO-1:CASE-A"/u);
  for (const html of [source, assessment, relationship]) {
    assert.match(html, />Summary</u);
    assert.match(html, />Inputs</u);
    assert.match(html, />Assumptions</u);
    assert.match(html, />Provenance</u);
    assert.match(html, /aria-controls=/u);
    assert.match(html, /aria-labelledby=/u);
    assert.match(html, /No screening result is available yet/u);
  }
  assert.match(assessment, />Contributions</u);
  assert.match(assessment, />T2-6</u);
  assert.match(relationship, />Contribution</u);
});

test('editable engineering table rows carry the same case and line filter metadata as canvas records', () => {
  const html = renderAivInputWorkspaceHtml({ tables: tables(), topology, files: {}, busy: false });
  assert.match(html, /data-aiv-table-row-kind="sources"[^>]*data-aiv-filterable="true"[^>]*data-aiv-canvas-cases="CASE-A"[^>]*data-aiv-canvas-line="L-1"/u);
  assert.match(html, /data-aiv-table-row-kind="assessments"[^>]*data-aiv-filterable="true"[^>]*data-aiv-canvas-cases="CASE-A"[^>]*data-aiv-canvas-line="L-1"/u);
  assert.match(html, /data-aiv-table-row-kind="relationships"[^>]*data-aiv-filterable="true"[^>]*data-aiv-canvas-cases="CASE-A"[^>]*data-aiv-canvas-line="L-1"/u);
});