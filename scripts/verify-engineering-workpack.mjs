import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateEngineeringWorkpackCheck } from '../engineering/workpacks/framework/check-handlers.mjs';
import {
  loadEngineeringWorkpack,
  validateEngineeringWorkpack,
} from '../engineering/workpacks/framework/workpack-loader.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SCRIPT_PATH));

function resultCheck(check, evaluation) {
  return Object.freeze({
    id: check.id,
    status: evaluation.ok ? 'PASS' : 'FAIL',
    detail: evaluation.detail,
  });
}

function throwOnFailure(workpackId, checks) {
  const failures = checks.filter((entry) => entry.status === 'FAIL');
  if (!failures.length) return;
  const detail = failures.map((entry) => `${entry.id}: ${entry.detail}`).join('\n');
  throw new Error(`${workpackId} work-pack verification failed:\n${detail}`);
}

async function executeChecks(root, workpack) {
  const context = Object.freeze({ root, workpack });
  const checks = [];
  let listCount = null;
  for (const declaration of workpack.checks) {
    const evaluation = await evaluateEngineeringWorkpackCheck(context, declaration);
    checks.push(resultCheck(declaration, evaluation));
    if (Number.isInteger(evaluation.meta?.listCount)) listCount = evaluation.meta.listCount;
  }
  return Object.freeze({ checks: Object.freeze(checks), listCount });
}

export async function verifyEngineeringWorkpackDefinition(input, options = {}) {
  const root = options.root ?? ROOT;
  const workpack = validateEngineeringWorkpack(input, input?.workpackId ?? null);
  const execution = await executeChecks(root, workpack);
  throwOnFailure(workpack.workpackId, execution.checks);
  return Object.freeze({
    workpackId: workpack.workpackId,
    status: 'PASS',
    ...(Number.isInteger(execution.listCount) ? { releaseManifestCount: execution.listCount } : {}),
    checks: execution.checks,
  });
}

export async function verifyEngineeringWorkpack(workpackId = 'VIB-FIT') {
  const { workpack } = await loadEngineeringWorkpack(ROOT, workpackId);
  return verifyEngineeringWorkpackDefinition(workpack, { root: ROOT });
}

async function main() {
  const workpackId = process.argv[2] ?? 'VIB-FIT';
  const result = await verifyEngineeringWorkpack(workpackId);
  result.checks.forEach((entry) => console.log(`${entry.status} ${entry.id} ${entry.detail}`));
  const summary = Number.isInteger(result.releaseManifestCount)
    ? `${result.releaseManifestCount} controlled release tests.`
    : `${result.checks.length} deterministic work-pack checks.`;
  console.log(`PASS ${result.workpackId}: ${summary}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(SCRIPT_PATH)) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
