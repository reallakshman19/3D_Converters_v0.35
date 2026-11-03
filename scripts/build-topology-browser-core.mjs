/**
 * Builds the self-contained browser ESM topology producer and its pin manifest.
 * Inputs are explicit output paths. Outputs are deterministic bundle bytes and
 * a SHA-256 manifest; failures are raised with the exact source/output context.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundleArgument = process.argv[2];
const manifestArgument = process.argv[3];
if (!bundleArgument || !manifestArgument) {
  throw new TypeError('Usage: node scripts/build-topology-browser-core.mjs <bundle-output> <manifest-output>');
}

const entryPath = resolve(repositoryRoot, 'tabs/model-converters/converters/component-topology/topology-browser-core.js');
const bundlePath = resolve(repositoryRoot, bundleArgument);
const manifestPath = resolve(repositoryRoot, manifestArgument);
mkdirSync(dirname(bundlePath), { recursive: true });
mkdirSync(dirname(manifestPath), { recursive: true });

await build({
  entryPoints: [entryPath],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  legalComments: 'none',
  sourcemap: false,
  minify: false,
  treeShaking: true,
  logLevel: 'info',
});

const bundleBytes = readFileSync(bundlePath);
const bundleSha256 = createHash('sha256').update(bundleBytes).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const manifest = {
  schema: 'TopologyBrowserCorePin.v1',
  sourceRepository: 'reallaksh19/3D_Converters',
  sourceCommit,
  entryPath: 'tabs/model-converters/converters/component-topology/topology-browser-core.js',
  bundleFile: 'topology-browser-core.mjs',
  bundleSha256: `sha256:${bundleSha256}`,
  exportedContract: 'TopologyBrowserCore.v1',
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Topology browser core: ${bundlePath}`);
console.log(`Bundle pin: sha256:${bundleSha256}`);
