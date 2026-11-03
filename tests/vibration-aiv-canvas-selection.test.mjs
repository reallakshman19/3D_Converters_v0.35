import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAivCanvasLayout } from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';
import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import {
  aivCanvasSelectionFromElement,
  applyAivCanvasSelection,
  centerAivCanvasLayoutOnElement,
} from '../tabs/vibration-aiv-canvas-selection.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
  contains(name) { return this.values.has(name); }
}

function element(dataset = {}) {
  const attributes = new Map();
  return {
    dataset: { ...dataset },
    classList: new FakeClassList(),
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
  };
}

function selectionContainer(canvasElements, tableRows) {
  return {
    querySelectorAll(selector) {
      if (selector === '[data-aiv-canvas-node],[data-aiv-canvas-relationship]') return canvasElements;
      if (selector === '[data-aiv-table-row-kind]') return tableRows;
      return [];
    },
  };
}

test('selection metadata uses canonical case-qualified keys and table kind', () => {
  const selected = aivCanvasSelectionFromElement(element({
    aivSelectionKey: 'SOURCE:S-1:C-2',
    aivTableKind: 'sources',
  }));
  assert.deepEqual(selected, { selectionKey: 'SOURCE:S-1:C-2', tableKind: 'sources' });
  assert.equal(aivCanvasSelectionFromElement(element()), null);
});

test('same source in two operating cases selects only the exact matching canvas object and table row', () => {
  const canvasCase1 = element({ aivSelectionKey: 'SOURCE:S-1:C-1' });
  const canvasCase2 = element({ aivSelectionKey: 'SOURCE:S-1:C-2' });
  const rowCase1 = element({ aivSelectionKey: 'SOURCE:S-1:C-1' });
  const rowCase2 = element({ aivSelectionKey: 'SOURCE:S-1:C-2' });
  const applied = applyAivCanvasSelection(
    selectionContainer([canvasCase1, canvasCase2], [rowCase1, rowCase2]),
    { selectionKey: 'SOURCE:S-1:C-2' },
  );
  assert.equal(applied.canvasElement, canvasCase2);
  assert.equal(applied.tableRow, rowCase2);
  assert.equal(canvasCase1.classList.contains('is-selected'), false);
  assert.equal(canvasCase2.classList.contains('is-selected'), true);
  assert.equal(rowCase1.getAttribute('aria-selected'), 'false');
  assert.equal(rowCase2.getAttribute('aria-selected'), 'true');
});

test('table-driven canvas centering preserves zoom and changes presentation viewport only', () => {
  const layout = createAivCanvasLayout({
    nodes: [{
      nodeKey: 'SOURCE:S-1:C-2', canonicalId: 'S-1', caseId: 'C-2', nodeKind: 'SOURCE',
      x: 120, y: 200, displayOrder: 0, collapsed: false,
    }],
    viewport: { x: 11, y: 22, zoom: 1.7 },
  });
  const svg = { viewBox: { baseVal: { width: 760, height: 400 } } };
  const selected = element({ aivCanvasNode: 'SOURCE:S-1:C-2' });
  const centered = centerAivCanvasLayoutOnElement(svg, layout, selected);
  assert.equal(centered.viewport.zoom, 1.7);
  assert.equal(centered.viewport.x, 380 - 120 * 1.7);
  assert.equal(centered.viewport.y, 200 - 200 * 1.7);
  assert.deepEqual(centered.nodes, layout.nodes);
});

test('projection and table/SVG markup share canonical relationship selection identity without an engineering mutation path', () => {
  const projection = buildAivCanvasProjection({
    tables: {
      sources: {
        header: ['Source Canonical ID', 'Operating Case'],
        rows: [['SRC-A', 'CASE-2']],
      },
      assessments: {
        header: ['Assessment Canonical ID'],
        rows: [['ASSMT-A']],
      },
      relationships: {
        header: ['Source Canonical ID', 'Assessment Canonical ID', 'Operating Case', 'Physical Distance', 'Physical Distance Unit', 'Applicability Disposition'],
        rows: [['SRC-A', 'ASSMT-A', 'CASE-2', '1.2', 'm', 'APPLICABLE']],
      },
    },
  });
  assert.equal(projection.relationships[0].selectionKey, 'REL:SRC-A:ASSMT-A:CASE-2');
  const inputView = readFileSync(new URL('../tabs/vibration-aiv-input-view.js', import.meta.url), 'utf8');
  const canvasView = readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8');
  const selectionSource = readFileSync(new URL('../tabs/vibration-aiv-canvas-selection.js', import.meta.url), 'utf8');
  assert.match(inputView, /data-aiv-table-row-kind/u);
  assert.match(inputView, /SOURCE:\$\{id\}:\$\{caseId\}/u);
  assert.match(inputView, /REL:\$\{sourceId\}:\$\{assessmentId\}:\$\{caseId\}/u);
  assert.match(canvasView, /data-aiv-selection-key/u);
  assert.doesNotMatch(selectionSource, /updateAivInputCell|applyTableMutation|calculateEngineering|calculateAiv/u);
  assert.doesNotMatch(selectionSource, /physicalDistance|attenuationDb|pointPwlDb|combinedPointPwlDb|\blof\b/iu);
});
