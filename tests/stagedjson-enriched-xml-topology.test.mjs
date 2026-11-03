import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(repoRoot, 'tabs', 'stagedjson-to-enrichxml');
const tempRoot = mkdtempSync(join(tmpdir(), 'stagedjson-xml-topology-'));
writeFileSync(join(tempRoot, 'package.json'), '{"type":"module"}\n');

for (const file of [
  'sj-branch-identity.js',
  'sj-enrichment-authority.js',
  'sj-enrichment-engine.js',
  'sj-node-contract.js',
  'sj-parser.js',
  'sj-point-resolver.js',
  'sj-psi-sequence-planner.js',
  'sj-rating-resolver.js',
  'sj-sequential-writer-shadow.js',
  'sj-wall-resolver.js',
  'sj-corrosion-resolver.js',
  'sj-weight-resolver.js',
  'sj-weight-db.js',
  'sj-audit.js',
  'sj-restraint-resolver.js',
  'sj-type-mapper.js',
  'sj-xml-writer-parity.js',
  'sj-xml-writer.js',
]) {
  copyFileSync(join(sourceRoot, file), join(tempRoot, file));
}

const parser = await import(pathToFileURL(join(tempRoot, 'sj-parser.js')).href);
const contract = await import(pathToFileURL(join(tempRoot, 'sj-node-contract.js')).href);
const authority = await import(pathToFileURL(join(tempRoot, 'sj-enrichment-authority.js')).href);
const writer = await import(pathToFileURL(join(tempRoot, 'sj-xml-writer.js')).href);
const engine = await import(pathToFileURL(join(tempRoot, 'sj-enrichment-engine.js')).href);

test.after(() => rmSync(tempRoot, { recursive: true, force: true }));

const rootBranch = '/ASIM-1885-10"-S8810101-91261M7-HC-01';

function fittingRecord(overrides = {}) {
  return {
    name: '',
    componentType: 'PIPE',
    ref: '',
    dtxr: '',
    boreMm: 250,
    insuMm: 999,
    anglDeg: null,
    attrs: {
      APOS: { x: 1, y: 2, z: 3 },
      LPOS: { x: 4, y: 5, z: 6 },
    },
    enrichedAttributes: {
      nominalBoreMm: 250,
      pipeOdMm: 273,
      wallThicknessMm: 9.27,
      corrosionAllowanceMm: 1.5,
      insulationThicknessMm: 120,
    },
    resolved: {
      odMm: 999,
      wallMm: 998,
      corrMm: 997,
      weightKg: 996,
    },
    sourceWeightKg: 0,
    ...overrides,
  };
}

function blockForRef(xml, ref) {
  const blocks = xml.match(/<Node>[\s\S]*?<\/Node>/g) || [];
  const matches = blocks.filter((block) => block.includes(`<ComponentRefNo>${ref}</ComponentRefNo>`));
  assert.equal(matches.length, 1, `expected one node for ${ref}`);
  return matches[0];
}

function branchNames(xml) {
  return [...xml.matchAll(/<Branchname>([\s\S]*?)<\/Branchname>/g)].map((match) => (
    match[1]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  ));
}

test('canonical branch grouping consolidates B1/B2/B03 under OWNER root', () => {
  const input = [
    {
      name: `${rootBranch}/B1`,
      type: 'BRANCH',
      attributes: { OWNER: rootBranch },
      children: [{ name: 'P1', type: 'PIPE', attributes: { APOS: { x: 0, y: 0, z: 0 }, LPOS: { x: 1, y: 0, z: 0 } } }],
    },
    {
      name: `${rootBranch}/B2`,
      type: 'BRANCH',
      attributes: { OWNER: rootBranch },
      children: [{ name: 'P2', type: 'PIPE', attributes: { APOS: { x: 1, y: 0, z: 0 }, LPOS: { x: 2, y: 0, z: 0 } } }],
    },
    {
      name: `${rootBranch}/B03`,
      type: 'BRANCH',
      attributes: { OWNER: rootBranch },
      children: [{ name: 'P3', type: 'PIPE', attributes: { APOS: { x: 2, y: 0, z: 0 }, LPOS: { x: 3, y: 0, z: 0 } } }],
    },
  ];

  const records = parser.parseStagedJson(input);
  const grouped = parser.groupByBranch(records);
  assert.deepEqual([...grouped.keys()], [rootBranch]);
  assert.equal(grouped.get(rootBranch).length, 3);
  assert.deepEqual(records.map((row) => row.branchSuffix), ['B1', 'B2', 'B03']);
  assert.deepEqual(records.map((row) => row.sourceBranchName), [
    `${rootBranch}/B1`, `${rootBranch}/B2`, `${rootBranch}/B03`,
  ]);
});

