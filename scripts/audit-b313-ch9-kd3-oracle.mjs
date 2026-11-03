import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const qdir = path.join(root, 'engineering/hp-class-standardization/qualification/kd3-oracle');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(qdir, name), 'utf8'));
}

function unique(values, label, errors) {
  const seen = new Set();
  for (const value of values) {
    if (!value) errors.push(`${label} contains a blank ID.`);
    else if (seen.has(value)) errors.push(`${label} duplicate ID ${value}.`);
    else seen.add(value);
  }
}

function authorityFalse(authority) {
  return authority?.nativeCoreKd3Qualified === false
    && authority?.codeCompliance === false
    && authority?.canUseForDesignAuthority === false;
}

const REQUIRED_COVERAGE = Object.freeze([
  'PRESSURE_SALT_BASELINE', 'ZERO_RANGE_ZERO_DAMAGE', 'TENSILE_MEAN_STRESS',
  'COMPRESSIVE_MEAN_STRESS', 'ZERO_MEAN_STRESS', 'PRINCIPAL_STRESS_PERMUTATION_INVARIANCE',
  'NEAR_EQUAL_PRINCIPAL_STRESSES', 'FATIGUE_CURVE_EXACT_UPPER_POINT',
  'FATIGUE_CURVE_EXACT_LOWER_POINT', 'FATIGUE_CURVE_INTERPOLATION',
  'FATIGUE_CURVE_ABOVE_RANGE', 'FATIGUE_CURVE_BELOW_RANGE', 'MATERIAL_TEMPERATURE_BOUNDARY',
  'ONE_CYCLE_MINER', 'MULTI_CYCLE_MINER', 'CYCLE_ORDER_INVARIANCE', 'VERY_SMALL_USAGE',
  'USAGE_NEAR_UNITY', 'APPLICABILITY_BOUNDARY', 'EDITION_MISMATCH_FAIL_CLOSED',
  'MISSING_AMBIGUOUS_PARAMETER_FAIL_CLOSED', 'INDEPENDENT_PUBLISHED_NUMERICAL_EXAMPLE',
  'INDEPENDENT_CHECKED_PROJECT_CALCULATION'
]);

const PENDING_NATIVE = new Set(['PENDING_CONTROLLED_SOURCE', 'PENDING_PRIMARY_ORACLE', 'PENDING_EXTERNAL_EVIDENCE']);

export function auditOracle() {
  const ledger = readJson('source-ledger.json');
  const reqs = readJson('requirements.json');
  const catalog = readJson('catalog.json');
  const errors = [];

  if (ledger.schema !== 'kd3-qualification-source-ledger/v1') errors.push('Unexpected source-ledger schema.');
  if (reqs.schema !== 'kd3-qualification-requirements/v1') errors.push('Unexpected requirements schema.');
  if (catalog.schema !== 'kd3-qualification-oracle-catalog/v1') errors.push('Unexpected catalog schema.');
  if (!authorityFalse(ledger.authority)) errors.push('Source ledger authority must remain false.');
  if (reqs.releasePolicy?.nativeCoreKd3Qualified !== false || reqs.releasePolicy?.automaticPromotionAllowed !== false) errors.push('Requirements release policy must remain fail-closed.');
  if (!authorityFalse(catalog.methodTarget)) errors.push('Catalog method authority must remain false.');
  if (catalog.qaPolicy?.mayLoosenToPass !== false) errors.push('QA tolerance mayLoosenToPass must be false.');

  unique(ledger.sources.map((s) => s.sourceId), 'source ledger', errors);
  unique(reqs.requirements.map((r) => r.id), 'requirements', errors);
  unique(catalog.cases.map((c) => c.benchmarkId), 'catalog', errors);
  const sourceIds = new Set(ledger.sources.map((s) => s.sourceId));
  const requirementIds = new Set(reqs.requirements.map((r) => r.id));
  const coverage = new Set(catalog.cases.map((c) => c.coverageClass));
  for (const required of REQUIRED_COVERAGE) if (!coverage.has(required)) errors.push(`Missing coverage class ${required}.`);

  for (const source of ledger.sources) {
    if (source.formulaOracle !== false || source.fatigueCurveOracle !== false) errors.push(`${source.sourceId} must not be promoted to formula/curve oracle in R1.`);
    if (source.licenseClass === 'LICENSED_RESTRICTED' && source.publicRepositoryContentAllowed !== false) errors.push(`${source.sourceId} restricted source must prohibit public content.`);
  }

  for (const item of catalog.cases) {
    if (!authorityFalse(item.authority)) errors.push(`${item.benchmarkId} authority must remain false.`);
    for (const ref of item.sourceRefs ?? []) if (!sourceIds.has(ref)) errors.push(`${item.benchmarkId} unknown sourceRef ${ref}.`);
    for (const ref of item.requirementRefs ?? []) if (!requirementIds.has(ref)) errors.push(`${item.benchmarkId} unknown requirementRef ${ref}.`);
    if (item.scope === 'NATIVE_KD320' && PENDING_NATIVE.has(item.status) && item.expected !== null) errors.push(`${item.benchmarkId} pending native case must not contain expected numerical results.`);
    if (item.scope === 'NATIVE_KD320' && item.solver) errors.push(`${item.benchmarkId} native KD320 case must not have an executable solver before source qualification.`);
    if (item.status === 'QUALIFICATION_FOUNDATION_READY' && item.expectedOrigin !== 'INDEPENDENT_ANALYTICAL_FROZEN') errors.push(`${item.benchmarkId} foundation case must declare independent frozen expected origin.`);
  }

  const raw = [JSON.stringify(ledger), JSON.stringify(reqs), JSON.stringify(catalog)].join('\n');
  for (const forbidden of ['licensedText', 'codeText', 'nativeKd320Formula', 'fatigueCurvePoints']) {
    if (raw.includes(`\"${forbidden}\"`)) errors.push(`Forbidden open-repository field ${forbidden}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      sources: ledger.sources.length,
      requirements: reqs.requirements.length,
      cases: catalog.cases.length,
      foundationReady: catalog.cases.filter((c) => c.status === 'QUALIFICATION_FOUNDATION_READY').length,
      pendingNative: catalog.cases.filter((c) => c.scope === 'NATIVE_KD320' && PENDING_NATIVE.has(c.status)).length
    },
    authority: { nativeCoreKd3Qualified: false, codeCompliance: false, canUseForDesignAuthority: false }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditOracle();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
