import { spawnSync } from 'node:child_process';

const tests = [
  'tests/hp-piping-class-master-docs-ingestion.test.mjs',
  'tests/hp-piping-class-master-runtime.test.mjs',
  'tests/hp-piping-class-master-zero-temperature.test.mjs',
  'tests/hp-piping-class-master-controller.test.mjs',
  'tests/hp-piping-class-master-ownership.test.mjs',
  'tests/hp-piping-class-workspace-controller.test.mjs',
  'tests/hp-piping-class-native-editors.test.mjs',
  'tests/hp-piping-class-orchestrator-parity.test.mjs',
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
