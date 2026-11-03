import assert from 'node:assert/strict';
import {
  buildModeAConsolidatedPreview,
  buildModeAConsolidatedWeightMatch,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated.js';

const executionRows = [
  {
    source: { sourceId: 'SRC-A', fileName: 'SYS-0001.xml', alias: 'SYS-0001' },
    state: { sourceText: '<A/>', stagedJsonText: '', supportConfigJson: '{}' },
  },
  {
    source: { sourceId: 'SRC-B', fileName: 'SYS-0002.xml', alias: 'SYS-0002' },
    state: { sourceText: '<B/>', stagedJsonText: '', supportConfigJson: '{}' },
  },
];

const previewByXml = {
  '<A/>': {
    branchRows: [
      {
        branchName: '/ASIM-SAME/B1', lineKey: 'LINE-A', size: '80mm', pipingClass: '9126129',
        material: 'ASTM A106-B', rating: '900', materialCode: '106', p1: '100', hydroPressure: '150',
        t1: '80', t2: '40', t3: '', density: '7.62', wallThickness: '7.01', corrosion: '1',
        lineMiss: false, p1Source: 'master', hydroPressureSource: 'master', densitySource: 'master',
      },
      {
        branchName: '/ASIM-A/B2', lineKey: '', size: '50mm', pipingClass: '', material: '', rating: '',
        p1: '0', hydroPressure: '0', density: '0', wallThickness: '', corrosion: '', lineMiss: true,
        p1Source: 'config-default', hydroPressureSource: 'default-zero', densitySource: 'default',
      },
    ],
    nodeRows: [{}, {}],
  },
  '<B/>': {
    branchRows: [
      {
        branchName: '/ASIM-SAME/B1', lineKey: 'LINE-B', size: '80mm', pipingClass: '9126129',
        material: 'ASTM A106-B', rating: '900', materialCode: '106', p1: '110', hydroPressure: '165',
        t1: '90', t2: '45', t3: '', density: '7.62', wallThickness: '7.01', corrosion: '1',
        lineMiss: false, p1Source: 'master', hydroPressureSource: 'master', densitySource: 'master',
      },
    ],
    nodeRows: [{}],
  },
};

const preview = await buildModeAConsolidatedPreview({}, {
  executionRows: () => executionRows,
  previewBuilder: (xmlText) => previewByXml[xmlText],
  configBuilder: () => ({}),
  yieldUi: async () => {},
});

assert.equal(preview.sourceCount, 2);
assert.equal(preview.branchCount, 3);
assert.equal(preview.mappedCount, 2);
assert.equal(preview.unmappedCount, 1);
assert(preview.defaultValueCount >= 3);
assert.equal(preview.rows.filter((row) => row.branchName === '/ASIM-SAME/B1').length, 2, 'same Branchname in separate XML files must remain two consolidated rows');
assert.deepEqual(
  preview.rows.filter((row) => row.branchName === '/ASIM-SAME/B1').map((row) => row.sourceId).sort(),
  ['SRC-A', 'SRC-B'],
);
assert.equal(preview.rows.find((row) => row.sourceId === 'SRC-A' && row.branchName === '/ASIM-SAME/B1').lineKey, 'LINE-A');
assert.equal(preview.rows.find((row) => row.sourceId === 'SRC-B' && row.branchName === '/ASIM-SAME/B1').lineKey, 'LINE-B');

const weightByXml = {
  '<A/>': [
    {
      key: '/ASIM-SAME/B1::100', branchName: '/ASIM-SAME/B1', nodeNumber: '100', nodeNumberDisplay: '100',
      componentType: 'VALV', componentRefNo: 'V-1', boreMm: 80, rating: '900', resolvedPipingClass: '9126129',
      lengthMm: 300, weight: 25, weightSource: 'override', mapped: true, status: 'mapped', dtxr: 'VALVE 900#',
      candidates: [{ suggestedWeight: 26, totalScore: 0.95, typeDesc: 'Gate valve' }],
    },
  ],
  '<B/>': [
    {
      key: '/ASIM-SAME/B1::100', branchName: '/ASIM-SAME/B1', nodeNumber: '100', nodeNumberDisplay: '100',
      componentType: 'VALV', componentRefNo: 'V-2', boreMm: 80, rating: '900', resolvedPipingClass: '9126129',
      lengthMm: 320, weight: null, weightSource: 'unresolved', mapped: false, status: 'unresolved', dtxr: 'VALVE 900#',
      candidates: [{ suggestedWeight: 30, totalScore: 0.91, typeDesc: 'Ball valve' }],
    },
  ],
};

const weight = await buildModeAConsolidatedWeightMatch({}, {
  executionRows: () => executionRows,
  collector: (xmlText) => weightByXml[xmlText],
  configBuilder: () => ({ weight: { masterRows: [{}] } }),
  yieldUi: async () => {},
});

assert.equal(weight.sourceCount, 2);
assert.equal(weight.rowCount, 2);
assert.equal(weight.mappedCount, 1);
assert.equal(weight.unresolvedCount, 1);
assert.equal(weight.suggestedCount, 2);
assert.equal(weight.rows.filter((row) => row.branchName === '/ASIM-SAME/B1' && row.nodeNumber === '100').length, 2, 'same branch/node identity in separate XML files must remain source-distinct');
assert.equal(weight.rows.find((row) => row.sourceId === 'SRC-A').bestWeight, 26);
assert.equal(weight.rows.find((row) => row.sourceId === 'SRC-A').bestScore, '95%');
assert.equal(weight.rows.find((row) => row.sourceId === 'SRC-B').bestDescription, 'Ball valve');

console.log('xml-cii Mode A consolidated preview/weight tests: PASS');
