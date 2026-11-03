import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SBC_SOURCE_IDENTITIES } from '../converters/vibration/sbc/source-trace.js';
import {
  SBC_INPUT_SEMANTIC_TRACE_RECORDS,
  SBC_INPUT_SEMANTIC_TRACE_STATUS,
  getSbcInputSemanticTrace,
} from '../converters/vibration/sbc/input-semantics.js';
import { SBC_TYPE_INPUT_CONTRACTS } from '../converters/vibration/sbc/type-input-contracts.js';

const SEMANTIC_FIELDS = [
  'geometry.minimumNominalDiameter',
  'geometry.overallBranchLength',
  'geometry.branchLegs',
  'geometry.firstSpan',
  'geometry.subsequentSpans',
  'geometry.endLegs',
  'geometry.bridgeSpan',
  'attachments.fittings',
  'attachments.valves',
  'locationContext',
  'supportTopology.firstSpanSupport',
  'topology.returnsToSameMainLine',
  'topology.bridgesDistinctMainLines',
];

test('user-linked 16d transcription custody preserves the already pinned blobs', () => {
  for (const key of ['EI_APPENDIX_D_STRUCTURED_TRANSCRIPTION', 'EI_T3_STRUCTURED_TRANSCRIPTION']) {
    const source = SBC_SOURCE_IDENTITIES[key];
    assert.equal(source.alsoVerifiedAtCommit, '16d1e58f728e72b04b761c02dce682aa189779f2');
    assert.equal(source.sameBlobAtVerifiedCommit, true);
  }
});

test('input semantic traces are reference-only and default-free', () => {
  assert.equal(SBC_INPUT_SEMANTIC_TRACE_STATUS, 'REFERENCE_SEMANTICS_POPULATED_PDF_REVIEW_PENDING');
  assert.equal(Object.keys(SBC_INPUT_SEMANTIC_TRACE_RECORDS).length, 13);
  for (const record of Object.values(SBC_INPUT_SEMANTIC_TRACE_RECORDS)) {
    assert.equal(record.useAllowed, 'INPUT_SEMANTIC_REFERENCE_ONLY');
    assert.equal(record.engineeringQualificationEstablished, false);
    assert.equal(record.numericalMethodUseAllowed, false);
    assert.equal(record.engineeringDefaultAllowed, false);
    assert.equal(Object.hasOwn(record, 'defaultValue'), false);
  }
});

test('engineering-bearing Type contract fields have explicit semantic reference rows', () => {
  for (const fieldPath of SEMANTIC_FIELDS) assert.ok(getSbcInputSemanticTrace(fieldPath), fieldPath);
  for (const contract of Object.values(SBC_TYPE_INPUT_CONTRACTS)) {
    for (const fieldPath of contract.requiredFields.filter((path) => SEMANTIC_FIELDS.includes(path))) {
      assert.ok(getSbcInputSemanticTrace(fieldPath), `${contract.typeId}:${fieldPath}`);
    }
  }
});

test('native unit semantics preserve source meanings without numerical method authority', () => {
  assert.equal(getSbcInputSemanticTrace('geometry.minimumNominalDiameter').nativeUnit, 'in_NB');
  assert.equal(getSbcInputSemanticTrace('geometry.overallBranchLength').nativeUnit, 'mm');
  assert.match(getSbcInputSemanticTrace('geometry.overallBranchLength').semantic, /lagging depth/u);
  assert.equal(getSbcInputSemanticTrace('geometry.bridgeSpan').nativeUnit, 'mm');
  assert.match(getSbcInputSemanticTrace('geometry.bridgeSpan').semantic, /no general derivation rule is frozen/u);
});

test('semantic documentation retains classifier and Type-3 authority boundaries', async () => {
  const text = await readFile(new URL('../docs/vibration/SBC-Input-Semantics-Reference-v1.md', import.meta.url), 'utf8');
  assert.match(text, /automaticClassificationAllowed\s*=\s*false/u);
  assert.match(text, /complete automatic four-way Type-selection algorithm/u);
  assert.match(text, /does not authorize fitting factors/u);
  assert.match(text, /Type-3 numerical curves remain quarantined/u);
  assert.doesNotMatch(text, /numericalMethodUseAllowed\s*=\s*true/u);
});
