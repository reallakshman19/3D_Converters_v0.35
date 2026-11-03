import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await access(resolve(root, '.nojekyll'));

const manifest = JSON.parse(await readFile(resolve(root, 'converters/inputxml-runtime-manifest.json'), 'utf8'));
const initializer = manifest.assets.find((asset) => asset.url === '../scripts/inputxml_compiler/__init__.py');
assert(initializer, 'InputXML runtime manifest must include the compiler package initializer.');
await access(resolve(root, 'scripts/inputxml_compiler/__init__.py'));
assert.equal(initializer.target, '/repo/scripts/inputxml_compiler/__init__.py');
assert.match(initializer.sha256, /^[a-f0-9]{64}$/);

console.log('InputXML Pages runtime publication contract passed');
