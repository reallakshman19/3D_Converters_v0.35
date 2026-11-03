import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = [
  'tests/hp-piping-class-project-schema.test.mjs',
  'tests/hp-piping-class-orchestrator-contract.test.mjs',
  'tests/hp-piping-class-orchestrator-parity.test.mjs',
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
