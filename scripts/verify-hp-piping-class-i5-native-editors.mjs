import { spawnSync } from 'node:child_process';

const tests = [
  'tests/hp-piping-class-project-schema.test.mjs',
  'tests/hp-piping-class-orchestrator-contract.test.mjs',
  'tests/hp-piping-class-orchestrator-parity.test.mjs',
  'tests/hp-piping-class-native-shell.test.mjs',
  'tests/hp-piping-class-workspace-controller.test.mjs',
  'tests/hp-piping-class-native-editors.test.mjs',
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
