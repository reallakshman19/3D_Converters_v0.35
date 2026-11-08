/**
 * Real source mutants against the engineering identity/metadata mapper.
 * No mocked guard predicates: replace the production source in an isolated
 * module tree, run unchanged synthetic-source witness tests, require each
 * named mutant to fail at its intended behavior.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const moduleName = 'xml-cii-final-rigid-source-context.js';
const source = readFileSync(join(root, 'tabs/xml-cii-2019-standalone', moduleName), 'utf8');
const witness = 'tests/xml-cii-final-rigid-source-context.test.mjs';
const mutations = [
  {
    name: 'branch-identity',
    needle: 'const candidates = edges.get(triple(element.branchName, element.fromNode, element.toNode)) || [];',
    replacement: 'const candidates = [...edges.values()].flat().filter((edge) => edge.from.number === element.fromNode && edge.to.number === element.toNode).slice(0, 1);',
    kill: 'BRANCH_SCOPE_WITNESS',
  },
  {
    name: 'geometry-reconciliation',
    needle: 'if (Math.abs(edge.lengthMm - Number(element.lengthMm)) > 0.03)',
    replacement: 'if (false)',
    kill: 'GEOMETRY_WITNESS',
  },
  {
    name: 'component-reference',
    needle: 'if (to.componentRefNo && weightBearing(to)) {',
    replacement: 'if (weightBearing(to)) {',
    kill: 'COMPONENT_REFERENCE_WITNESS',
  },
  {
    name: 'to-owner-cross-component',
    needle: 'if (from.componentRefNo && from.componentRefNo !== to.componentRefNo && weightBearing(from))',
    replacement: 'if (false && from.componentRefNo && from.componentRefNo !== to.componentRefNo && weightBearing(from))',
    kill: 'FROM_TO_OWNER_WITNESS',
  },
  {
    name: 'from-owner-fallback',
    needle: 'if (from.componentRefNo && weightBearing(from) && from.componentRefNo === to.componentRefNo)',
    replacement: 'if (false && from.componentRefNo && weightBearing(from) && from.componentRefNo === to.componentRefNo)',
    kill: 'FROM_TO_FALLBACK_WITNESS',
  },
  {
    name: 'rating-override',
    needle: 'const rating = observed(ratingAuth.rating || null, node.number, ratingAuth.resolvedSource,',
    replacement: 'const rating = observed(node.ratingRaw || null, node.number, ratingAuth.resolvedSource,',
    kill: 'RATING_OVERRIDE_WITNESS',
  },
  {
    name: 'dtxr-suppression',
    needle: "const dtxrValue = !dtxrResult?.suppressed ? clean(dtxrResult?.canonicalText) : '';",
    replacement: "const dtxrValue = clean(dtxrResult?.canonicalText);",
    kill: 'DTXR_SUPPRESSION_WITNESS',
  },
  {
    name: 'dtxr-suppression-autofill',
    needle: 'metadata.bore.value !== null && Boolean(metadata.rating.value) && !metadata.dtxr.suppressed',
    replacement: 'metadata.bore.value !== null && Boolean(metadata.rating.value)',
    kill: 'DTXR_SUPPRESSED_AUTOFILL_WITNESS',
  },
  {
    name: 'unknown-od-as-bore',
    needle: 'const nominalFromOd = qualifiedXmlCiiNominalBoreFromOd(node.odRaw);',
    replacement: 'const nominalFromOd = positive(node.odRaw);',
    kill: 'OD_DN_QUALIFICATION_WITNESS',
  },
  {
    name: 'dtxr-source-conflict',
    needle: "[['bore', 'boreRaw'], ['rating', 'ratingRaw'], ['dtxr', 'dtxrRaw']]",
    replacement: "[['bore', 'boreRaw'], ['rating', 'ratingRaw']]",
    kill: 'DTXR_CONFLICT_WITNESS',
  },
  {
    name: 'ambiguous-component-owner',
    needle: 'if (matches.length > 1)',
    replacement: 'if (false)',
    kill: 'COMPONENT_AMBIGUITY_WITNESS',
  },
  {
    name: 'dtxr-rating-conflict',
    needle: "if (metadata.rating.conflict) conflicts.push('RATING_CONFLICT');",
    replacement: "if (false && metadata.rating.conflict) conflicts.push('RATING_CONFLICT');",
    kill: 'RATING_CONFLICT',
  },
];

function runModified(modifiedSource) {
  const temp = mkdtempSync(join(tmpdir(), 'cii-r1-context-mutant-'));
  try {
    const tabDir = join(temp, 'tabs/xml-cii-2019-standalone');
    const testsDir = join(temp, 'tests');
    mkdirSync(tabDir, { recursive: true });
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(temp, 'package.json'), '{"type":"module"}\n');
    symlinkSync(join(root, 'converters'), join(temp, 'converters'));
    symlinkSync(join(root, 'tests/helpers'), join(testsDir, 'helpers'));
    symlinkSync(join(root, 'tabs/xml-cii-2019-standalone/ui-adapted'), join(tabDir, 'ui-adapted'));
    symlinkSync(join(root, 'tabs/xml-cii-2019-standalone/xml-cii-final-property-editor-ui.js'), join(tabDir, 'xml-cii-final-property-editor-ui.js'));
    copyFileSync(join(root, witness), join(testsDir, 'xml-cii-final-rigid-source-context.test.mjs'));
    copyFileSync(join(root, 'tabs/xml-cii-2019-standalone/xml-cii-final-rigid-master-references.js'),
      join(tabDir, 'xml-cii-final-rigid-master-references.js'));
    copyFileSync(join(root, 'tabs/xml-cii-2019-standalone/xml-cii-final-rigid-nearest-suggestions.js'),
      join(tabDir, 'xml-cii-final-rigid-nearest-suggestions.js'));
    copyFileSync(join(root, 'tabs/xml-cii-2019-standalone/xml-cii-final-rigid-context-fallback.js'),
      join(tabDir, 'xml-cii-final-rigid-context-fallback.js'));
    writeFileSync(join(tabDir, moduleName), modifiedSource);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_')));
    const result = spawnSync(process.execPath, [
      '--test', join(testsDir, 'xml-cii-final-rigid-source-context.test.mjs'),
    ], { cwd: temp, env, encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
    return { exit: result.status, output: (result.stdout || '') + '\n' + (result.stderr || '') };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

test('source metadata mutation baseline: unmodified real mapper passes', { timeout: 90000 }, () => {
  const run = runModified(source);
  assert.equal(run.exit, 0, 'Unmodified mapping witness suite must be GREEN.\n' + run.output.slice(-3000));
});

for (const mutation of mutations) {
  test('source metadata safety mutation KILLED: ' + mutation.name, { timeout: 90000 }, () => {
    assert.equal(source.split(mutation.needle).length, 2, 'Missing/duplicate source mutation anchor ' + mutation.name);
    const run = runModified(source.replace(mutation.needle, mutation.replacement));
    assert.notEqual(run.exit, 0, 'MUTANT SURVIVED ' + mutation.name);
    assert.match(run.output, /not ok \d+ - /,
      'Mutation must cause a test failure, not just a node process crash.\n' + run.output.slice(-3000));
    assert.ok(run.output.includes(mutation.kill),
      'Mutation must fail its named engineering witness ' + mutation.kill + '\n' + run.output.slice(-3000));
    console.log('KILLED SOURCE METADATA MUTANT', mutation.name, 'by', mutation.kill);
  });
}
