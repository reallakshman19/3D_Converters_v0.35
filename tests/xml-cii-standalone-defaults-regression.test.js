const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function prepareEsmFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-cii-defaults-test-'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  const files = [
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-source-detect.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js',
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-run-parity.js',
    'tabs/xml-cii-2019-standalone/xml-cii-workflow-engine-client.js',
    'tabs/xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js',
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js',
    'tabs/xml-cii-2019-standalone/xml-cii-standalone-sif-apply.js',
  ];
  for (const relPath of files) {
    const sourcePath = path.join(root, relPath);
    const targetPath = path.join(tempRoot, relPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
  return tempRoot;
}

const PSI_XML = `<?xml version="1.0"?><CAESARII XML_TYPE="Output" VERSION="2019"><PIPINGMODEL JOBNAME="J" NUMELEMENTS="1" NUMREST="0"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="168.3" WALL_THICK="7.11" /></PIPINGMODEL></CAESARII>`;

(async () => {
  const tempRoot = prepareEsmFixture();
  const api = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js')).href);
  const defaults = await import(pathToFileURL(path.join(tempRoot, 'tabs/xml-cii-2019-standalone/xml-cii-standalone-default-config.js')).href);

  // 4.1: default support config ships split enabled for both JS and Python-compatible keys.
  assert.strictEqual(defaults.DEFAULT_XML_CII_2019_SUPPORT_CONFIG.splitCondensedValveFlange, true, 'default support config must default splitCondensedValveFlange true');
  assert.strictEqual(defaults.DEFAULT_XML_CII_2019_SUPPORT_CONFIG.split_condensed_valve_flange, true, 'default support config must default split_condensed_valve_flange true for Python compatibility');

  // 4.1: normalizeWorkflowOptions defaults splitCondensedValveFlange to true when the job omits it.
  const normalized = api.normalizeWorkflowOptions({});
  assert.strictEqual(normalized.splitCondensedValveFlange, true, 'normalizeWorkflowOptions must default splitCondensedValveFlange to true');
  assert.strictEqual(normalized.outputMode, 'both', 'normalizeWorkflowOptions must default outputMode to both');
  assert.strictEqual(normalized.inputXmlRestraintPolicy, 'merge-existing-and-dtxr-derived-restraints', 'normalizeWorkflowOptions must default inputXmlRestraintPolicy to merge');

  // An explicit false must still be honored (not overridden by the new true default).
  assert.strictEqual(api.normalizeWorkflowOptions({ splitCondensedValveFlange: false }).splitCondensedValveFlange, false, 'explicit splitCondensedValveFlange:false must be preserved');

  // 4.1 regression: build a workflow job with no explicit split option and prove the final
  // support config passed to the engine has split enabled.
  let capturedJob = null;
  const result = await api.runXmlCii2019Workflow({
    sourceKind: 'xml',
    sourceName: 'defaults-regression.xml',
    sourceText: PSI_XML,
    supportConfigJson: defaults.defaultXmlCii2019SupportConfigJson(),
    options: {},
  }, {
    engineRunner: async (job) => {
      capturedJob = job;
      return {
        ok: true,
        sourceKind: job.sourceKind,
        outputKind: 'enrichedXML',
        enrichedText: '<CAESARII/>',
        enrichedName: 'defaults-regression-enriched.xml',
        ciiText: 'CII',
        ciiName: 'defaults-regression.cii',
        diagnostics: { warnings: [] },
        logs: [],
        error: null,
      };
    },
  });

  assert(result.ok, 'workflow must succeed with default options');
  assert(capturedJob, 'engine must have been invoked');
  assert.strictEqual(capturedJob.options.splitCondensedValveFlange, true, 'engine job must carry splitCondensedValveFlange true when caller supplied no explicit option');
  const finalSupportConfig = JSON.parse(capturedJob.supportConfigJson || '{}');
  assert.strictEqual(finalSupportConfig.splitCondensedValveFlange, true, 'final support config passed to engine must have split enabled');
  assert.strictEqual(finalSupportConfig.split_condensed_valve_flange, true, 'final support config passed to engine must have split_condensed_valve_flange enabled for Python compatibility');

  // 4.7: default outputMode is both, so CII is produced without the caller having to force it.
  assert.strictEqual(capturedJob.options.outputMode, 'both', 'engine job must receive outputMode both by default');
  assert(result.ciiText, 'CII text must be produced when outputMode defaults to both');

  console.log('XML CII standalone defaults regression checks passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
