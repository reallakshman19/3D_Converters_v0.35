import assert from 'node:assert/strict';
import { inferPreviewPressureUnit } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const config = {
  linelist: {
    masterRows: [
      {
        'Line number': 'P4110001',
        'Pressure Max kPa(g)': 5110,
      },
    ],
    fieldMap: {},
  },
};

const inferred = inferPreviewPressureUnit(
  { lineKey: 'P4110001', p1: '5110', p1Source: 'linelist' },
  config,
  { pressureUnit: 'pascal' },
  { pressureUnit: 'AUTO' },
);
assert.equal(inferred.unit, 'KPA');
assert.equal(inferred.source, 'line-list-column:Pressure Max kPa(g)');

const explicit = inferPreviewPressureUnit(
  { lineKey: 'P4110001', p1: '5110', p1Source: 'linelist' },
  config,
  { pressureUnit: 'pascal' },
  { pressureUnit: 'BARG' },
);
assert.equal(explicit.unit, 'BARG');
assert.equal(explicit.source, 'design-basis');

const unresolved = inferPreviewPressureUnit(
  { lineKey: 'UNKNOWN', p1: '10', p1Source: 'default' },
  { linelist: { masterRows: [], fieldMap: {} } },
  { pressureUnit: 'pascal' },
  { pressureUnit: 'AUTO' },
);
assert.equal(unresolved.unit, '');
assert.equal(unresolved.source, 'unresolved');

console.log('XML/CII Preview B31.3 pressure-unit custody checks passed.');
