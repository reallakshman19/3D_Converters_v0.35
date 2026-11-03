import assert from 'node:assert/strict';
import {
  buildInputXmlBlockedSummary,
  buildInputXmlPreflightRows,
  collectInputXmlPreflightDiagnostics,
} from '../tabs/model-converters/converters/inputxml-blocked-diagnostics.js';
import { run as runInputXmlToCii2019 } from '../tabs/model-converters/converters/inputxml-to-cii2019.js';

const jsonOutput = (name, role, document) => ({
  name,
  role,
  text: `${JSON.stringify(document, null, 2)}\n`,
  mime: 'application/json;charset=utf-8',
});

const preflight = {
  schema: 'InputXmlReleasePreflightResult.v1',
  status: 'BLOCKED',
  releaseEligible: false,
};
const policy = {
  schema: 'InputXmlCompatibilityPolicy.v1',
  mode: 'CANONICAL_STRICT',
  detectedDialect: 'legacy-inputxml-2019',
  status: 'BLOCKED',
  diagnostics: [{
    severity: 'BLOCKING',
    code: 'STRICT_DIALECT_BLOCKED',
    message: 'Canonical strict mode requires canonical-inputxml-v1.',
    context: { detectedDialect: 'legacy-inputxml-2019' },
  }],
};
const assurance = {
  schema: 'InputXmlCiiAssuranceLedger.v2',
  status: 'BLOCKED',
  gates: { compatibility: 'BLOCKED', canonicalization: 'PASS' },
  diagnostics: [],
};
const outputs = [
  jsonOutput('preflight-result.json', 'preflightResult', preflight),
  jsonOutput('compatibility-policy.json', 'compatibilityPolicy', policy),
  jsonOutput('assurance-ledger-v2.json', 'assuranceLedger', assurance),
];
const logs = {
  preflight,
  argv: ['--mode', 'CANONICAL_STRICT'],
  runtime: {
    sourceRevision: 'sha256:runtime',
    manifestHashSha256: 'sha256:manifest',
  },
};

const diagnostics = collectInputXmlPreflightDiagnostics(outputs);
assert.equal(diagnostics[0].code, 'STRICT_DIALECT_BLOCKED');
assert.equal(diagnostics.some((row) => row.code === 'ASSURANCE_GATE_COMPATIBILITY_BLOCKED'), true);

const summary = buildInputXmlBlockedSummary(outputs, logs);
assert.equal(summary.schema, 'InputXmlBlockedSummary.v1');
assert.equal(summary.code, 'STRICT_DIALECT_BLOCKED');
assert.equal(summary.detectedDialect, 'legacy-inputxml-2019');
assert.match(summary.headline, /^STRICT_DIALECT_BLOCKED:/);
assert.equal(summary.artifact.role, 'blockedSummary');
assert.equal(summary.artifact.name, 'inputxml-release-blocked-STRICT_DIALECT_BLOCKED.txt');
assert.match(summary.artifact.text, /Canonical strict mode requires canonical-inputxml-v1\./);

const rows = buildInputXmlPreflightRows(outputs, logs);
assert.equal(rows[0].method, 'STRICT_DIALECT_BLOCKED');
assert.equal(rows[0].needsReview, true);
assert.equal(rows.at(-1).type, 'inputxml-runtime-manifest');

const integrated = await runInputXmlToCii2019({
  converterId: 'inputxml_to_cii2019',
  inputFiles: [{ role: 'primary', name: 'legacy.xml', bytes: new TextEncoder().encode('<INPUTXML/>').buffer }],
  options: { inputXmlCompatibilityMode: 'CANONICAL_STRICT' },
  workerRunner: { runJob: async () => ({ outputs, logs }) },
});
assert.equal(integrated.blocked, true);
assert.equal(integrated.blockedSummary.code, 'STRICT_DIALECT_BLOCKED');
assert.equal(integrated.outputs[0].role, 'blockedSummary');
assert.equal(integrated.outputs[0].name, 'inputxml-release-blocked-STRICT_DIALECT_BLOCKED.txt');
assert.equal(integrated.outputs.some((item) => item.role === 'cii'), false);
assert.equal(integrated.diagnosticsRows[0].method, 'STRICT_DIALECT_BLOCKED');

const fallback = buildInputXmlBlockedSummary([
  jsonOutput('preflight-result.json', 'preflightResult', preflight),
], { preflight });
assert.equal(fallback.code, 'PREFLIGHT_BLOCKED');
assert.match(fallback.artifact.text, /inspect the attached preflight evidence files/i);

console.log('InputXML blocked diagnostics UI contract passed.');
