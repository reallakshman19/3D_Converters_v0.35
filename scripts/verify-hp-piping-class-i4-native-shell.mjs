import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
  '--test',
  'tests/hp-piping-class-native-shell.test.mjs',
], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