test('module-1 enrichedAttributes override stage-2 fallback values', () => {
  const resolved = authority.applyAuthoritativeEnrichment({
    enrichedAttributes: {
      pressureRating: '900',
      wallThicknessMm: '9.27',
      corrosionAllowanceMm: 0,
      pipeOdMm: '273',
      componentWeightKg: '45.5',
    },
  }, {
    rating: 150,
    wallMm: 99,
    corrMm: 3,
    odMm: 999,
    weightKg: 0,
  });

  assert.equal(resolved.rating, 900);
  assert.equal(resolved.wallMm, 9.27);
  assert.equal(resolved.corrMm, 0);
  assert.equal(resolved.odMm, 273);
  assert.equal(resolved.weightKg, 45.5);
  assert.equal(resolved.wallSource, 'stagedjson-cii2019-enriched-attributes/v1');
});

test('ELBO contract emits one Endpoint 0 node and preserves legacy first slot', () => {
  const record = fittingRecord({
    name: 'ELBO =1006649732/51428',
    componentType: 'ELBO',
    ref: '=1006649732/51428',
    dtxr: 'ELBOW 90 DEG LR BW Sch 100',
    boreMm: 200,
    anglDeg: 90,
    attrs: {
      APOS: { x: 445275.151, y: -1159925, z: 1182.651 },
      LPOS: { x: 445580.151, y: -1159925, z: 1487.651 },
      RADI: '0mm',
    },
    enrichedAttributes: {
      nominalBoreMm: 200,
      pipeOdMm: 219.1,
      wallThicknessMm: 8.18,
      corrosionAllowanceMm: 1.5,
      insulationThicknessMm: 100,
    },
  });

  const projection = contract.projectBoundaryNodeContract(record, 1570);
  assert.equal(projection.numberingSpan, 2);
  assert.equal(projection.nodes.length, 1);
  assert.equal(projection.nodes[0].nodeNumber, 1570);
  assert.equal(projection.nodes[0].endpoint, 0);
  assert.equal(projection.nodes[0].componentType, 'ELBO');
  assert.equal(projection.nodes[0].nodeName, '');
  assert.equal(projection.nodes[0].bendRadius, 305);
  assert.equal(projection.nodes[0].bendType, 0);
  assert.equal(projection.nodes[0].includeRigid, false);
});

test('TEE and REDU contracts retain the second virtual numbering slot', () => {
  const tee = fittingRecord({
    name: 'TEE =1006649732/51494',
    componentType: 'TEE',
    ref: '=1006649732/51494',
    dtxr: 'TEE EQUAL BW Sch 100',
  });
  const reducer = fittingRecord({
    name: 'REDU =1006649732/51499',
    componentType: 'REDU',
    ref: '=1006649732/51499',
    dtxr: 'REDUCER ECCENTRIC BW Sch 100 X Sch 80',
    anglDeg: 12.5,
  });

  const teeProjection = contract.projectBoundaryNodeContract(tee, 2270);
  assert.equal(teeProjection.nodes.length, 1);
  assert.equal(teeProjection.nodes[0].nodeNumber, 2280);
  assert.equal(teeProjection.nodes[0].endpoint, 1);
  assert.equal(teeProjection.nodes[0].componentType, 'BRAN');
  assert.equal(teeProjection.nodes[0].connectionType, 'TEE');
  assert.equal(teeProjection.nodes[0].includeRigid, false);

  const reducerProjection = contract.projectBoundaryNodeContract(reducer, 2360);
  assert.equal(reducerProjection.nodes.length, 1);
  assert.equal(reducerProjection.nodes[0].nodeNumber, 2370);
  assert.equal(reducerProjection.nodes[0].endpoint, 2);
  assert.equal(reducerProjection.nodes[0].componentType, 'REDU');
  assert.equal(reducerProjection.nodes[0].alphaAngle, 12.5);
  assert.equal(reducerProjection.nodes[0].includeRigid, false);
});

