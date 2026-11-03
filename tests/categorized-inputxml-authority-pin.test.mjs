import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(ROOT, 'xml-compare', 'CategorizedInputXmlConverter.pin.json');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const trackedCheckout = execFileSync('git', ['-C', ROOT, 'ls-files', '--stage', 'XML_Compare_Utilities'], { encoding: 'utf8' }).trim();
assert.equal(trackedCheckout, '', 'temporary XML_Compare_Utilities checkout must never be committed');

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
assert.equal(manifest.schema, 'categorized-inputxml-authority-pin/v1');
assert.equal(manifest.sourceRepository, 'reallaksh19/XML_Compare_Utilities');
assert.equal(manifest.sourceCommit, 'dd7e62c2dc879d0ac4916303f9c41ff863b50cbc');
assert.equal(manifest.mode, 'exact-vendored-authority');
assert.equal(manifest.files.length, 3);

for (const record of manifest.files) {
  const bytes = await readFile(join(ROOT, record.path));
  assert.equal(sha256(bytes), record.sha256, `pinned hash mismatch: ${record.path}`);
}

const converter = await import(pathToFileURL(join(ROOT, 'xml-compare', 'CategorizedInputXmlConverter.js')).href);
const coordinates = await import(pathToFileURL(join(ROOT, 'xml-compare', 'XmlCompareCoordinateSideload.js')).href);
assert.equal(converter.CATEGORIZED_INPUTXML_CONVERTER_SCHEMA, 'categorized-inputxml-converter/v7');
assert.equal(coordinates.XML_COMPARE_COORDINATE_SIDELOAD_SCHEMA, 'xml-compare-coordinate-sideload/v1');

const inputXml = `<?xml version="1.0"?>
<CAESARII XML_TYPE="Input">
<PIPINGMODEL>
<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" LINE_ID="L-100" DELTA_X="100" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" />
</PIPINGMODEL>
</CAESARII>`;
const categorized = converter.inputXmlToCategorizedInputXml(inputXml, { sourceName: 'authority-pin-test.input.xml' });

assert.match(categorized, /<CategorizedInputXML schema="categorized-inputxml\/v3"/);
assert.match(categorized, /<DerivedCoordinateBlock>/);
assert.match(categorized, /<FROM_GLOBAL_X>0\.000<\/FROM_GLOBAL_X>/);
assert.match(categorized, /<TO_GLOBAL_X>100\.000<\/TO_GLOBAL_X>/);
assert.match(categorized, /<GLOBAL_COORD_BASIS_NODE>10<\/GLOBAL_COORD_BASIS_NODE>/);
assert.match(categorized, /<OriginalElement><!\[CDATA\[/);

console.log('CategorizedInputXML pinned authority regression passed.');
