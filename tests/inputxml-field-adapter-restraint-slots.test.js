const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

(async () => {
  const adapter = await import(pathToFileURL(path.join(root, 'converters/inputxml-field-adapter.js')).href);
  const source = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL><PIPINGELEMENT FROM_NODE="10" TO_NODE="20">
    <RESTRAINT NUM="1" NODE="20" TYPE="17"/>
    <RESTRAINT NUM="2" NODE="20" TYPE="9"/>
    <RESTRAINT NUM="3" NODE="20" TYPE="8"/>
    <RESTRAINT NUM="4" NODE="20" TYPE="14"/>
    <RESTRAINT NUM="5" NODE="20" TYPE="15"/>
    <RESTRAINT NUM="6" NODE="20" TYPE="16"/>
    <RESTRAINT NUM="7" NODE="20" TYPE="18"/>
  </PIPINGELEMENT><PIPINGELEMENT FROM_NODE="20" TO_NODE="30">
    <RESTRAINT NUM="7" NODE="30" TYPE="9"/>
    <RESTRAINT NODE="30" TYPE="17"/>
  </PIPINGELEMENT></PIPINGMODEL></CAESARII>`;

  assert.throws(
    () => adapter.normalizeInputXmlAttributeNames(source),
    (error) => error instanceof adapter.InputXmlRestraintOverflowError
      && error.code === 'INPUTXML_RESTRAINT_OVERFLOW'
      && error.elementIdentity === 'PIPINGELEMENT 10->20'
      && error.observedCount === 7
      && error.allowedCount === 6
      && /approved semantic split/.test(error.remediation),
    'seven restraints must block before any InputXML is returned',
  );

  const sparseSource = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL><PIPINGELEMENT FROM_NODE="20" TO_NODE="30">
    <RESTRAINT NUM="7" NODE="30" TYPE="9"/>
    <RESTRAINT NODE="30" TYPE="17"/>
  </PIPINGELEMENT></PIPINGMODEL></CAESARII>`;
  const result = adapter.normalizeInputXmlAttributeNames(sparseSource);
  assert.strictEqual((result.xmlText.match(/<RESTRAINT\b/g) || []).length, 2, 'normalization must preserve every restraint');
  assert(result.xmlText.includes('<PIPINGELEMENT FROM_NODE="20" TO_NODE="30">\n    <RESTRAINT NUM="1" NODE="30" TYPE="9"/>'), 'overflow slot on sparse element should be renumbered into first free slot');
  assert(result.xmlText.includes('<RESTRAINT NODE="30" TYPE="17" NUM="2"/>'), 'missing slot should be assigned the next free slot');
  assert.strictEqual(result.changes.some((line) => line.includes('dropped')), false, 'normalization must never report or perform deletion');
  console.log('InputXML field adapter restraint slot normalization checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
