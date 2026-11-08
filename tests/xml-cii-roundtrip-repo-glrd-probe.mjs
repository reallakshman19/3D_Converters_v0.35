/** Repository GLRD smoke candidate census only. Not Owner GLRD qualification. */
import { readFileSync } from 'node:fs';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { createRoundtripSnapshot } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-snapshot.js';
import { collectRoundtripEngineSourceNodes } from '../tabs/xml-cii-2019-standalone/roundtrip/xml-cii-roundtrip-source-index.js';
Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; }, configurable: true });
installSimpleXmlDom();
const xmlPath = process.argv[2];
const ciiPath = process.argv[3];
if (!xmlPath || !ciiPath) throw new Error('Usage: node script input.xml baseline.cii');
const xml = readFileSync(xmlPath, 'utf8'), cii = readFileSync(ciiPath, 'utf8');
const snapshot = await createRoundtripSnapshot({
  originalXmlText: xml, engineInputText: xml, originalCiiText: cii, supportConfigJson: '{}',
  stagedJsonText: '', sourceName: 'repo-glrd.xml', engineIdentity: 'REPO_PYTHON_SMOKE_ONLY',
  runIdentity: 'REPO_GLDR_SMOKE_ONLY', options: { kgToNewton: true, splitCondensedValveFlange: true },
});
const sourceNodes = collectRoundtripEngineSourceNodes(snapshot);
const inventory = parseFinalCiiRigidInventory(cii);
const refCounts = new Map();
for (const n of sourceNodes) if (n.componentRefNo)
  refCounts.set(n.componentRefNo, (refCounts.get(n.componentRefNo) || 0) + 1);
const candidates = [];
for (const row of inventory.rows) {
  if (row.linkedElements.length !== 1 || row.weight <= 0) continue;
  const edge = row.linkedElements[0];
  const matched = sourceNodes.filter((n) => n.branchName === edge.branchName &&
    n.nodeNumber === edge.toNode && n.fields.Rigid === '2' &&
    n.fields.Weight && Number(n.fields.Weight) > 0 &&
    Number.isFinite(Number(n.fields.Weight)) && n.componentRefNo &&
    refCounts.get(n.componentRefNo) === 1);
  if (matched.length !== 1) continue;
  const source = matched[0];
  if (Math.abs(Number(source.fields.Weight) * 10 - row.weight) > 0.000001) continue;
  candidates.push({
    rigidPointer: row.rigidPointer, elementIndex: edge.index,
    branch: edge.branchName, from: edge.fromNode, to: edge.toNode,
    sourceNodeIdentity: source.sourceNodeIdentity, sourceWeight: source.fields.Weight,
    ciiWeight: row.weight,
  });
}
console.log(JSON.stringify({
  fixture: 'REPOSITORY_GLDR_SMOKE_NOT_OWNER_AUTHENTIC',
  finalElements: inventory.elements.length, rigidCount: inventory.rows.length,
  sourceNodes: sourceNodes.length,
  provisionalUniqueToOwnerCandidates: candidates.length,
  examples: candidates.slice(0, 5),
}, null, 2));
