import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeXmlCiiPipingClassMasterRow } from '../converters/xml-cii2019-core/nps-bore-resolver.js';

test('legacy convertedBore copied from NPS is remapped through the NPS master', () => {
  const row = normalizeXmlCiiPipingClassMasterRow({
    pipingClass: '93842',
    convertedBore: 20,
    _raw: { NPS: 20 },
  });
  assert.equal(row.nps, '20');
  assert.equal(row.convertedBore, 500);
  assert.equal(row.boreMm, 500);
  assert.equal(row.boreSource, 'legacy-nps-remapped');
});

test('an explicit Bore mm column remains authoritative over NPS', () => {
  const row = normalizeXmlCiiPipingClassMasterRow({
    pipingClass: '93842',
    convertedBore: 20,
    'Bore (mm)': 500,
    NPS: 20,
  });
  assert.equal(row.convertedBore, 500);
  assert.equal(row.boreSource, 'master-bore-mm');
});
