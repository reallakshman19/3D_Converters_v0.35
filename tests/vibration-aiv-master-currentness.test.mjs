import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAivMasterEngineeringFingerprint,
  didAivMasterEngineeringInputsChange,
} from '../tabs/vibration-aiv-master-currentness.js';

function fixture(value = '12', sourceRevision = 'R1') {
  return {
    tables: {
      sources: { header: ['ID', 'Value'], rows: [['S1', value]] },
      assessments: { header: ['ID'], rows: [['A1']] },
      relationships: { header: ['Source', 'Assessment'], rows: [['S1', 'A1']] },
    },
    resolution: {
      resolutions: [{ tableKind: 'sources', rowIndex: 0, column: 'Value', value, sourceRevision }],
      unresolved: [],
      discoveredAssessmentCanonicalIds: [],
    },
  };
}

test('identical effective values and provenance do not advance master currentness', () => {
  const first = fixture();
  const copy = JSON.parse(JSON.stringify(first));
  assert.equal(didAivMasterEngineeringInputsChange(first, copy), false);
  assert.equal(buildAivMasterEngineeringFingerprint(first.tables, first.resolution), buildAivMasterEngineeringFingerprint(copy.tables, copy.resolution));
});

test('effective table value change advances master currentness', () => {
  assert.equal(didAivMasterEngineeringInputsChange(fixture('12'), fixture('13')), true);
});

test('provenance revision change advances currentness even when effective value is unchanged', () => {
  assert.equal(didAivMasterEngineeringInputsChange(fixture('12', 'R1'), fixture('12', 'R2')), true);
});
