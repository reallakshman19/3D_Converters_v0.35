const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { execFileSync } = require('child_process');
const { root } = require('./universal-enrichment-workbench-test-helpers.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function relative(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function read(file) { return fs.readFileSync(file, 'utf8'); }

function functionLengths(source) {
  const lines = source.split('\n');
  const lengths = [];
  lines.forEach((line, index) => {
    if (!/^(?:export\s+)?(?:async\s+)?function\s+\w+/.test(line.trim())) return;
    let depth = 0;
    let started = false;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      for (const char of lines[cursor]) {
        if (char === '{') { depth += 1; started = true; }
        if (char === '}') depth -= 1;
      }
      if (started && depth === 0) { lengths.push({ line: index + 1, length: cursor - index + 1 }); break; }
    }
  });
  return lengths;
}

const moduleRoot = path.join(root, 'tabs', 'universal-enrichment-workbench');
const moduleFiles = [...walk(moduleRoot).filter((file) => file.endsWith('.js')), path.join(root, 'tabs', 'universal-enrichment-workbench-tab.js')];

test('UEW module has no forbidden imports, runtime references or persistence keys', () => {
  const forbidden = [
    'xml-cii', 'runXmlCii2019Workflow', 'xmlCiiDryRunPreview', 'InputXmlCii2019',
    'inputxml_to_cii2019', 'Pyodide', 'Uxml', 'uxml/', 'model-converters/',
  ];
  for (const file of moduleFiles) {
    const source = read(file);
    for (const token of forbidden) assert(!source.includes(token), `${relative(file)} contains forbidden token ${token}`);
    assert(!/localStorage/i.test(source), `${relative(file)} must not access localStorage`);
  }
});

test('UEW-001 tab registration remains isolated and lazy-loaded', () => {
  const runtime = read(path.join(root, 'core', 'app-standalone-runtime.js'));
  assert(runtime.includes("['universal-enrichment-workbench', 'universal-enrichment-workbench']"));
  assert(runtime.includes("id: 'universal-enrichment-workbench', label: 'Universal Enrichment Workbench'"));
  assert(runtime.includes("import('../tabs/universal-enrichment-workbench-tab.js?v=uew-001')"));
  assert(runtime.includes("pickRenderer(module, 'renderUniversalEnrichmentWorkbenchTab', 'universal-enrichment-workbench')"));
});

test('UEW JavaScript satisfies line, function, syntax and import constraints', () => {
  for (const file of moduleFiles) {
    const source = read(file);
    assert(source.split('\n').length < 300, `${relative(file)} exceeds 300 lines`);
    for (const item of functionLengths(source)) assert(item.length <= 40, `${relative(file)} function at line ${item.line} is ${item.length} lines`);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      assert(fs.existsSync(target), `${relative(file)} has dangling import ${match[1]}`);
    }
  }
});

test('working changes remain inside UEW-002 allowed paths', () => {
  const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const changed = [...new Set([...tracked, ...untracked])].filter((file) => !file.startsWith('.backups/'));
  const allowed = changed.every((file) => file.startsWith('tabs/universal-enrichment-workbench/')
    || /^tests\/universal-enrichment-workbench-.*\.test\.js$/.test(file)
    || file === 'tests/universal-enrichment-workbench-test-helpers.js'
    || file === '.github/workflows/uew-protected-regression.yml');
  assert(allowed, `Out-of-scope files changed: ${changed.join(', ')}`);
});
