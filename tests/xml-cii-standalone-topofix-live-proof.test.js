const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { fileURLToPath, pathToFileURL } = require('url');
const { HostBackedPyodide } = require('./helpers/host-backed-pyodide');
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper');

const root = path.resolve(__dirname, '..');
const fixtureXml = path.join(root, 'Benchmarks', '1885Sjson', 'FirstpassXML');
const expectedCii = path.join(root, 'Benchmarks', '1885Sjson', 'Firstpass CII');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed with status ${result.status}`,
      result.stdout || '',
      result.stderr || '',
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function prepareEsmFixture() {
  const fixture = createStaticEsmFixture(root, {
    prefix: 'xml-cii-topofix-live-proof-',
    entryFiles: [
      'converters/xml-cii-2019-standalone/topology-integration.js',
      'tabs/xml-cii-2019-standalone/xml-cii-output-run-readiness.js',
    ],
  });
  fs.cpSync(
    path.join(root, 'converters', 'psi116_topology_resolver'),
    path.join(fixture.tempRoot, 'converters', 'psi116_topology_resolver'),
    { recursive: true },
  );
  return fixture.tempRoot;
}

function actionFor(plan, disposition, nodeNumbers) {
  const expected = [...nodeNumbers].sort((a, b) => a - b).join(',');
  const action = (plan.actions || []).find((candidate) => {
    const actual = [...(candidate.node_numbers || [])].sort((a, b) => a - b).join(',');
    return candidate.disposition === disposition && actual === expected;
  });
  assert(action, `Missing ${disposition} action for nodes ${expected}`);
  assert.strictEqual(action.status, 'PROPOSED', `${action.action_id} must remain reviewable`);
  return action;
}

function ciiElementPairs(ciiText) {
  const body = ciiText.split('#$ ELEMENTS', 2)[1].split('#$', 1)[0];
  const rows = body.split(/\r?\n/).filter((line) => line.trim());
  const pairs = [];
  for (let index = 0; index < rows.length; index += 15) {
    const values = rows[index].trim().split(/\s+/);
    pairs.push([Number(values[0]), Number(values[1])]);
  }
  return pairs;
}

function ciiBendRadii(ciiText) {
  const body = ciiText.split('#$ BEND', 2)[1].split('#$', 1)[0];
  const rows = body.split(/\r?\n/).filter((line) => line.trim());
  const radii = [];
  for (let index = 0; index < rows.length; index += 3) {
    radii.push(Number(rows[index].trim().split(/\s+/)[0]));
  }
  return radii;
}

(async () => {
  const esmRoot = prepareEsmFixture();
  const proofRoot = process.env.TOPOFIX_LIVE_PROOF_DIR
    ? path.resolve(process.env.TOPOFIX_LIVE_PROOF_DIR)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'psi116-topofix-live-proof-output-'));
  const analysisDir = path.join(proofRoot, 'analysis');
  const transactionDir = path.join(proofRoot, 'transaction');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.mkdirSync(transactionDir, { recursive: true });

  const sourceBefore = fs.readFileSync(fixtureXml);
  const sourceHashBefore = sha256(sourceBefore);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.protocol !== 'file:') {
      if (typeof previousFetch === 'function') return previousFetch(input);
      throw new Error(`Unsupported fetch URL in live proof: ${url}`);
    }
    const filePath = fileURLToPath(url);
    return {
      ok: fs.existsSync(filePath),
      status: fs.existsSync(filePath) ? 200 : 404,
      text: async () => fs.readFileSync(filePath, 'utf8'),
    };
  };

  try {
    const topology = await import(pathToFileURL(path.join(esmRoot, 'converters/xml-cii-2019-standalone/topology-integration.js')).href);
    const readiness = await import(pathToFileURL(path.join(esmRoot, 'tabs/xml-cii-2019-standalone/xml-cii-output-run-readiness.js')).href);
    const pyodide = new HostBackedPyodide(esmRoot, root);

    const analysisJob = {
      sourceKind: 'xml',
      sourceName: 'FirstpassXML.xml',
      options: {
        outputMode: 'both',
        analyzeTopology: true,
        generateTopoFix: false,
        useTopoFixForCii: false,
        topologyActionIds: [],
      },
    };
    const analysisLog = [];
    const analysis = await topology.runPsi116TopologyStage(pyodide, analysisJob, fixtureXml, analysisDir, analysisLog);
    assert.strictEqual(analysis.ciiInputPath, fixtureXml);
    assert.strictEqual(analysis.ciiInputSource, 'original');
    assert.strictEqual(analysis.topoFixCommitted, false);
    assert.strictEqual(analysis.topoFixXmlText, '');
    assert(analysisLog.some((line) => line.includes('topology analysis wrote')));

    const findings = JSON.parse(analysis.topologyFindingsText);
    const plan = JSON.parse(analysis.topologyFixPlanText);
    assert.strictEqual(findings.schema, 'psi116-topology-findings/v1');
    assert.strictEqual(findings.summary.branchCount, 5);
    assert.strictEqual(findings.summary.sourceNodeRecordCount, 216);
    assert.strictEqual(findings.summary.blockingFindingCount, 0);
    assert.strictEqual(plan.schema, 'psi116-topology-fix-plan/v1');
    assert.strictEqual(plan.mutationPolicy, 'DRY_RUN_ONLY');
    assert.strictEqual(plan.sourceXmlMutated, false);

    const crossBranch = actionFor(plan, 'ALIAS_COINCIDENT_NODE', [1570, 2260]);
    const elbowContract = actionFor(plan, 'SAFE_DROP_PIPE_GEOMETRY', [1600, 1610]);
    const actionIds = [crossBranch.action_id, elbowContract.action_id];

    const transactionJob = {
      sourceKind: 'xml',
      sourceName: 'FirstpassXML.xml',
      options: {
        outputMode: 'both',
        analyzeTopology: true,
        generateTopoFix: true,
        useTopoFixForCii: true,
        topologyActionIds: actionIds,
      },
    };
    const transactionLog = [];
    const stage = await topology.runPsi116TopologyStage(pyodide, transactionJob, fixtureXml, transactionDir, transactionLog);
    assert.strictEqual(stage.topoFixCommitted, true, stage.topoFixValidationText);
    assert.strictEqual(stage.ciiInputSource, 'topofix');
    assert.strictEqual(stage.ciiInputPath, path.join(transactionDir, 'FirstpassXML.topofix.xml'));
    assert(stage.topoFixXmlText.includes('<PipeStressExport'));
    assert(transactionLog.includes('CII conversion input switched to committed TopoFix XML.'));

    const transaction = JSON.parse(stage.topoFixTransactionText);
    const validation = JSON.parse(stage.topoFixValidationText);
    assert.strictEqual(transaction.committed, true);
    const selectedActionIds = transaction.selectedActions
      || transaction.selectedActionIds
      || transaction.selected_action_ids
      || transaction.policy?.selected_action_ids
      || [];
    assert.deepStrictEqual(new Set(selectedActionIds), new Set(actionIds));
    const blockingChecks = (validation.checks || []).filter((check) => check.blocking);
    assert(blockingChecks.length > 0, 'Blocking validation checks must be recorded.');
    assert(blockingChecks.every((check) => check.passed), JSON.stringify(blockingChecks, null, 2));

    const fixedNodeNumbers = [...stage.topoFixXmlText.matchAll(/<NodeNumber>\s*(-?\d+)\s*<\/NodeNumber>/g)].map((match) => Number(match[1]));
    assert(!fixedNodeNumbers.includes(1600));
    assert(!fixedNodeNumbers.includes(2260));
    assert(fixedNodeNumbers.filter((value) => value === 1570).length >= 2);
    assert(fixedNodeNumbers.includes(1610));

    const ciiPath = path.join(proofRoot, 'FirstpassXML.topofix.cii');
    const diagnosticsPath = path.join(proofRoot, 'FirstpassXML.topofix.cii.log');
    run('python', [
      'converters/scripts/xml_to_cii2019_contracted_direction.py',
      '--input', stage.ciiInputPath,
      '--output', ciiPath,
      '--coords-mode', 'first',
      '--diagnostics-out', diagnosticsPath,
    ]);
    const ciiBuffer = fs.readFileSync(ciiPath);
    const expectedBuffer = fs.readFileSync(expectedCii);
    assert(ciiBuffer.equals(expectedBuffer), 'Standalone TopoFix CII must be byte-identical to the committed 1885 benchmark.');

    const ciiText = ciiBuffer.toString('utf8');
    const pairs = ciiElementPairs(ciiText);
    assert(pairs.some(([from, to]) => from === 2240 && to === 1570));
    assert(pairs.some(([from, to]) => from === 1570 && to === 2280));
    assert(pairs.some(([from, to]) => from === 1570 && to === 1590));
    assert(!pairs.some(([from, to]) => [from, to].includes(1600) || [from, to].includes(2260)));
    const radii = ciiBendRadii(ciiText);
    assert.strictEqual(radii.length, 14);
    assert(radii.filter((radius) => radius === 305).length >= 2);

    const result = {
      ok: true,
      enrichedText: stage.topoFixXmlText,
      enrichedName: stage.topoFixXmlName,
      ciiText,
      ciiName: path.basename(ciiPath),
      diagnostics: { topology: stage.topologySummary },
      logs: transactionLog,
      ...stage,
    };
    const report = readiness.buildStandaloneOutputRunReadiness({
      sourceKind: 'xml',
      sourceText: sourceBefore.toString('utf8'),
      supportConfigJson: '{}',
      options: transactionJob.options,
      result,
    });
    assert.strictEqual(report.manifest.topology.committed, true);
    assert.strictEqual(report.manifest.topology.ciiInputSource, 'topofix');
    assert.deepStrictEqual(report.manifest.topology.selectedActionIds, actionIds);
    assert.strictEqual(report.manifest.artifacts.topologyFindings, true);
    assert.strictEqual(report.manifest.artifacts.topologyPlan, true);
    assert.strictEqual(report.manifest.artifacts.topoFixXml, true);
    fs.writeFileSync(path.join(proofRoot, 'xml-cii-run-manifest.json'), JSON.stringify(report.manifest, null, 2) + '\n', 'utf8');

    const sourceAfter = fs.readFileSync(fixtureXml);
    assert.strictEqual(sha256(sourceAfter), sourceHashBefore, 'The source PSI116 benchmark must remain byte-identical.');
    console.log(`PSI116 standalone TopoFix live proof passed. Evidence: ${proofRoot}`);
  } finally {
    globalThis.fetch = previousFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
