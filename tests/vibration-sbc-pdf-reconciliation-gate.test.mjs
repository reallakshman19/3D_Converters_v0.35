import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SBC_CONTROLLED_PDF_RECONCILIATION,
  SBC_CONTROLLED_PDF_RECONCILIATION_STATUS,
} from '../converters/vibration/sbc/controlled-pdf-reconciliation.js';
import {
  SBC_CONTROLLED_ARTIFACTS,
  SBC_TYPE_IMPLEMENTATION_SLOTS,
} from '../converters/vibration/sbc/vertical-manifest.js';

test('controlled PDF identity is pinned while page review remains not-run', () => {
  const gate = SBC_CONTROLLED_PDF_RECONCILIATION;
  assert.equal(SBC_CONTROLLED_PDF_RECONCILIATION_STATUS, 'BLOCKED_PDF_PAGE_REVIEW_NOT_RUN_ENVIRONMENT');
  assert.equal(gate.controlledPdf.blob, '9d3eccc56429411e17c07a579bdebbd13cb0bdc5');
  assert.equal(gate.controlledPdf.identityVerified, true);
  assert.equal(gate.controlledPdfPageReview.status, 'NOT_RUN_ENVIRONMENT_BLOCKED');
  assert.equal(gate.controlledPdfPageReview.screenshotReviewPerformed, false);
  assert.equal(gate.controlledPdfPageReview.governingRulesReconciled, false);
});

test('structured references are custody evidence, not independent authority', () => {
  const refs = SBC_CONTROLLED_PDF_RECONCILIATION.structuredReferences;
  assert.equal(refs.length, 4);
  assert.deepEqual(refs.map((item) => item.blob), [
    'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
    '5312c9e2cf86af9e940ba722fcbee64702aeccd3',
    '51bca43473be8018d4ce48fb440ee4d7bd0abc82',
    '24ecf4cba407effad5bd2a5cc39db592fe7c67fe',
  ]);
  for (const item of refs) assert.equal(item.independentEngineeringSource, false);
});

test('Flowchart T3-1 and numerical conversion policy fail closed', () => {
  const gate = SBC_CONTROLLED_PDF_RECONCILIATION;
  assert.equal(gate.typeSelection.governingArtifact, 'FLOWCHART_T3_1');
  assert.equal(gate.typeSelection.governingArtifactTranscriptionLocated, false);
  assert.equal(gate.typeSelection.controlledPdfReconciled, false);
  assert.equal(gate.typeSelection.automaticClassificationAllowed, false);
  assert.equal(gate.numericalUnitConversionPolicy.status, 'NOT_FROZEN');
  assert.equal(gate.numericalUnitConversionPolicy.conversionConstantsFrozen, false);
  assert.equal(gate.numericalUnitConversionPolicy.normalizationExecutionAllowed, false);
  assert.equal(gate.independentEngineeringReview.status, 'NOT_ESTABLISHED');
});

test('vertical manifest makes reconciliation a blocker for every Type', () => {
  assert.equal(
    SBC_CONTROLLED_ARTIFACTS.CONTROLLED_PDF_RECONCILIATION.status,
    SBC_CONTROLLED_PDF_RECONCILIATION_STATUS,
  );
  for (const slot of Object.values(SBC_TYPE_IMPLEMENTATION_SLOTS)) {
    assert.equal(slot.executionAllowed, false);
    assert.equal(slot.blockedBy.includes('SBC_CONTROLLED_PDF_RECONCILIATION_NOT_COMPLETE'), true);
  }
});

test('reconciliation documentation does not claim review or execution authority', async () => {
  const text = await readFile(
    new URL('../docs/vibration/SBC-Controlled-PDF-Reconciliation-v1.md', import.meta.url),
    'utf8',
  );
  assert.match(text, /controlledPdfPageReview\s+= NOT_RUN_ENVIRONMENT_BLOCKED/u);
  assert.match(text, /Flowchart T3-1 reconciliation\s+= NOT_ESTABLISHED/u);
  assert.match(text, /automaticClassificationAllowed\s+= false/u);
  assert.match(text, /numericalUnitConversionPolicy\s+= NOT_FROZEN/u);
  assert.match(text, /independentEngineeringReview\s+= NOT_ESTABLISHED/u);
  assert.doesNotMatch(text, /numericalExecutionAllowed\s+= true/u);
});
