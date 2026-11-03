const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

(async () => {
  const { normalizeBranchesForTopology } = await import(pathToFileURL(path.join(root, 'tabs/model-converters/xml-cii-node-to-inputxml-topology-normalizer.js')).href);

  const valveSplitBranch = {
    branchName: 'PS-TEST',
    nodes: [
      { nodeNumberRaw: '150', nodeNumber: 150, nodeName: 'A', componentType: 'PIPE', componentRefNo: 'A', position: { x: 0, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '160', nodeNumber: 160, nodeName: 'B', componentType: 'PIPE', componentRefNo: 'B', position: { x: 1000, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '167', nodeNumber: 167, nodeName: 'VALVE_SPLIT', componentType: 'RIGID', componentRefNo: 'VALVE-1', position: { x: 1000.2, y: 0.1, z: 0 }, rigid: '2', weight: 12, restraints: [{ sourceType: 'GUI', typeCode: 9 }] },
      { nodeNumberRaw: '170', nodeNumber: 170, nodeName: 'C', componentType: 'PIPE', componentRefNo: 'C', position: { x: 2000, y: 0, z: 0 }, restraints: [] },
    ],
  };
  const valveSplit = normalizeBranchesForTopology([valveSplitBranch], { duplicateNodeCoordinateToleranceMm: 6 });
  const valveRows = valveSplit.branches[0].nodes.filter((row) => Number(row.nodeNumber) > 0);
  assert.deepStrictEqual(valveRows.map((row) => row.nodeNumber), [150, 160, 170], 'duplicate node 167 must be dropped before topology');
  const retained160 = valveRows.find((row) => row.nodeNumber === 160);
  assert.strictEqual(retained160.componentType, 'RIGID', 'dropped node block component type must transfer to retained node');
  assert.strictEqual(retained160.weight, 12, 'dropped node rigid weight must transfer to retained node');
  assert.strictEqual(retained160.restraints.length, 1, 'dropped node restraint evidence must transfer to retained node');
  assert.strictEqual(valveSplit.diagnostics.droppedCount, 1, 'one duplicate coordinate node should be diagnosed');
  assert.strictEqual(valveSplit.diagnostics.rows[0].retainedNode, 160);
  assert.strictEqual(valveSplit.diagnostics.rows[0].droppedNode, 167);

  const chainedShortSegmentBranch = {
    branchName: 'PS-CHAIN',
    nodes: [
      { nodeNumberRaw: '150', nodeNumber: 150, nodeName: 'N150', componentType: 'PIPE', componentRefNo: '150', position: { x: 0, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '159', nodeNumber: 159, nodeName: 'N159', componentType: 'PIPE', componentRefNo: '159', position: { x: 124, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '160', nodeNumber: 160, nodeName: 'N160', componentType: 'PIPE', componentRefNo: '160', position: { x: 127.2, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '167', nodeNumber: 167, nodeName: 'VALVE_SPLIT', componentType: 'RIGID', componentRefNo: 'V167', position: { x: 127.4, y: 0, z: 0 }, rigid: '2', weight: 4, restraints: [] },
      { nodeNumberRaw: '168', nodeNumber: 168, nodeName: 'N168', componentType: 'PIPE', componentRefNo: '168', position: { x: 686.4, y: 0, z: 0 }, restraints: [] },
    ],
  };
  const chained = normalizeBranchesForTopology([chainedShortSegmentBranch]);
  const chainedRows = chained.branches[0].nodes.filter((row) => Number(row.nodeNumber) > 0);
  assert.deepStrictEqual(chainedRows.map((row) => row.nodeNumber), [150, 159, 168], '159 must be retained so route becomes 150-159 and 159-168');
  const retained159 = chainedRows.find((row) => row.nodeNumber === 159);
  assert.strictEqual(retained159.componentType, 'RIGID', 'rigid block evidence from consumed 167 must transfer through 160 into 159');
  assert.strictEqual(retained159.weight, 4, 'rigid weight from consumed 167 must transfer through 160 into 159');
  assert.strictEqual(chained.diagnostics.toleranceMm, 6, 'default duplicate tolerance must be 6mm');
  assert.strictEqual(chained.diagnostics.droppedCount, 2, '160 and 167 must be consumed into retained 159');
  assert.deepStrictEqual(chained.diagnostics.rows.map((row) => row.droppedNode), [160, 167]);

  const crossBranch = normalizeBranchesForTopology([
    {
      branchName: 'B1',
      nodes: [
        { nodeNumberRaw: '150', nodeNumber: 150, nodeName: 'N150', componentType: 'PIPE', componentRefNo: '150', position: { x: 0, y: 0, z: 0 }, restraints: [] },
        { nodeNumberRaw: '159', nodeNumber: 159, nodeName: 'N159', componentType: 'FLAN', componentRefNo: '159', position: { x: 124, y: 0, z: 0 }, restraints: [] },
        { nodeNumberRaw: '160', nodeNumber: 160, nodeName: 'N160', componentType: 'RIGID', componentRefNo: '160', position: { x: 127.2, y: 0, z: 0 }, restraints: [] },
      ],
    },
    {
      branchName: 'B2',
      nodes: [
        { nodeNumberRaw: '160', nodeNumber: 160, nodeName: 'B2-160', componentType: 'RIGID', componentRefNo: 'B2-160', position: { x: 127.2, y: 0, z: 0 }, restraints: [] },
        { nodeNumberRaw: '167', nodeNumber: 167, nodeName: 'B2-167', componentType: 'VALV', componentRefNo: 'B2-167', position: { x: 127.2, y: 0, z: 0 }, restraints: [] },
        { nodeNumberRaw: '168', nodeNumber: 168, nodeName: 'B2-168', componentType: 'VALV', componentRefNo: 'B2-168', position: { x: 686.2, y: 0, z: 0 }, restraints: [] },
      ],
    },
  ]);
  const crossB1Rows = crossBranch.branches[0].nodes.filter((row) => Number(row.nodeNumber) > 0);
  const crossB2Rows = crossBranch.branches[1].nodes.filter((row) => Number(row.nodeNumber) > 0);
  assert.deepStrictEqual(crossB1Rows.map((row) => row.nodeNumber), [150, 159], 'B1 duplicate 160 must collapse into 159');
  assert.deepStrictEqual(crossB2Rows.map((row) => row.nodeNumber), [159, 168], 'B2 branch start 160 must be relabeled to retained 159');
  assert.strictEqual(crossB2Rows[0].collapsedFromNode, 160, 'B2 collapsed start must preserve source node trace');
  assert.strictEqual(crossB2Rows[0].position.x, 127.2, 'B2 collapsed start must keep local geometry for 159->168 length');

  const disabled = normalizeBranchesForTopology([{
    branchName: 'PS-DISABLED',
    nodes: [
      { nodeNumberRaw: '150', nodeNumber: 150, nodeName: 'N150', componentType: 'PIPE', componentRefNo: '150', position: { x: 0, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '159', nodeNumber: 159, nodeName: 'N159', componentType: 'PIPE', componentRefNo: '159', position: { x: 124, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '160', nodeNumber: 160, nodeName: 'N160', componentType: 'PIPE', componentRefNo: '160', position: { x: 127.2, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '167', nodeNumber: 167, nodeName: 'N167', componentType: 'RIGID', componentRefNo: '167', position: { x: 127.4, y: 0, z: 0 }, restraints: [] },
      { nodeNumberRaw: '168', nodeNumber: 168, nodeName: 'N168', componentType: 'PIPE', componentRefNo: '168', position: { x: 686.4, y: 0, z: 0 }, restraints: [] },
    ],
  }], { enableDuplicateCoordinateCoalescing: false });
  const disabledRows = disabled.branches[0].nodes.filter((row) => Number(row.nodeNumber) > 0);
  assert.strictEqual(disabled.diagnostics.enabled, false, 'disabled duplicate coalescing should be reported in diagnostics');
  assert.strictEqual(disabled.diagnostics.droppedCount, 0, 'disabled duplicate coalescing should not drop route nodes');
  assert.deepStrictEqual(disabledRows.map((row) => row.nodeNumber), [150, 159, 160, 167, 168], 'disabled duplicate coalescing should preserve raw route nodes');

  console.log('5C duplicate coordinate node normalizer checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
