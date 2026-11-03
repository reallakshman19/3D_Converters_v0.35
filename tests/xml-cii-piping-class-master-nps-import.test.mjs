import assert from 'node:assert/strict';
import test from 'node:test';

import { MASTER_FIELDS } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-fields-config.js';
import { fuzzyAutoMapFields } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-fuzzy-mapper.js';

test('piping class import preserves NPS and derives a dedicated Bore mm column', () => {
  const rows = [{ Class: '93842', Size: '20', Rating: '900', 'Wall Thickness': '20.6248' }];
  const map = fuzzyAutoMapFields(
    ['Class', 'Size', 'Rating', 'Wall Thickness'],
    MASTER_FIELDS.pipingClass.fields,
    rows,
  );
  assert.equal(map.pipingClass, 'Class');
  assert.equal(map.nps, 'Size');
  assert.equal(map.convertedBore, 'Bore (mm)');
  assert.equal(rows[0]['NPS (in)'], '20');
  assert.equal(rows[0]['Bore (mm)'], 500);
});

test('explicit Bore mm is retained and not converted as NPS', () => {
  const rows = [{ 'Piping Class': '93842', NPS: '20', 'Bore (mm)': '500' }];
  const map = fuzzyAutoMapFields(
    ['Piping Class', 'NPS', 'Bore (mm)'],
    MASTER_FIELDS.pipingClass.fields,
    rows,
  );
  assert.equal(map.nps, 'NPS');
  assert.equal(map.convertedBore, 'Bore (mm)');
  assert.equal(rows[0]['Bore (mm)'], 500);
});
