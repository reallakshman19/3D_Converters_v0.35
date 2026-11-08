/**
 * Deterministic *synthetic* R1 source-mapping / reference-planning scale.
 * Not a substitute for the authenticated GLRD 433/144 engineering replay.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { installSimpleXmlDom, _test } from './helpers/simple-xml-dom.mjs';
import { buildFinalRigidSourceContexts } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-source-context.js';
import { buildFinalRigidReferencePlans } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-master-references.js';

Object.defineProperty(_test.SimpleElement.prototype, 'nodeType', { get() { return 1; }, configurable: true });
Object.defineProperty(_test.SimpleElement.prototype, 'childNodes', { get() { return this.children; }, configurable: true });
installSimpleXmlDom();
const config = JSON.stringify({ weight: { masterRows: [{ id: 'SYNTHETIC-NO-CANDIDATE' }] } });
function fixture(elements, rigids) {
  const targets = new Set(Array.from({ length: rigids }, (_, i) => Math.floor((i + 1) * elements / rigids)));
  const xmlNodes = new Array(elements);
  const issues = [], reviewRows = [];
  for (let number = 1; number <= elements; number += 1) {
    const isRigid = targets.has(number), comp = '/C' + number;
    xmlNodes[number - 1] = '<Node><NodeNumber>' + number +
      '</NodeNumber><Position>' + (number * 100) + ' 0 0</Position>' +
      '<ComponentType>' + (isRigid ? 'RIGID' : 'PIPE') + '</ComponentType>' +
      (isRigid ? '<Rigid>2</Rigid><ComponentRefNo>' + comp +
        '</ComponentRefNo><BoreMm>100</BoreMm><Rating>300</Rating><Endpoint>2</Endpoint>' : '') +
      '</Node>';
    if (isRigid) {
      issues.push({ branchName: '/S', nodeNumber: String(number), componentRefNo: comp,
        boreMm: 100, rating: '300', lengthMm: 100, candidates: [] });
      reviewRows.push({ rigidPointer: reviewRows.length + 1, weight: 0, rawWeight: '0',
        linkedElements: [{ index: number - 1, branchName: '/S', fromNode: String(number - 1),
          toNode: String(number), lengthMm: 100 }] });
    }
  }
  return {
    inventory: { rows: reviewRows },
    evidence: { sourceKind: 'xml',
      engineInputText: '<Root><Branch><Branchname>/S</Branchname>' + xmlNodes.join('') + '</Branch></Root>',
      engineInputDigest: 'sha256:synthetic-scale-' + elements,
      stagedJsonText: '', supportConfigJson: config, weightScale: 10 },
    authorities: {
      collectWeightRows: () => issues,
      forwardLengths: (nodes) => nodes.map((_, i) => i ? 100 : null),
    },
  };
}
for (const [elements, rigids] of [[20,10], [433,144], [5000,2000], [50000,10000]]) {
  test('source metadata and reference scaling ' + elements + ' ELEMENTS / ' + rigids + ' RIGID',
    { timeout: 180000 }, () => {
      const { inventory, evidence, authorities } = fixture(elements, rigids);
      const start = performance.now();
      const contexts = buildFinalRigidSourceContexts(inventory, evidence, authorities);
      const sourceMs = performance.now() - start;
      assert.equal(contexts.length, rigids);
      assert.equal(contexts.filter((x) => x.status === 'VERIFIED').length, rigids);
      assert.equal(contexts.filter((x) => x.bore.value === 100 && x.rating.value === '300').length, rigids);
      const startPlan = performance.now();
      const references = buildFinalRigidReferencePlans(inventory, evidence, authorities);
      const referenceMs = performance.now() - startPlan;
      assert.equal(references.length, rigids);
      assert.equal(references.filter((x) => x.sourceContext?.status === 'VERIFIED').length, rigids);
      assert.equal(references.filter((x) => x.autoIndex === -1).length, rigids,
        'synthetic master without qualified rows must never auto-fill reference');
      console.log('SYNTHETIC mapping scale', JSON.stringify({
        elements, rigids, sourceMs: Math.round(sourceMs), referenceMs: Math.round(referenceMs),
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
        verified: rigids, unresolved: 0,
      }));
    });
}
