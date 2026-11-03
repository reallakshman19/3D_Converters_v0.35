import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/benchmark-audit/audit-utils.js';
import { evaluateExactHeadEvidence } from '../../tabs/model-converters/converters/fbx/benchmark-audit/exact-head-evidence.js';
import { observeRepositoryExactHeadIdentity } from '../../tabs/model-converters/converters/fbx/benchmark-audit/exact-head-observer.js';

const authorityPath = process.argv[2], specPath = process.argv[3];
if (!authorityPath || !specPath) throw new Error('Usage: node scripts/fbx/build-agent-q-exact-head-evidence.mjs <authority.json> <observation-spec.json> [output.json]');
const outputPath = resolve(process.argv[4] || '.qualification/fbx-benchmark/FbxExactHeadEvaluation.v3.json');
const authority = JSON.parse(await readFile(resolve(authorityPath), 'utf8'));
const spec = JSON.parse(await readFile(resolve(specPath), 'utf8'));
const observed = await observeRepositoryExactHeadIdentity(spec, { rootPath: process.cwd() });
const evaluation = evaluateExactHeadEvidence({ schema:'FbxExactHeadEvidence.v3', authority, observed,
  regressionStatus:process.env.FBX_REGRESSION_STATUS || 'BLOCKED', determinismStatus:process.env.FBX_DETERMINISM_STATUS || 'BLOCKED' });
await mkdir(dirname(outputPath), { recursive:true });
await writeFile(outputPath, canonicalJson(evaluation), 'utf8');
console.log(outputPath);
