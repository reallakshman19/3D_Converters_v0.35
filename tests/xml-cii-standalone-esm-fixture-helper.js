const fs = require('fs');
const os = require('os');
const path = require('path');

const STATIC_IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?(['"])([^'"]+)\1\s*;?/g;
const STATIC_EXPORT_RE = /(?:^|\n)\s*export\s+(?:\*|\{[\s\S]*?\})\s+from\s+(['"])([^'"]+)\1\s*;?/g;

function normalizeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function withoutQueryOrHash(specifier) {
  return String(specifier || '').replace(/[?#].*$/, '');
}

function candidateModulePaths(repoRoot, importerPath, specifier) {
  const cleanSpecifier = withoutQueryOrHash(specifier);
  const absoluteBase = path.resolve(repoRoot, path.dirname(importerPath), cleanSpecifier);
  return [absoluteBase, `${absoluteBase}.js`, path.join(absoluteBase, 'index.js')];
}

function resolveStaticModule(repoRoot, importerPath, specifier) {
  if (!String(specifier || '').startsWith('.')) return null;
  for (const candidate of candidateModulePaths(repoRoot, importerPath, specifier)) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const relative = normalizeRelativePath(path.relative(repoRoot, candidate));
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
      throw new Error(`Static ESM dependency escapes repository root: ${specifier} from ${importerPath}`);
    }
    return relative;
  }
  throw new Error(`Static ESM dependency not found: ${specifier} from ${importerPath}`);
}

function collectSpecifiers(pattern, sourceText, output) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(sourceText))) output.push(match[2]);
}

function staticModuleSpecifiers(sourceText) {
  const source = String(sourceText || '');
  const specifiers = [];
  collectSpecifiers(STATIC_IMPORT_RE, source, specifiers);
  collectSpecifiers(STATIC_EXPORT_RE, source, specifiers);
  return [...new Set(specifiers)];
}

function collectStaticEsmDependencyClosure(repoRoot, entryFiles) {
  const queue = [...new Set((entryFiles || []).map(normalizeRelativePath).filter(Boolean))];
  const visited = new Set();

  while (queue.length) {
    const relativePath = queue.shift();
    if (visited.has(relativePath)) continue;
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`ESM fixture entry not found: ${relativePath}`);
    }

    visited.add(relativePath);
    const sourceText = fs.readFileSync(absolutePath, 'utf8');
    for (const specifier of staticModuleSpecifiers(sourceText)) {
      const dependency = resolveStaticModule(repoRoot, relativePath, specifier);
      if (dependency && !visited.has(dependency)) queue.push(dependency);
    }
  }

  return [...visited].sort();
}

function copyFiles(repoRoot, tempRoot, files) {
  for (const relativePath of files) {
    const sourcePath = path.join(repoRoot, relativePath);
    const targetPath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function createStaticEsmFixture(repoRoot, options = {}) {
  const prefix = String(options.prefix || 'xml-cii-esm-fixture-');
  const files = collectStaticEsmDependencyClosure(repoRoot, options.entryFiles || []);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
  copyFiles(repoRoot, tempRoot, files);
  return { tempRoot, files };
}

module.exports = {
  collectStaticEsmDependencyClosure,
  createStaticEsmFixture,
  staticModuleSpecifiers,
};
