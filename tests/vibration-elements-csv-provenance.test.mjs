import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_TABLE_EXCHANGE_SHEETS,
} from '../converters/vibration/exchange/schema.js';
import { parseVibrationTableExchangeCsv } from '../converters/vibration/exchange/parse-csv.js';

const row = [
  'P-1', 'PIPE', 'L-1', '', '', 273, 273, 1000, '40', 'CS', 'PC-1', '300',
  'CATALOGUE', 'CERTIFIED', 'CID-1',
];

function elementsCsv() {
  return `${VIBRATION_TABLE_EXCHANGE_SHEETS.Elements.join(',')}\r\n${row.join(',')}\r\n`;
}

test('header-compatible Elements CSV never self-certifies as Advanced_Analysis 3D EDIT', () => {
  const exchange = parseVibrationTableExchangeCsv(elementsCsv(), { sourceFileName: 'working-elements.csv' });
  assert.equal(exchange.sourceSystem, 'UNVERIFIED_ELEMENTS_CSV');
  assert.equal(exchange.completeExchange, false);
  assert.equal(exchange.integrityStatus, 'LIMITED_ELEMENTS_ONLY');
  assert.equal(exchange.authority.sourceAuthority, null);
  assert.equal(exchange.authority.sourceExportHash, null);
  assert(exchange.warnings.some((warning) => warning.code === 'UNVERIFIED_ELEMENTS_CSV_SOURCE'));
  assert.doesNotMatch(exchange.sourceSystem, /Advanced_Analysis\.3D_EDIT/u);
});

test('Elements CSV source filename is retained as evidence without becoming source authority', () => {
  const exchange = parseVibrationTableExchangeCsv(elementsCsv(), { sourceFileName: 'model.edited-elements.csv' });
  assert.equal(exchange.sourceFileName, 'model.edited-elements.csv');
  assert.equal(exchange.sourceSystem, 'UNVERIFIED_ELEMENTS_CSV');
  assert.equal(exchange.sourceSchema, null);
});
