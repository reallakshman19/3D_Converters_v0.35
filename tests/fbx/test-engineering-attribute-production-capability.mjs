import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [core, conversion, specs, reader, ledger] = await Promise.all([
  read('tabs/model-converters/converters/fbx/conversion-core.js'),
  read('tabs/model-converters/converters/fbx/conversion.js'),
  read('tabs/model-converters/converters/fbx/engineering-attributes/field-specs.js'),
  read('tabs/model-converters/converters/fbx/engineering-attributes/publication-reader.js'),
  read('tabs/model-converters/converters/fbx/engineering-attributes/ledger.js'),
]);

assert.match(core, /buildEngineeringAttributeLedger/);
assert.match(core, /assertEngineeringAttributePublication/);
assert.match(core, /FbxEngineeringAttributeLedger\.v1\.json/);
assert.match(core, /ENGINEERING_ATTRIBUTES_PASS/);
assert.match(core, /BLOCKED_ENGINEERING_ATTRIBUTES/);
assert.match(conversion, /attachEngineeringAttributeLedger/);
assert.equal((conversion.match(/execution\.entries, execution\.staged/g) || []).length, 3);
assert.match(specs, /fieldAuthority: 'APPROVED_MAPPING'/);
assert.match(specs, /generatedComponentPolicy: 'NO_ENGINEERING_INHERITANCE'/);
assert.match(reader, /STAGED_COMPONENT_MISSING/);
assert.match(ledger, /generatedComponentsInheritEngineeringValues: false/);
assert.match(ledger, /optionalUnresolvedValuesDefaulted: false/);
assert.doesNotMatch([specs, reader, ledger].join('\n'), /Math\.random|Date\.now|localeCompare|export\s+default/);
for (const [name, source] of Object.entries({ specs, reader, ledger })) {
  assert.ok(source.split('\n').length - 1 < 300, `${name} exceeds 300 lines`);
}
console.log('PASS test-engineering-attribute-production-capability');
