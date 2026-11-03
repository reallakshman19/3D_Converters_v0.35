import { spawnSync } from 'node:child_process';

const commands = [
  [process.execPath, ['scripts/audit-b313-ch9-kd3-oracle.mjs']],
  [process.execPath, ['scripts/audit-b313-ch9-kd320-q1.mjs']],
  [process.execPath, ['--test', 'tests/b313-chapter-ix-kd3-qualification-oracle.test.mjs']],
  [process.execPath, ['--test', 'tests/b313-chapter-ix-kd320-q1-contract.test.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
