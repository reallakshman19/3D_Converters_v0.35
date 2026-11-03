import { spawnSync } from 'node:child_process';

const commands = [
  [process.execPath, ['--test', 'tests/hp-piping-class-real-workbench.test.mjs']],
  [process.execPath, ['--test', 'tests/hp-piping-class-workspace-controller.test.mjs']],
  [process.execPath, ['--test', 'tests/hp-piping-class-native-editors.test.mjs']],
  [process.execPath, ['--test', 'tests/hp-piping-class-orchestrator-parity.test.mjs']],
  [process.execPath, ['--test', 'tests/b313-chapter-ix-user-calculated-fatigue-product.test.mjs']],
  [process.execPath, ['--test', 'tests/hp-piping-class-master-controller.test.mjs']],
  [process.execPath, ['--test', 'tests/hp-piping-class-master-ownership.test.mjs']],
  [process.execPath, ['--test', 'tests/hp-piping-class-legacy-kd3-hard-block.test.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
