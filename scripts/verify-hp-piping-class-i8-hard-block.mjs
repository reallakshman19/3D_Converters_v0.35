import { spawnSync } from 'node:child_process';

const tests = [
  'tests/hp-piping-class-legacy-kd3-hard-block.test.mjs',
  'tests/hp-piping-class-legacy-kd3-script-order.test.mjs',
  'tests/b313-chapter-ix-fatigue-ui-authority.test.mjs',
  'tests/b313-chapter-ix-user-calculated-fatigue-product.test.mjs',
  'tests/hp-piping-class-native-editors.test.mjs',
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
