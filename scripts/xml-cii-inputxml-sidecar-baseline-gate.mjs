import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const headRoot = resolve(process.argv[2] || '.');
const baseRoot = resolve(process.argv[3] || '.baseline-main');
const outputPath = resolve(process.argv[4] || 'xml-cii-sidecar-baseline.json');

function run(command, args, cwd, timeout = 240000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : '',
  };
}

function jsTestFiles(root) {
  return readdirSync(join(root, 'tests'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => join('tests', entry.name))
    .sort();
}

function runJsTests(root) {
  const results = {};
  for (const file of jsTestFiles(root)) {
    const execution = run(process.execPath, [file], root, 180000);
    results[file] = {
      passed: execution.status === 0,
      status: execution.status,
      tail: `${execution.stdout}\n${execution.stderr}`.trim().split('\n').slice(-12),
      error: execution.error,
    };
  }
  return results;
}

function pytestIds(root) {
  const result = run('python', ['-m', 'pytest', 'converters/scripts', '--collect-only', '-q'], root, 300000);
  return [...new Set(result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.includes('::')))].sort();
}

function pytestFailures(text) {
  const ids = new Set();
  for (const line of text.split('\n')) {
    const match = line.match(/^(?:FAILED|ERROR)\s+([^\s]+)(?:\s+-|$)/);
    if (match) ids.add(match[1]);
  }
  return [...ids].sort();
}

function runPytest(root) {
  const execution = run('python', ['-m', 'pytest', 'converters/scripts', '-q'], root, 900000);
  const combined = `${execution.stdout}\n${execution.stderr}`;
  return {
    status: execution.status,
    failures: pytestFailures(combined),
    tail: combined.trim().split('\n').slice(-30),
  };
}

function compareJs(base, head) {
  const baseNames = Object.keys(base);
  const headNames = Object.keys(head);
  const removed = baseNames.filter((name) => !headNames.includes(name));
  const regressions = baseNames.filter((name) => base[name].passed && head[name] && !head[name].passed);
  const improvements = baseNames.filter((name) => !base[name].passed && head[name]?.passed);
  return { removed, regressions, improvements };
}

function comparePython(baseIds, headIds, baseRun, headRun) {
  const headSet = new Set(headIds);
  const removed = baseIds.filter((id) => !headSet.has(id));
  const baseFailures = new Set(baseRun.failures);
  const headFailures = new Set(headRun.failures);
  const regressions = headRun.failures.filter((id) => !baseFailures.has(id));
  const improvements = baseRun.failures.filter((id) => !headFailures.has(id));
  return { removed, regressions, improvements };
}

function countFailures(results) {
  return Object.values(results).filter((item) => !item.passed).length;
}

const baseJs = runJsTests(baseRoot);
const headJs = runJsTests(headRoot);
const basePythonIds = pytestIds(baseRoot);
const headPythonIds = pytestIds(headRoot);
const basePytest = runPytest(baseRoot);
const headPytest = runPytest(headRoot);
const jsComparison = compareJs(baseJs, headJs);
const pythonComparison = comparePython(basePythonIds, headPythonIds, basePytest, headPytest);

const ledger = {
  schema: 'xml-cii-inputxml-sidecar-baseline/v1',
  baseRoot: relative(headRoot, baseRoot) || '.',
  javascript: {
    baseCount: Object.keys(baseJs).length,
    headCount: Object.keys(headJs).length,
    baseFailures: countFailures(baseJs),
    headFailures: countFailures(headJs),
    ...jsComparison,
    headFailureDetails: Object.fromEntries(Object.entries(headJs).filter(([, value]) => !value.passed)),
  },
  python: {
    baseCount: basePythonIds.length,
    headCount: headPythonIds.length,
    baseFailures: basePytest.failures,
    headFailures: headPytest.failures,
    ...pythonComparison,
    baseStatus: basePytest.status,
    headStatus: headPytest.status,
    headTail: headPytest.tail,
  },
};

writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(ledger, null, 2));
const blocked = [
  ...jsComparison.removed,
  ...jsComparison.regressions,
  ...pythonComparison.removed,
  ...pythonComparison.regressions,
];
if (blocked.length) process.exitCode = 1;
