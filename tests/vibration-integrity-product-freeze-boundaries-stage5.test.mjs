import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const NEW_MODULES = [
  'tabs/vibration-integrity-workflow-state.js',
  'tabs/vibration-integrity-audit-log.js',
  'tabs/vibration-integrity-ui-contract.js',
  'tabs/vibration-integrity-activity-view.js',
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Stage 5 product-freeze modules remain below 300 physical lines', async () => {
  for (const path of NEW_MODULES) {
    const text = await source(path);
    assert.ok(text.split(/\r?\n/u).length < 300, `${path} exceeds the 300-line policy`);
  }
});

test('workflow and audit modules contain no engineering calculation implementation', async () => {
  const text = (await Promise.all(NEW_MODULES.map(source))).join('\n');
  assert.doesNotMatch(text, /calculateEngineering\s*\(/u);
  assert.doesNotMatch(text, /standardLof\s*[=*]/u);
  assert.doesNotMatch(text, /governingLof\s*[=*]/u);
  assert.doesNotMatch(text, /publicationState:\s*['"]ACTIVE['"]/u);
  assert.doesNotMatch(text, /screeningAuthority:\s*['"]AUTHORIZED/iu);
  assert.doesNotMatch(text, /designAuthority:\s*true/u);
});

test('activity journal remains metadata-only and size bounded', async () => {
  const audit = await source('tabs/vibration-integrity-audit-log.js');
  assert.match(audit, /text\.length > 4096/u);
  assert.match(audit, /ACTIVITY_AUDIT_ONLY/u);
  assert.doesNotMatch(audit, /tables:\s*state\.tables/u);
  assert.doesNotMatch(audit, /envelope:\s*state\.envelope/u);
});

test('FIT evidence keeps reproducibility authority while Activity export remains a separate artifact', async () => {
  const evidence = await source('tabs/vibration-integrity-run-evidence.js');
  assert.match(evidence, /FitRunEvidencePackage\.v1/u);
  assert.match(evidence, /REPRODUCIBILITY_EVIDENCE_ONLY/u);
  assert.doesNotMatch(evidence, /VibrationIntegrityAuditExport/u);
});