test('writer emits one fitting node each, keeps virtual numbering, and uses enriched dimensions', () => {
  const elbow = fittingRecord({
    name: 'ELBO =1006649732/51428',
    componentType: 'ELBO',
    ref: '=1006649732/51428',
    dtxr: 'ELBOW 90 DEG LR BW Sch 100',
    boreMm: 200,
    attrs: { APOS: { x: 1, y: 2, z: 3 }, LPOS: { x: 4, y: 5, z: 6 }, RADI: '0mm' },
    enrichedAttributes: {
      nominalBoreMm: 200,
      pipeOdMm: 219.1,
      wallThicknessMm: 8.18,
      corrosionAllowanceMm: 1.5,
      insulationThicknessMm: 100,
    },
  });
  const tee = fittingRecord({
    name: 'TEE =1006649732/51494',
    componentType: 'TEE',
    ref: '=1006649732/51494',
    dtxr: 'TEE EQUAL BW Sch 100',
  });
  const reducer = fittingRecord({
    name: 'REDU =1006649732/51499',
    componentType: 'REDU',
    ref: '=1006649732/51499',
    dtxr: 'REDUCER ECCENTRIC BW Sch 100 X Sch 80',
    anglDeg: 15,
  });

  const xml = writer.buildEnrichedXml(new Map([[rootBranch, [elbow, tee, reducer]]]), {});
  assert.ok(xml.includes(`<Branchname>${rootBranch.replace(/"/g, '&quot;')}</Branchname>`));
  assert.doesNotMatch(xml, /\/B1<\/Branchname>/);

  const elbowBlock = blockForRef(xml, '=1006649732/51428');
  assert.match(elbowBlock, /<NodeNumber>10<\/NodeNumber>/);
  assert.match(elbowBlock, /<Endpoint>0<\/Endpoint>/);
  assert.match(elbowBlock, /<BendRadius>305<\/BendRadius>/);
  assert.match(elbowBlock, /<BendType>0<\/BendType>/);
  assert.match(elbowBlock, /<OutsideDiameter>219\.1<\/OutsideDiameter>/);
  assert.match(elbowBlock, /<WallThickness>8\.18<\/WallThickness>/);
  assert.doesNotMatch(elbowBlock, /<Rigid>/);

  const teeBlock = blockForRef(xml, '=1006649732/51494');
  assert.match(teeBlock, /<NodeNumber>40<\/NodeNumber>/);
  assert.match(teeBlock, /<Endpoint>1<\/Endpoint>/);
  assert.match(teeBlock, /<ComponentType>BRAN<\/ComponentType>/);
  assert.match(teeBlock, /<ConnectionType>TEE<\/ConnectionType>/);
  assert.doesNotMatch(teeBlock, /<Rigid>/);

  const reducerBlock = blockForRef(xml, '=1006649732/51499');
  assert.match(reducerBlock, /<NodeNumber>60<\/NodeNumber>/);
  assert.match(reducerBlock, /<Endpoint>2<\/Endpoint>/);
  assert.match(reducerBlock, /<AlphaAngle>15<\/AlphaAngle>/);
  assert.doesNotMatch(reducerBlock, /<Rigid>/);
});

