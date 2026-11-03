import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVibrationWorkedExampleValidationRecord } from '../converters/vibration/validation/worked-examples.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CATALOGUE = resolve(ROOT, 'Benchmarks/VibrationIntegrity/ei-aviff-multimechanism-worked-examples-v1.json');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function markdown(record, execution) {
  const lines = [
    '# Vibration Integrity — EI AVIFF Worked-Example Validation Record', '',
    `- Schema: \`${record.schema}\``,
    `- Benchmark set: \`${record.benchmarkSetId}\``,
    `- Validated Git SHA: \`${execution.validatedGitSha}\``,
    `- Executed at: \`${execution.executedAt}\``,
    `- Engineering authority: \`${record.authority.engineeringAuthority}\``,
    `- Screening authority: \`${record.authority.screeningAuthority}\``, '',
    '| Case | Mechanism | Mode | Status |', '|---|---|---|---|',
  ];
  for (const item of record.cases) {
    lines.push(`| ${item.caseId} | ${item.mechanism} | ${item.validationMode} | **${item.status}** |`);
  }
  lines.push('', '## Step-by-step evidence', '');
  for (const item of record.cases) {
    lines.push(`### ${item.caseId}`, '', `Mechanism: **${item.mechanism}** · Status: **${item.status}**`, '');
    if (item.sourceLocation) lines.push(`Source: ${item.sourceLocation}`, '');
    lines.push('| Step | Mode | Expected | Actual | Status |', '|---|---|---:|---:|---|');
    for (const step of item.steps) {
      const expected = typeof step.expected === 'object' ? JSON.stringify(step.expected) : String(step.expected ?? '—');
      const actual = typeof step.actual === 'object' ? JSON.stringify(step.actual) : String(step.actual ?? '—');
      lines.push(`| ${step.id} | ${step.mode} | ${expected} | ${actual} | ${step.status} |`);
      if (step.note) lines.push('', `> ${step.note}`, '');
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const cataloguePath = resolve(argument('--catalogue') ?? DEFAULT_CATALOGUE);
  const validatedGitSha = argument('--commit') ?? process.env.VALIDATED_GIT_SHA ?? 'UNBOUND';
  const catalogue = JSON.parse(await readFile(cataloguePath, 'utf8'));
  const record = buildVibrationWorkedExampleValidationRecord(catalogue);
  const execution = Object.freeze({ validatedGitSha, executedAt: new Date().toISOString() });
  const output = { ...record, execution };
  const jsonPath = argument('--json');
  const markdownPath = argument('--markdown');
  if (jsonPath) await writeFile(resolve(jsonPath), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  if (markdownPath) await writeFile(resolve(markdownPath), markdown(record, execution), 'utf8');
  if (!jsonPath && !markdownPath) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  const blocking = record.cases.filter((item) => item.status === 'FAIL');
  const strictBlocking = record.cases.filter((item) => ['REVIEW_REQUIRED', 'BLOCKED'].includes(item.status));
  if (blocking.length || (process.argv.includes('--strict') && strictBlocking.length)) process.exitCode = 2;
}

await main();
