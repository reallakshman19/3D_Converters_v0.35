import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRvmAttributeScopeTree,
  countRvmAttributeScopeTree,
} from '../../tabs/model-converters/rvmattr-scope-tree-model.js';

const hierarchy = [
  {
    name: '/SITE-A/PIPE-1/BRAN-1',
    attributes: { OWNER_SITE: 'SITE-A', OWNER: '/SITE-A/PIPE-1' },
    children: [
      { type: 'PIPE', name: 'P-1', attributes: { REF: '=P1' } },
      {
        type: 'SUPPORT', attributes: { NAME: 'REST-1' }, children: [
          { type: 'MEMBER', attributes: { REF: '=M1' } },
        ],
      },
    ],
  },
  {
    name: '/SITE-A/PIPE-1/BRAN-2',
    attributes: { OWNER_SITE: 'SITE-A', OWNER: '/SITE-A/PIPE-1' },
    children: [{ type: 'VALV', attributes: { NAME: 'V-1' } }],
  },
];

const tree = buildRvmAttributeScopeTree(hierarchy);
assert.equal(tree.length, 1);
assert.equal(tree[0].id, 'site:SITE-A');
assert.equal(tree[0].children[0].id, 'owner:SITE-A/PIPE-1');
const branches = tree[0].children[0].children;
assert.deepEqual(branches.map((node) => node.id), [
  'branch:/SITE-A/PIPE-1/BRAN-1',
  'branch:/SITE-A/PIPE-1/BRAN-2',
]);
assert.deepEqual(branches[0].children.map((node) => node.label), ['P-1', 'REST-1']);
assert.equal(branches[0].children[1].children[0].label, '=M1');
assert.equal(branches[0].selectable, true);
assert.equal(branches[0].children[0].selectable, false);
assert.deepEqual(countRvmAttributeScopeTree(tree), {
  sites: 1, owners: 1, branches: 2, items: 4, total: 8,
});

const root = new URL('../../', import.meta.url);
const addon = await readFile(new URL(
  'tabs/model-converters/rvmattr-scope-tree-addon.js', root), 'utf8');
const shell = await readFile(new URL(
  'tabs/model-converters/ModelConvertersTab.js', root), 'utf8');
const indexSource = await readFile(new URL(
  'tabs/model-converters/index.js', root), 'utf8');
const shim = await readFile(new URL('tabs/model-converters-tab.js', root), 'utf8');

assert.match(addon, /Convert full scope/);
assert.match(addon, /data-rvm-tree-toggle/);
assert.match(addon, /parseRmssAttributes/);
assert.match(addon, /buildRvmAttributeScopeTree/);
assert.match(addon, /MutationObserver/);
assert.doesNotMatch(addon, /\.slice\(0\s*,\s*\d+/);
assert.match(shell, /installRvmAttrScopeTreeAddon/);
assert.match(shell, /rvmattr-scope-tree-addon\.js\?v=20260802-rvm-full-scope-tree-1/);
assert.match(indexSource, /20260802-rvm-full-scope-tree-1/);
assert.match(shim, /20260802-rvm-full-scope-tree-1/);

console.log('test-rvmattr-scope-tree: PASS');
