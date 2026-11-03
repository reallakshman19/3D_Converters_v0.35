import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AIV_CANVAS_SCREENING_EXPORT_SCHEMA,
  buildAivCanvasScreeningExportPackage,
} from '../converters/vibration/aiv/aiv-canvas-export.js';
import {
  buildAivCanvasExportPayload,
  readAivCanvasPresentationSnapshot,
} from '../tabs/vibration-aiv-canvas-export-controller.js';

function engineeringPackage() {
  return Object.freeze({
    schema: 'AivScreeningExportPackage.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    resultScope: 'ASSESSMENT_SCREENING',
    result: Object.freeze({ lof: 0.29 }),
    inputs: Object.freeze({ relationships: Object.freeze([{ physicalDistance: { value: 0.8, unit: 'm' } }]) }),
    assumptions: Object.freeze({ assumptionCount: 1 }),
    provenance: Object.freeze({ calculationId: 'VIB.AIV.ACOUSTIC' }),
    screeningAuthority: 'AUTHORIZED',
    designAuthority: false,
  });
}

function domainResult() {
  return Object.freeze({
    schema: 'AivCalculatorResult.v1',
    qualificationMode: 'screening',
    stageOrder: Object.freeze([]),
    implementedStageCount: 10,
    sourceResults: Object.freeze([]),
    assessmentResults: Object.freeze([]),
    lineCaseSummaries: Object.freeze([]),
    authority: Object.freeze({ screeningAuthority: 'AUTHORIZED' }),
    assumptionProfile: null,
  });
}

function state() {
  const result = domainResult();
  return {
    screeningResult: { ok: true, evidence: { domainResult: result } },
    readinessEnvelope: {
      sources: [], assessments: [], sourceAssessments: [], exchange: { elements: [] }, readiness: { rows: [] },
    },
    tables: {
      sources: { header: [], rows: [] },
      assessments: { header: [], rows: [] },
      relationships: { header: [], rows: [] },
    },
    assumptionProfile: null,
    assumptionResolution: null,
  };
}

test('canvas export keeps the existing engineering screening package intact and authoritative', () => {
  const engineering = engineeringPackage();
  const payload = buildAivCanvasScreeningExportPackage({
    engineeringScreeningPackage: engineering,
    canvasLayout: { schema: 'AivCanvasLayout.v1', viewport: { x: 4, y: 5, zoom: 1.2 }, nodes: [] },
    canvasFilters: { caseId: 'CASE-A', line: 'LINE-1', showMode: 'CURRENT' },
    canvasProjection: { schema: 'AivCanvasProjection.v1', presentationOnly: true, nodes: [], relationships: [] },
    svgSnapshot: '<svg data-aiv-canvas-svg="true"></svg>',
  });
  assert.equal(payload.schema, AIV_CANVAS_SCREENING_EXPORT_SCHEMA);
  assert.deepEqual(payload.engineeringScreeningPackage, engineering);
  assert.equal(payload.engineeringAuthoritySource, 'engineeringScreeningPackage');
  assert.equal(payload.canvasPresentation.presentationOnly, true);
  assert.equal(payload.canvasPresentation.requiredForEngineeringInterpretation, false);
  assert.equal(payload.screeningAuthority, 'AUTHORIZED');
  assert.equal(payload.designAuthority, false);
});

test('layout, filter and SVG changes cannot alter the embedded engineering package', () => {
  const engineering = engineeringPackage();
  const first = buildAivCanvasScreeningExportPackage({
    engineeringScreeningPackage: engineering,
    canvasLayout: { x: 1 }, canvasFilters: { caseId: 'A' }, svgSnapshot: '<svg><path d="M0 0L1 1"/></svg>',
  });
  const second = buildAivCanvasScreeningExportPackage({
    engineeringScreeningPackage: engineering,
    canvasLayout: { x: 9999 }, canvasFilters: { caseId: 'B' }, svgSnapshot: '<svg><path d="M0 0L999 999"/></svg>',
  });
  assert.deepEqual(first.engineeringScreeningPackage, second.engineeringScreeningPackage);
  assert.equal(first.engineeringScreeningPackage.inputs.relationships[0].physicalDistance.value, 0.8);
  assert.notDeepEqual(first.canvasPresentation.layout, second.canvasPresentation.layout);
});

test('canvas presentation is optional and engineering interpretation survives its removal', () => {
  const engineering = engineeringPackage();
  const payload = buildAivCanvasScreeningExportPackage({ engineeringScreeningPackage: engineering });
  assert.equal(payload.canvasPresentation, null);
  const stripped = { ...buildAivCanvasScreeningExportPackage({
    engineeringScreeningPackage: engineering,
    canvasLayout: { schema: 'AivCanvasLayout.v1' },
  }) };
  delete stripped.canvasPresentation;
  assert.deepEqual(stripped.engineeringScreeningPackage, engineering);
});

test('presentation snapshot reads current UI state without deriving engineering values', () => {
  const nodes = new Map([
    ['[data-aiv-canvas-filter="case"]', { value: 'CASE-A' }],
    ['[data-aiv-canvas-filter="line"]', { value: 'LINE-1' }],
    ['[data-aiv-canvas-filter="show"]', { value: 'ALL' }],
    ['[data-aiv-canvas-svg]', { outerHTML: '<svg data-aiv-canvas-svg="true"></svg>' }],
  ]);
  const container = { querySelector: (selector) => nodes.get(selector) ?? null };
  const layout = { schema: 'AivCanvasLayout.v1', viewport: { x: 1, y: 2, zoom: 1.5 }, nodes: [] };
  assert.deepEqual(readAivCanvasPresentationSnapshot(container, layout), {
    layout,
    filters: { caseId: 'CASE-A', line: 'LINE-1', showMode: 'ALL' },
    svgSnapshot: '<svg data-aiv-canvas-svg="true"></svg>',
  });
});

test('state bridge embeds the standalone screening export and read-only canvas projection', () => {
  const payload = buildAivCanvasExportPayload(state(), {
    layout: { schema: 'AivCanvasLayout.v1', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] },
    filters: { caseId: null, line: null, showMode: 'ALL' },
    svgSnapshot: '<svg></svg>',
  });
  assert.equal(payload.engineeringScreeningPackage.schema, 'AivScreeningExportPackage.v1');
  assert.equal(payload.engineeringScreeningPackage.result.schema, 'AivCalculatorResult.v1');
  assert.equal(payload.canvasPresentation.projection.schema, 'AivCanvasProjection.v1');
  assert.equal(payload.canvasPresentation.projection.presentationOnly, true);
});

test('canvas export path contains no calculation implementation, geometry-to-distance path or SVG parser', () => {
  const wrapper = readFileSync(new URL('../converters/vibration/aiv/aiv-canvas-export.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../tabs/vibration-aiv-canvas-export-controller.js', import.meta.url), 'utf8');
  const qualification = readFileSync(new URL('../tabs/vibration-aiv-qualification-tab.js', import.meta.url), 'utf8');
  for (const source of [wrapper, controller]) {
    assert.doesNotMatch(source, /calculateEngineering|calculateAiv|aiv-calculator|Math\.(?:log10|log|tanh|pow)|\*\*/u);
    assert.doesNotMatch(source, /DOMParser|parseFromString|getTotalLength|getBoundingClientRect.*distance|physicalDistance.*(?:svg|path|pixel)/isu);
  }
  assert.match(controller, /Export canvas package/u);
  assert.match(controller, /buildAivScreeningExportPackage/u);
  assert.match(qualification, /exportScreeningResult/u);
  assert.match(qualification, /createAivCanvasExportController/u);
});
