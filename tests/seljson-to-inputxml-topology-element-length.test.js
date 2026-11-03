const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function importFrom(relPath) {
  return import(pathToFileURL(path.join(root, relPath)).href);
}

function legacyXmlFixture() {
  return `<Root><Branch><Branchname>/L1</Branchname>
    <Node><NodeNumber>10</NodeNumber><NodeName>10</NodeName><Endpoint>1</Endpoint><ComponentType>ATTA</ComponentType><ComponentRefNo>REF-A</ComponentRefNo><Position>0 0 0</Position><ElementLengthMm></ElementLengthMm><Restraint><Type>REST</Type></Restraint></Node>
    <Node><NodeNumber>20</NodeNumber><NodeName>20</NodeName><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType><ComponentRefNo>REF-B</ComponentRefNo><Position>0 0 1000</Position><ElementLengthMm></ElementLengthMm></Node>
  </Branch></Root>`;
}

function seljsonXmlFixture() {
  return `<Root><Branch><Branchname>/L1</Branchname>
    <Node><NodeNumber>10</NodeNumber><NodeName>10</NodeName><Endpoint>1</Endpoint><ComponentType>SUPPORT</ComponentType><ComponentRefNo>REF-A</ComponentRefNo><Position>0 0 0</Position><ElementLengthMm></ElementLengthMm><CustomRestraint><Type>REST</Type></CustomRestraint></Node>
    <Node><NodeNumber>20</NodeNumber><NodeName>20</NodeName><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType><ComponentRefNo>REF-B</ComponentRefNo><Position>0 0 1000</Position><ElementLengthMm></ElementLengthMm></Node>
  </Branch></Root>`;
}

(async () => {
  const lengthModule = await importFrom('converters/xml-cii2019-core/topology/xml-cii-topology-element-length.js');
  const auditModule = await importFrom('converters/xml-cii2019-core/topology/xml-cii-topology-disconnect-audit.js');

  // Regression: default options must keep recognizing ATTA + <Restraint> exactly as before.
  {
    const legacy = legacyXmlFixture();
    const result = lengthModule.collectXmlCiiTopologyElementLengthAssignments(legacy);
    const supportSkip = result.skipped.find((row) => row.nodeNumber === '10');
    assert(supportSkip, 'ATTA node with <Restraint> must still be recognized as a support-restraint role by default');
    assert.strictEqual(supportSkip.reason, 'support-restraint-no-element-length');
    const pipeAssignment = result.assignments.find((row) => row.nodeNumber === '20');
    assert(pipeAssignment, 'downstream PIPE node should still receive a route-anchor length by default');
    assert.strictEqual(pipeAssignment.lengthMm, 1000);

    const audit = auditModule.buildXmlCiiTopologyDisconnectAudit(legacy);
    assert(audit.rows.length > 0, 'disconnect audit should still produce rows by default');
  }

  // Without the new options, seljson's SUPPORT/CustomRestraint vocabulary is NOT recognized as a support role.
  {
    const seljson = seljsonXmlFixture();
    const result = lengthModule.collectXmlCiiTopologyElementLengthAssignments(seljson);
    const supportSkip = result.skipped.find((row) => row.nodeNumber === '10');
    assert(supportSkip, 'unrecognized SUPPORT node should still be skipped (no previous route point), but for the wrong reason');
    assert.notStrictEqual(supportSkip.reason, 'support-restraint-no-element-length', 'without options, SUPPORT is not classified as support-restraint');
  }

  // With supportComponentTypes/restraintTagNames, SUPPORT + <CustomRestraint> is recognized like ATTA + <Restraint>.
  {
    const seljson = seljsonXmlFixture();
    const options = { supportComponentTypes: ['ATTA', 'SUPPORT'], restraintTagNames: ['Restraint', 'CustomRestraint'] };
    const result = lengthModule.collectXmlCiiTopologyElementLengthAssignments(seljson, options);
    const supportSkip = result.skipped.find((row) => row.nodeNumber === '10');
    assert(supportSkip, 'SUPPORT + <CustomRestraint> should be recognized as support-restraint with the new options');
    assert.strictEqual(supportSkip.reason, 'support-restraint-no-element-length');
    const pipeAssignment = result.assignments.find((row) => row.nodeNumber === '20');
    assert(pipeAssignment, 'downstream PIPE node should still receive a route-anchor length');
    assert.strictEqual(pipeAssignment.lengthMm, 1000);

    const applied = lengthModule.applyXmlCiiTopologyElementLengths(seljson, options);
    const nodeBlocks = applied.xmlText.match(/<Node\b[\s\S]*?<\/Node>/gi) || [];
    const supportBlock = nodeBlocks.find((block) => block.includes('<NodeNumber>10</NodeNumber>'));
    const pipeBlock = nodeBlocks.find((block) => block.includes('<NodeNumber>20</NodeNumber>'));
    assert(!/<ElementLengthMm>\d/.test(supportBlock), 'support node must not receive an ElementLengthMm value');
    assert(/<ElementLengthMm>1000\.000<\/ElementLengthMm>/.test(pipeBlock), 'downstream node should have the topology-derived length written');

    const audit = auditModule.buildXmlCiiTopologyDisconnectAudit(seljson, options);
    assert(audit.rows.length > 0, 'disconnect audit should produce rows with the new options too');
  }

  // Full seljson-to-inputxml pipeline wiring: model -> XML -> topology element lengths -> disconnect audit.
  {
    const { buildCustomInputModel } = await importFrom('converters/xml-cii2019-core/custom-input-model.js');
    const { buildCustomInputXml } = await importFrom('converters/xml-cii2019-core/custom-input-xml-builder.js');

    const model = buildCustomInputModel({
      branchRows: [{ branchName: '/L1/B1', nodeNumber: '10' }, { branchName: '/L1/B1', nodeNumber: '20' }],
      coordinateRows: [{ branchName: '/L1/B1', nodeNumber: '10', pos: '0 0 0' }, { branchName: '/L1/B1', nodeNumber: '20', pos: '0 0 1000' }],
      weightRows: [
        { branchName: '/L1/B1', nodeNumber: '10', componentType: 'SUPPORT', componentRefNo: 'REF-A' },
        { branchName: '/L1/B1', nodeNumber: '20', componentType: 'PIPE', componentRefNo: 'REF-B' },
      ],
      restraintRows: [{ branchName: '/L1/B1', nodeNumber: '10', restraintType: 'REST' }],
    });

    const xmlText = buildCustomInputXml(model, { dropShortElementLengthNodes: false });
    const options = { supportComponentTypes: ['ATTA', 'SUPPORT'], restraintTagNames: ['Restraint', 'CustomRestraint'] };

    const shadow = lengthModule.collectXmlCiiTopologyElementLengthAssignments(xmlText, { ...options, mode: 'shadow' });
    assert(shadow.assignments.length >= 1, 'shadow mode should compute topology assignments without mutating output');

    const applied = lengthModule.applyXmlCiiTopologyElementLengths(xmlText, { ...options, mode: 'apply' });
    assert(applied.changed >= 1, 'apply mode should rewrite at least one ElementLengthMm value from the topology assignment');

    const audit = auditModule.buildXmlCiiTopologyDisconnectAudit(applied.xmlText, options);
    assert.strictEqual(typeof audit.stats.topologyDisconnectedRows, 'number', 'audit stats should report a disconnected-row count');
  }

  console.log('seljson-to-inputxml topology element-length integration checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
