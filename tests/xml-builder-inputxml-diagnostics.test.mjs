import assert from 'node:assert/strict';
import {
  createXmlBuilderDiagnostic,
  createXmlBuilderDiagnostics,
  mergeXmlBuilderDiagnosticRecords,
  serializeXmlBuilderDiagnostics,
} from '../converters/xml-cii2019-core/custom-input-diagnostics.js';

const record = createXmlBuilderDiagnostic({
  severity: 'warning',
  code: 'XML_BUILDER_TEST',
  message: 'Test evidence.',
  branch: '/TEST/B1',
});
assert.equal(record.severity, 'WARNING');
assert.equal(record.sourceRow, null, 'omitted source row must remain null');
assert.equal(record.count, null, 'omitted count must remain null');

const diagnostics = createXmlBuilderDiagnostics([record], {
  sourceName: 'test.xml',
  outputReady: false,
});
assert.equal(diagnostics.schema, 'xml-builder-inputxml-diagnostics/v1');
assert.equal(diagnostics.summary.warning, 1);
assert.equal(diagnostics.outputReady, false);
assert.deepEqual(mergeXmlBuilderDiagnosticRecords({ records: [record] }), [record]);
const serialized = JSON.parse(serializeXmlBuilderDiagnostics(diagnostics));
assert.equal(serialized.records[0].sourceRow, null);
assert.equal(serialized.records[0].count, null);

console.log('XML Builder InputXML diagnostics contract checks passed.');
