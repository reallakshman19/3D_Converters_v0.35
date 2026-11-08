/**
 * Synthetic but REAL Python converter vertical slice. This is not authentic
 * GLRD engineering evidence. No mock engine or direct-CII patching is used.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { parseFinalCiiRigidInventory, splitFinalCiiSections } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { createRoundtripSnapshot, roundtripSha256 } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-snapshot.js';
import { collectRoundtripEngineSourceNodes } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-source-index.js';
import { patchRoundtripXmlWeightFields } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-xml-patcher.js';
import { compareRoundtripBytes } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-reextract.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; }, configurable: true });
installSimpleXmlDom();
const script = resolve('converters/scripts/xml_to_cii2019_runtime_custody.py');
const xml = `<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport><RestrainOpenEnds>No</RestrainOpenEnds><Pipe><Branch>
<Branchname>/SYNTHETIC-RT</Branchname>
<Node><NodeNumber>1</NodeNumber><ComponentType>PIPE</ComponentType>
<ComponentRefNo>/PIPE-1</ComponentRefNo><Position>0 0 0</Position>
<OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness>
<Weight>0</Weight></Node>
<Node><NodeNumber>2</NodeNumber><ComponentType>RIGID</ComponentType>
<ComponentRefNo>/RIGID-1</ComponentRefNo><Position>100 0 0</Position>
<OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness>
<Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>15</Weight></Node>
</Branch></Pipe></PipeStressExport>
`;
function runPython(input, output) {
  return execFileSync('python3', [script, '--input', input, '--output', output,
    '--coords-mode', 'first', '--weight-scale', '10', '--support-config-json', '{}',
    '--no-split-condensed-valve-flange'], { encoding: 'utf8' });
}
test('real Python: no edit identical; approved XML 15->2.984 regenerates RIGID 150->29.84 only', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xml-cii-roundtrip-'));
  try {
    const input = join(directory, 'original.xml');
    const baseline = join(directory, 'baseline.cii');
    const replay = join(directory, 'no-edit.cii');
    const revisedXmlPath = join(directory, 'revised.xml');
    const revisedCiiPath = join(directory, 'revised.cii');
    writeFileSync(input, xml);
    runPython(input, baseline);
    runPython(input, replay);
    const originalCiiText = readFileSync(baseline, 'utf8');
    const replayCiiText = readFileSync(replay, 'utf8');
    const parity = compareRoundtripBytes(originalCiiText, replayCiiText);
    assert.equal(parity.byteDifferences, 0);
    assert.equal(await roundtripSha256(originalCiiText), await roundtripSha256(replayCiiText));
    const snapshot = await createRoundtripSnapshot({
      originalXmlText: xml, engineInputText: xml, originalCiiText,
      supportConfigJson: '{}', stagedJsonText: '',
      sourceName: 'synthetic-roundtrip.xml', runIdentity: 'SYNTHETIC_REAL_PYTHON',
      engineIdentity: 'CI_PINNED_PYTHON_RUNTIME_CUSTODY_NOT_BROWSER',
      options: { kgToNewton: true, splitCondensedValveFlange: false, coordsMode: 'first' },
    });
    const original = parseFinalCiiRigidInventory(originalCiiText);
    assert.equal(original.elements.length, 1);
    assert.equal(original.rows.length, 1);
    assert.equal(original.rows[0].weight, 150);
    const nodes = collectRoundtripEngineSourceNodes(snapshot);
    assert.equal(nodes.length, 2);
    assert.equal(nodes[1].fields.Weight, '15');
    const patch = await patchRoundtripXmlWeightFields(snapshot, [{
      propertyId: 'RIGID.weight', sourceNodeIdentity: nodes[1].sourceNodeIdentity,
      originalToken: '15', newSourceValue: '2.984', approved: true,
    }], nodes);
    assert.equal(patch.revisedXmlText, xml.replace('<Weight>15</Weight>', '<Weight>2.984</Weight>'));
    writeFileSync(revisedXmlPath, patch.revisedXmlText);
    runPython(revisedXmlPath, revisedCiiPath);
    const outputCiiText = readFileSync(revisedCiiPath, 'utf8');
    const output = parseFinalCiiRigidInventory(outputCiiText);
    assert.equal(output.rows.length, 1);
    assert.equal(output.rows[0].weight, 29.84);
    assert.deepEqual(output.rows[0].linkedElements.map((e) => [e.fromNode, e.toNode]),
      original.rows[0].linkedElements.map((e) => [e.fromNode, e.toNode]));
    const originalSections = splitFinalCiiSections(originalCiiText);
    const revisedSections = splitFinalCiiSections(outputCiiText);
    assert.deepEqual([...revisedSections.keys()], [...originalSections.keys()]);
    for (const [section, lines] of originalSections) {
      if (section === 'RIGID') continue;
      assert.deepEqual(revisedSections.get(section), lines, 'Unexpected ' + section + ' change');
    }
    console.log(JSON.stringify({
      scope: 'SYNTHETIC_REAL_PYTHON_NOT_AUTHENTIC_GLRD',
      realConverter: 'xml_to_cii2019_runtime_custody.py', elements: output.elements.length,
      weightBefore: original.rows[0].weight, weightAfter: output.rows[0].weight,
      originalCiiSha256: await roundtripSha256(originalCiiText),
      revisedCiiSha256: await roundtripSha256(outputCiiText),
      noEditByteDifferences: parity.byteDifferences,
      unexplainedEngineeringSectionDifferences: 0,
      sourcePatchOnly: true, directCiiPatching: false,
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
