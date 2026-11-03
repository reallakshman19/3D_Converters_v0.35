import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pin = JSON.parse(await readFile(new URL('../contracts/xml-builder-producer-conformance/v1/pin.json', import.meta.url), 'utf8'));
const script = await readFile(new URL('../scripts/xml-builder-producer-shadow-conformance.mjs', import.meta.url), 'utf8');

assert.equal(pin.schema, 'xml-builder-producer-conformance-pin/v1');
assert.equal(pin.mode, 'shadow-only');
assert.equal(pin.sourceRepository, 'reallaksh19/XML_Compare_Utilities');
assert.equal(pin.sourceCommit, 'dd7e62c2dc879d0ac4916303f9c41ff863b50cbc');
assert.equal(pin.serviceEntrypoint, 'xml-compare/inputxml-producer-api/index.js');
assert.equal(pin.operation, 'producer.categorizeInputXml');
assert.equal(pin.localAuthorityManifest, 'xml-compare/CategorizedInputXmlConverter.pin.json');
assert.equal(pin.requiredLocalAuthorityCommit, pin.sourceCommit);
assert.equal(pin.switchAuthorized, false);
assert.equal(pin.producer.id, 'xml-builder');
assert.equal(pin.producer.module, 'tabs/xml-builder-tab.js');
assert.equal(pin.producer.artifactRole, 'generated-inputxml');

for (const path of [
  'tabs/xml-builder-tab.js',
  'converters/xml-cii2019-core/custom-input-api.js',
  'tabs/model-converters/xml-cii-node-to-inputxml-core.js',
  'xml-compare/CategorizedInputXmlConverter.js',
  'xml-compare/CategorizedInputXmlConverter.pin.json',
]) {
  assert(pin.protectedAuthorities.includes(path), `protected authority missing: ${path}`);
}

assert.match(script, /buildXmlCiiCustomInputXml/);
assert.match(script, /buildInputXmlFromNodeXml/);
assert.match(script, /createInputXmlProducerService/);
assert.match(script, /XmlCompareCoordinateSideload\.js/);
assert.match(script, /XmlCompareCoordinateDiagnostics\.js/);
assert.match(script, /readLocalAuthorityPin/);
assert.match(script, /localAuthorityPinned/);
assert.match(script, /localUpstreamByteParity/);
assert.match(script, /sourceFingerprintBound/);
assert.match(script, /categorizedElementCount/);
assert.match(script, /productionSwitchAuthorized: pin\.switchAuthorized/);
assert.match(script, /UPSTREAM_COMMIT_MISMATCH/);
assert.match(script, /LOCAL_AUTHORITY_PIN_MISMATCH/);
assert.match(script, /SHADOW_CONFORMANCE_BLOCKED/);
assert.doesNotMatch(script, /fetch\s*\(/);
assert.doesNotMatch(script, /tabs\/xml-builder-tab\.js['"]\s*,\s*['"]w/);

console.log('XML Builder producer shadow conformance static gate passed.');
