import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SCRIPT_PATH));
const WORKPACK_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;

function check(id, ok, detail) {
  return Object.freeze({ id, status: ok ? 'PASS' : 'FAIL', detail });
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

async function importFromRoot(path) {
  return import(pathToFileURL(resolve(ROOT, path)).href);
}

function collectIds(value, output = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIds(entry, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (typeof value.id === 'string') output.add(value.id);
  Object.values(value).forEach((entry) => collectIds(entry, output));
  return output;
}

async function loadWorkpack(workpackId) {
  if (!WORKPACK_ID_PATTERN.test(workpackId)) throw new Error(`Invalid workpack id: ${workpackId}`);
  const path = `engineering/workpacks/${workpackId}.json`;
  return { path, workpack: await readJson(path) };
}

async function runtimeContext(workpack) {
  const adapter = await importFromRoot(workpack.adapter.path);
  const registry = await importFromRoot(workpack.registry.path);
  return {
    definition: adapter[workpack.adapter.exportName],
    activeDefinitions: registry[workpack.registry.exportName],
  };
}

function checkIdentity(workpack, definition) {
  return [
    check('FIT-WP-001', definition?.id === workpack.capabilityId,
      `adapter id ${definition?.id ?? 'MISSING'} == ${workpack.capabilityId}`),
    check('FIT-WP-002', definition?.methodRevision === workpack.methodRevision,
      `method revision ${definition?.methodRevision ?? 'MISSING'} == ${workpack.methodRevision}`),
  ];
}

function checkRegistry(workpack, activeDefinitions) {
  const active = Array.isArray(activeDefinitions)
    && activeDefinitions.some((definition) => definition.id === workpack.capabilityId);
  return check('FIT-WP-003', workpack.registry.state === 'ACTIVE' && active,
    `${workpack.capabilityId} is present in the active registry`);
}

function runProbe(definition, probe, mode = 'screening') {
  return definition.calculate(probe.input, { options: { qualificationMode: mode } });
}

async function authorityProjectionFailures(workpack) {
  const failures = [];
  for (const rule of workpack.authorityProjectionModules ?? []) {
    const module = await importFromRoot(rule.path);
    const projection = module[rule.exportName]?.[rule.authorityProperty];
    for (const field of rule.fields) {
      if (projection?.[field] !== workpack.authority[field]) failures.push(`${rule.path}:${field}`);
    }
  }
  return failures;
}

async function checkScreeningAuthority(workpack, definition) {
  const result = runProbe(definition, workpack.probes.screening);
  const expected = workpack.authority;
  const projectionFailures = await authorityProjectionFailures(workpack);
  const ok = result.ok === true
    && definition.authority?.calculationState === expected.calculationState
    && definition.authority?.qualificationState === expected.qualificationState
    && result.qualification?.effective === expected.qualificationState
    && result.provenance?.engineeringAuthority === expected.engineeringAuthority
    && result.assessment?.screeningAuthority === expected.screeningAuthority
    && projectionFailures.length === 0;
  const detail = projectionFailures.length
    ? `authority projection drift: ${projectionFailures.join(', ')}`
    : 'bounded screening authority and machine projections match work pack';
  return { result, gate: check('FIT-WP-004', ok, detail) };
}

function checkDesignAuthority(workpack, screeningResult) {
  const ok = workpack.authority.designAuthority === false
    && screeningResult.qualification?.designAuthority === false
    && screeningResult.assessment?.designAuthority === false;
  return check('FIT-WP-005', ok, 'designAuthority remains false in contract and screening result');
}

function checkCodeCompliance(workpack, definition) {
  const ok = workpack.authority.codeCompliance === false
    && definition.authority?.codeCompliance === false;
  return check('FIT-WP-006', ok, 'codeCompliance remains false');
}

function checkQst003(workpack, definition) {
  const result = runProbe(definition, workpack.probes.qst003);
  const expected = workpack.probes.qst003.expectedPublicErrorCode;
  const codes = (result.errors ?? []).map((error) => error.code);
  return check('FIT-WP-007', result.ok === false && codes.includes(expected),
    `QST-003 fails closed with ${expected}`);
}

async function checkBenchmarks(workpack) {
  const failures = [];
  for (const expected of workpack.benchmarkSets) {
    const actual = await readJson(expected.path);
    if (actual.benchmarkSetId !== expected.benchmarkSetId) failures.push(`${expected.path}: id drift`);
    const ids = collectIds(actual);
    for (const id of expected.requiredCaseIds) if (!ids.has(id)) failures.push(`${expected.path}: missing ${id}`);
  }
  return check('FIT-WP-008', failures.length === 0,
    failures.length ? failures.join('; ') : 'controlled benchmark identities and required vectors exist');
}

async function checkReleaseManifest(workpack) {
  const module = await importFromRoot(workpack.releaseManifest.path);
  const tests = module[workpack.releaseManifest.exportName]();
  const missing = workpack.releaseManifest.requiredCriticalTests.filter((path) => !tests.includes(path));
  return {
    count: tests.length,
    gate: check('FIT-WP-009', missing.length === 0,
      missing.length ? `release manifest missing ${missing.join(', ')}` : `${tests.length} controlled tests include work-pack critical paths`),
  };
}

async function checkUiProjections(workpack) {
  const failures = [];
  for (const rule of workpack.uiProjectionRules) {
    const source = await readFile(resolve(ROOT, rule.path), 'utf8');
    for (const text of rule.forbiddenStrings) if (source.includes(text)) failures.push(`${rule.path}: ${text}`);
  }
  return check('FIT-WP-010', failures.length === 0,
    failures.length ? `contradictory UI text: ${failures.join('; ')}` : 'UI projections contain no forbidden authority copy');
}

async function checkDocuments(workpack) {
  const failures = [];
  for (const rule of workpack.documentRules) {
    const source = await readFile(resolve(ROOT, rule.path), 'utf8');
    const marker = `Artifact classification: **${rule.classification}**`;
    if (!source.includes(marker)) failures.push(`${rule.path}: missing ${marker}`);
    for (const text of rule.requiredStrings) if (!source.includes(text)) failures.push(`${rule.path}: missing ${text}`);
    for (const text of rule.forbiddenStrings) if (source.includes(text)) failures.push(`${rule.path}: stale ${text}`);
  }
  return check('FIT-WP-011', failures.length === 0,
    failures.length ? failures.join('; ') : 'current and historical FIT documents are explicitly classified');
}

async function checkProductFreeze(workpack) {
  const freeze = workpack.productFreeze;
  await access(resolve(ROOT, freeze.protocolPath));
  if (freeze.state !== 'FROZEN') {
    const ok = freeze.state === 'BLOCKED'
      && freeze.frozen === false
      && freeze.qualificationIndependent === true;
    return check('FIT-WP-012', ok, 'Product Freeze remains BLOCKED and separate from method qualification');
  }
  const receipt = await readJson(freeze.receiptPath);
  const ok = freeze.frozen === true
    && freeze.qualificationIndependent === true
    && receipt.schema === freeze.requiredReceiptSchema
    && receipt.status === freeze.requiredReceiptStatus;
  return check('FIT-WP-012', ok, 'FROZEN requires the protocol-defined PASS receipt');
}

function throwOnFailure(workpackId, checks) {
  const failures = checks.filter((entry) => entry.status === 'FAIL');
  if (!failures.length) return;
  const detail = failures.map((entry) => `${entry.id}: ${entry.detail}`).join('\n');
  throw new Error(`${workpackId} work-pack verification failed:\n${detail}`);
}

export async function verifyEngineeringWorkpack(workpackId = 'VIB-FIT') {
  const { workpack } = await loadWorkpack(workpackId);
  const { definition, activeDefinitions } = await runtimeContext(workpack);
  const checks = [...checkIdentity(workpack, definition), checkRegistry(workpack, activeDefinitions)];
  const screening = await checkScreeningAuthority(workpack, definition);
  checks.push(screening.gate);
  checks.push(checkDesignAuthority(workpack, screening.result));
  checks.push(checkCodeCompliance(workpack, definition));
  checks.push(checkQst003(workpack, definition));
  checks.push(await checkBenchmarks(workpack));
  const release = await checkReleaseManifest(workpack);
  checks.push(release.gate);
  checks.push(await checkUiProjections(workpack));
  checks.push(await checkDocuments(workpack));
  checks.push(await checkProductFreeze(workpack));
  throwOnFailure(workpackId, checks);
  return Object.freeze({ workpackId, status: 'PASS', releaseManifestCount: release.count, checks });
}

async function main() {
  const workpackId = process.argv[2] ?? 'VIB-FIT';
  const result = await verifyEngineeringWorkpack(workpackId);
  result.checks.forEach((entry) => console.log(`${entry.status} ${entry.id} ${entry.detail}`));
  console.log(`PASS ${result.workpackId}: ${result.releaseManifestCount} controlled release tests.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(SCRIPT_PATH)) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
