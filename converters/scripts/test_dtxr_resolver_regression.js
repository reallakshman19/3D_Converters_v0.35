import { strict as assert } from 'assert';
import { resolveDtxrForXmlNode, buildStagedDtxrIndex } from '../xml-cii2019-core/dtxr-resolver.js';

// Mock getXmlNodeProperty logic since we use raw JS objects for tests
global.getXmlNodeProperty = (node, name) => {
  return node[name] || '';
};

// Mock supportTagsFromAttrs
global.supportTagsFromAttrs = () => [];
global.xmlNodeSupportTags = () => [];
global.normalizeSupportTag = (v) => String(v).toUpperCase();
global.xmlAncestorBranchName = (node) => node.BranchName || '';
global.normalizePoint = (p) => {
  if (!p) return null;
  const match = String(p).match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (match) return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  return null;
};

const stagedEvidence = [
  // XML Node 1020 evidence
  { name: 'REST', attributes: { OWNER: '/LINE', POS: '1000 2000 3000', DTXR_POS: 'REST' } },
  
  // XML Node 1030 evidence: 2 items within 6mm (0mm and 3mm distance)
  { name: 'PDO-TYPE', attributes: { OWNER: '/LINE/B3', POS: '563136.11 -1125469.20 99707.60', DTXR_POS: 'GUIDE' } },
  { name: 'PS02214.1', attributes: { OWNER: '/LINE/B3', POS: '563139.11 -1125469.20 99707.60', DTXR_POS: 'REST', NAME: 'PS02214.1' } },
  
  // Far away evidence (should not be grouped with 1030)
  { name: 'PS_FAR', attributes: { OWNER: '/LINE/B3', POS: '563150.11 -1125469.20 99707.60', DTXR_POS: 'STOP' } },

  // Unrelated branch evidence (identical coordinates to 1030, but different line)
  { name: 'WRONG', attributes: { OWNER: '/UNRELATED-LINE/B1', POS: '563136.11 -1125469.20 99707.60', DTXR_POS: 'ANCHOR' } }
];

const stagedIndex = buildStagedDtxrIndex(stagedEvidence);

function runTests() {
  console.log('Running DTXR Resolver Regression Tests...');

  const mockBranch1020 = { nodeType: 1, nodeName: 'Branch', childNodes: [{ nodeType: 1, nodeName: 'Branchname', textContent: '/LINE' }] };
  const node1020 = {
    NodeNumber: '1020',
    NodeName: 'REST',
    ComponentType: 'REST',
    Position: '1000 2000 3000',
    parentNode: mockBranch1020
  };
  
  const res1020 = resolveDtxrForXmlNode({ xmlNode: node1020, context: stagedIndex, purpose: 'support-restraint', config: { coordinateToleranceMm: 6.0 } });
  console.log('res1020:', JSON.stringify(res1020, null, 2));
  
  assert.equal(res1020.dtxrPosValue, 'REST', '1020: DTXR_POS should be REST');
  assert.equal(res1020.dtxrPsValue, 'REST', '1020: DTXR_PS should be REST');
  assert.equal(res1020.branchRelationship, 'same-root', '1020: Should match branch');
  console.log('✅ Test 1 Passed: XML node 1020 matches own coordinate group');

  // Test 2: XML node 1030 aggregates GUIDE and REST, filters by NodeName
  const mockBranch1030 = { nodeType: 1, nodeName: 'Branch', childNodes: [{ nodeType: 1, nodeName: 'Branchname', textContent: '/LINE' }] };
  const node1030 = {
    NodeNumber: '1030',
    NodeName: 'PS02214.1',
    ComponentType: 'REST',
    Position: '563136.11 -1125469.20 99707.60',
    parentNode: mockBranch1030
  };

  const res1030 = resolveDtxrForXmlNode({ xmlNode: node1030, context: stagedIndex, purpose: 'support-restraint', config: { coordinateToleranceMm: 6.0 } });
  
  assert.equal(res1030.dtxrPosValue, 'GUIDE+REST', '1030: Should aggregate GUIDE and REST within 6mm');
  assert.equal(res1030.dtxrPsName, 'PS02214.1', '1030: Should match NodeName PS02214.1');
  assert.equal(res1030.dtxrPsValue, 'REST', '1030: Should derive REST as DTXR_PS from the matched row');
  assert.equal(res1030.positionDistanceMm, 0, '1030: Nearest distance should be 0');
  assert.equal(Math.round(res1030.maxInternalDistanceMm), 3, '1030: Internal group distance should be 3mm');
  assert.equal(res1030.status, 'RESOLVED_POS_PS', '1030: Status should be fully resolved');
  console.log('✅ Test 2 Passed: XML node 1030 aggregates evidence within 6mm and resolves NodeName fallback');

  // Test 3: Unrelated roots are rejected
  // Notice the result doesn't contain 'ANCHOR' even though UNRELATED-LINE has the exact same coordinate
  assert.ok(!res1030.dtxrPosValue.includes('ANCHOR'), '1030: Unrelated branch should be rejected despite same coordinate');
  console.log('✅ Test 3 Passed: Unrelated branch roots are strictly rejected');

  // Test 4: Evidence > tolerance is rejected
  assert.ok(!res1030.dtxrPosValue.includes('STOP'), '1030: Evidence > 6mm away should be rejected');
  console.log('✅ Test 4 Passed: Evidence outside tolerance is not grouped');

  // Test 5: Only one record produced
  assert.equal(typeof res1030, 'object');
  assert.ok(!Array.isArray(res1030));
  console.log('✅ Test 5 Passed: One authoritative record produced per XML node');

  console.log('All regressions passed!');
}

runTests();
