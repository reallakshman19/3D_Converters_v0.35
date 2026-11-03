import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourceXmlPath = resolve(repoRoot, 'Benchmarks/EF-05-PRO.TEST.xml');
const enrichedXmlPath = resolve(repoRoot, 'Benchmarks/EF-05-PRO.TEST_enriched-3.xml');

function readFixture(path) {
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
}

function text(block, tag) {
  const match = String(block || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return String(match?.[1] || '').replace(/<[^>]+>/g, '').trim();
}

function numeric(value) {
  const number = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function branchBlocks(xml) {
  return String(xml || '').match(/<Branch\b[\s\S]*?<\/Branch>/gi) || [];
}

function nodeBlocks(xml) {
  return String(xml || '').match(/<Node\b[\s\S]*?<\/Node>/gi) || [];
}

function normalizedRef(value) {
  return String(value || '').replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
}

function splitRigidGroups(xml) {
  const groups = new Map();
  for (const branch of branchBlocks(xml)) {
    const branchName = text(branch, 'Branchname');
    for (const node of nodeBlocks(branch)) {
      const componentType = text(node, 'ComponentType').toUpperCase();
      if (componentType !== 'FLAN' && componentType !== 'RIGID') continue;
      const ref = normalizedRef(text(node, 'ComponentRefNo'));
      if (!ref) continue;
      const key = `${branchName}::${ref}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        branchName,
        componentType,
        componentRefNo: text(node, 'ComponentRefNo'),
        nodeNumber: text(node, 'NodeNumber'),
        endpoint: text(node, 'Endpoint'),
        weight: numeric(text(node, 'Weight')),
      });
    }
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

test('EF-05 source benchmark reproduces zero OutsideDiameter input condition', () => {
  const sourceXml = readFixture(sourceXmlPath);
  assert.match(sourceXml, /<OutsideDiameter>\s*0\s*<\/OutsideDiameter>/, 'source fixture must contain zero OutsideDiameter values so the regression is meaningful');
});

test('EF-05 enriched benchmark has no unresolved zero OutsideDiameter nodes', () => {
  const enrichedXml = readFixture(enrichedXmlPath);
  const unresolved = [...enrichedXml.matchAll(/<OutsideDiameter>\s*0\s*<\/OutsideDiameter>/gi)].length;
  assert.equal(unresolved, 0, 'enriched XML must not contain unresolved <OutsideDiameter>0</OutsideDiameter> nodes');
});

test('EF-05 enriched benchmark has no mixed split FLAN/RIGID weight groups', () => {
  const enrichedXml = readFixture(enrichedXmlPath);
  const groups = splitRigidGroups(enrichedXml);
  assert.ok(groups.length > 0, 'fixture should contain split FLAN/RIGID groups');
  const mixed = groups.filter((group) => {
    const positives = group.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
    const zeros = group.filter((item) => !Number.isFinite(item.weight) || Math.abs(item.weight || 0) <= 1e-12);
    return positives.length > 0 && zeros.length > 0;
  });
  assert.deepEqual(mixed, [], 'if any split FLAN/RIGID sibling has a positive reviewed weight, zero-weight siblings in the same ComponentRefNo group must also be populated');
});
