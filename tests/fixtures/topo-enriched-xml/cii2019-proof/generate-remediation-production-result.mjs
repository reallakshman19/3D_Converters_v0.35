import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runTopoEnrichedXmlProduction,
  serializeProductionResult,
} from '../../../../tabs/stagedjson-to-enrichxml/production/topo-enriched-xml-production.js';

const requestedWriter = String(process.argv[2] || 'CANONICAL').toUpperCase();
const coverageMode = String(process.argv[3] || 'CLEAN').toUpperCase();
if (!['CANONICAL', 'SEQUENTIAL'].includes(requestedWriter)) {
  throw new Error(`Unsupported requested writer: ${requestedWriter}`);
}
if (!['CLEAN', 'INCOMPLETE_TOPOLOGY'].includes(coverageMode)) {
  throw new Error(`Unsupported coverage mode: ${coverageMode}`);
}
const fixtureUrl = new URL('../production/production-fixture.mjs', import.meta.url);
let source = await readFile(fixtureUrl, 'utf8');
source = source.replace(/from '([^']+)'/g, (match, specifier) => {
  if (!specifier.startsWith('.')) return match;
  return `from '${new URL(specifier, fixtureUrl).href}'`;
});
const rows = {
  branch: "      { sourceBranch: '/LINE-B/B1', canonicalMainLine: '/LINE-B' },\n",
  component: "      { sourceEntityId: 'SE-FLAN', sourceBranch: '/LINE-B/B1' },\n",
  record: "    record('SE-FLAN', 'FLAN', 'FLANGE-1', { POS: point(300) }),\n",
  flanSpec: "    ['SE-FLAN', 'SP-B-500', 'LN-B-500', '/LINE-B/B1', '/LINE-B'],\n",
  boundarySpec: "    ['SE-B-NEW', 'SP-B-NEW', 'LN-B-NEW', '/LINE-B/B1', '/LINE-B'],\n",
  graphNodes: "    ['LN-B-500', 'SP-B-500'], ['LN-B-NEW', 'SP-B-NEW'],\n",
  graphEdge: "      edge('LE-B-1', 'LN-B-500', 'LN-B-NEW', 'SE-FLAN', '/LINE-B/B1', '/LINE-B'),\n",
  mapping: "    'SE-FLAN': { PRIMARY: 'LN-B-500' },\n",
};
for (const [name, row] of Object.entries(rows)) {
  if (!source.includes(row)) throw new Error(`Accepted TE-013 fixture row changed: ${name}`);
}
source = removeLast(source, rows.branch);
source = source.replace(rows.component, '').replace(rows.record, '');
if (coverageMode === 'CLEAN') {
  source = source.replace(rows.branch, '');
  for (const name of ['flanSpec', 'boundarySpec', 'graphNodes', 'graphEdge', 'mapping']) {
    source = source.replace(rows[name], '');
  }
}
const directory = await mkdtemp(join(tmpdir(), 'te014-remediation-fixture-'));
const modulePath = join(directory, 'production-fixture-remediation.mjs');
try {
  await writeFile(modulePath, source, 'utf8');
  const { makeProductionFixture } = await import(`${pathToFileURL(modulePath).href}?v=1`);
  const input = await makeProductionFixture({ requestedWriter });
  const result = await runTopoEnrichedXmlProduction(input);
  if (result.validation.status !== 'PASS' || !result.productionBundle) {
    throw new Error(`TE-013 remediation fixture failed: ${JSON.stringify(result.validation)}`);
  }
  process.stdout.write(serializeProductionResult(result));
} finally {
  await rm(directory, { recursive: true, force: true });
}

function removeLast(value, target) {
  const index = value.lastIndexOf(target);
  if (index < 0) throw new Error(`Fixture row was not found: ${target}`);
  return value.slice(0, index) + value.slice(index + target.length);
}