test('full enrichment pipeline keeps production XML canonical and shadow XML source-sequential', () => {
  const branch = (suffix, child) => ({
    name: `${rootBranch}/${suffix}`,
    type: 'BRANCH',
    attributes: { OWNER: rootBranch },
    children: [child],
  });
  const node = (name, type, ref, dtxr, enrichedAttributes, extra = {}) => ({
    name,
    type,
    enrichedAttributes,
    attributes: {
      RAW_TYPE: type,
      REF: ref,
      DTXR: dtxr,
      ABORE: `${enrichedAttributes.nominalBoreMm}mm`,
      INSU: `${enrichedAttributes.insulationThicknessMm}mm`,
      APOS: { x: 10, y: 20, z: 30 },
      LPOS: { x: 40, y: 50, z: 60 },
      ...extra,
    },
  });
  const input = [
    branch('B1', node('ELBO =1006649732/51428', 'ELBO', '=1006649732/51428', 'ELBOW 90 DEG LR BW Sch 100', {
      nominalBoreMm: 200, pipeOdMm: 219.1, wallThicknessMm: 8.18,
      corrosionAllowanceMm: 1.5, insulationThicknessMm: 100,
    }, { ANGL: '90degree', RADI: '0mm' })),
    branch('B2', node('TEE =1006649732/51494', 'TEE', '=1006649732/51494', 'TEE EQUAL BW Sch 100', {
      nominalBoreMm: 250, pipeOdMm: 273, wallThicknessMm: 9.27,
      corrosionAllowanceMm: 1.5, insulationThicknessMm: 120,
    })),
    branch('B3', node('REDU =1006649732/51499', 'REDU', '=1006649732/51499', 'REDUCER ECCENTRIC BW Sch 100 X Sch 80', {
      nominalBoreMm: 250, pipeOdMm: 273, wallThicknessMm: 9.27,
      corrosionAllowanceMm: 1.5, insulationThicknessMm: 120,
    }, { ANGL: '10degree' })),
  ];

  const result = engine.runEnrichment({ stagedJsonText: input, config: {} });
  assert.equal(result.audit.totalBranches, 1);
  assert.equal((result.xmlText.match(/<Branch>/g) || []).length, 1);
  assert.equal((result.xmlText.match(/=1006649732\/51428<\/ComponentRefNo>/g) || []).length, 1);
  assert.equal((result.xmlText.match(/=1006649732\/51494<\/ComponentRefNo>/g) || []).length, 1);
  assert.equal((result.xmlText.match(/=1006649732\/51499<\/ComponentRefNo>/g) || []).length, 1);
  assert.ok(result.records.every((record) => record.branchName === rootBranch));

  assert.equal(result.sequencePlan.validation.ok, true);
  assert.equal(result.sequencePlan.summary.sourceBranchCount, 3);
  assert.equal(result.sequencePlan.summary.canonicalBranchCount, 1);
  assert.deepEqual(
    result.sequencePlan.branches.map((item) => item.sourceBranchName),
    [`${rootBranch}/B1`, `${rootBranch}/B2`, `${rootBranch}/B3`],
  );
  assert.deepEqual(
    result.sequencePlan.branches.map((item) => item.components.map((component) => component.ref)),
    [['=1006649732/51428'], ['=1006649732/51494'], ['=1006649732/51499']],
  );

  assert.equal(result.writerShadow.generated, true);
  assert.equal(result.writerShadow.parity.validation.ok, true);
  assert.equal(result.writerShadow.parity.summary.engineeringEquivalent, true);
  assert.equal(result.writerShadow.parity.summary.sourceBoundaryEquivalent, true);
  assert.equal(result.writerShadow.parity.switchGate.allowed, false);
  assert.deepEqual(branchNames(result.writerShadow.xmlText), [
    `${rootBranch}/B1`, `${rootBranch}/B2`, `${rootBranch}/B3`,
  ]);
});

test('interleaved owner branches expose sequence and allocation drift without mutating canonical trace', () => {
  const pipeBranch = (sourceName, owner, ref, start) => ({
    name: sourceName,
    type: 'BRANCH',
    attributes: { OWNER: owner },
    children: [{
      name: ref,
      type: 'PIPE',
      enrichedAttributes: {
        nominalBoreMm: 100,
        pipeOdMm: 114.3,
        wallThicknessMm: 6.02,
        corrosionAllowanceMm: 1.5,
        insulationThicknessMm: 50,
      },
      attributes: {
        REF: ref,
        ABORE: '100mm',
        APOS: { x: start, y: 0, z: 0 },
        LPOS: { x: start + 10, y: 0, z: 0 },
      },
    }],
  });
  const input = [
    pipeBranch('/LINE-A/B1', '/LINE-A', 'A1', 0),
    pipeBranch('/LINE-B/B1', '/LINE-B', 'B1', 100),
    pipeBranch('/LINE-A/B2', '/LINE-A', 'A2', 20),
  ];

  const result = engine.runEnrichment({ stagedJsonText: input, config: {} });
  assert.deepEqual(branchNames(result.xmlText), ['/LINE-A', '/LINE-B']);
  assert.deepEqual(branchNames(result.writerShadow.xmlText), ['/LINE-A/B1', '/LINE-B/B1', '/LINE-A/B2']);
  assert.equal(result.writerShadow.parity.validation.ok, true);
  assert.equal(result.writerShadow.parity.summary.nodeCardinalityEquivalent, true);
  assert.equal(result.writerShadow.parity.summary.engineeringEquivalent, true);
  assert.equal(result.writerShadow.parity.summary.sourceBoundaryEquivalent, true);
  assert.equal(result.writerShadow.parity.summary.sequenceEquivalent, false);
  assert.equal(result.writerShadow.parity.summary.numberingEquivalent, false);
  assert.equal(result.writerShadow.parity.switchGate.allowed, false);

  const nodes = Object.fromEntries(result.records.map((record) => [record.ref, record.xmlNodeNum]));
  assert.deepEqual(nodes, { A1: 10, B1: 50, A2: 30 });
});
