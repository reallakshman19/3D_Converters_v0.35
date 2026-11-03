import assert from 'node:assert/strict';
import { buildModeAPreviewFillPlan } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-bulk-preview.js';

const defaultRows = [
  { sourceId: 'A', branchName: '/A/B1', lineKey: 'L1', pipingClass: 'PC1', p1: '0', p1Source: 'default-zero' },
  { sourceId: 'B', branchName: '/B/B1', lineKey: 'L1', pipingClass: 'PC1', p1: '', p1Source: 'none' },
];
const defaultPlan = buildModeAPreviewFillPlan(defaultRows, defaultRows[0], 'p1');
assert.equal(defaultPlan.changes.length, 0);
assert.equal(defaultPlan.sourceNeedsReview, true);

const hydroRows = [
  { sourceId: 'A', branchName: '/A/B1', lineKey: 'L1', pipingClass: 'PC1', hydroPressure: 'Water', hydroPressureSource: 'line-list' },
  { sourceId: 'B', branchName: '/B/B1', lineKey: 'L2', pipingClass: 'PC1', hydroPressure: '0', hydroPressureSource: 'default-zero' },
];
const hydroPlan = buildModeAPreviewFillPlan(hydroRows, hydroRows[0], 'hydroPressure');
assert.equal(hydroPlan.changes.length, 0);
assert.equal(hydroPlan.invalidSourceValue, true);

console.log('xml-cii Mode A easy bulk guard tests: PASS');
