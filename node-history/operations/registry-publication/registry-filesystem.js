import fs from 'node:fs/promises';
import path from 'node:path';

export function createNodeFileSystemAdapter(overrides = {}) {
  const adapter = {
    readFile: (filePath) => readFileNoFollow(filePath),
    writeFileExclusive: (filePath, bytes) => writeExclusive(filePath, bytes),
    createDirectoryExclusive: (directory) => createExclusiveDirectory(directory),
    listFiles: (directory) => listFiles(directory),
    removeTree: (directory, expectedCanonical = '') => removeOwnedTree(directory, expectedCanonical),
    resolveCustodyPath: (target, options) => resolveCustodyPath(target, options),
    exists: (target) => exists(target),
    ...overrides,
  };
  return Object.freeze(adapter);
}

async function readFileNoFollow(filePath) {
  await resolveCustodyPath(filePath, { mustExist: true, expectedType: 'file' });
  return fs.readFile(filePath);
}

async function writeExclusive(filePath, bytes) {
  await ensureDirectory(path.dirname(filePath));
  await resolveCustodyPath(filePath, { mustExist: false, expectedType: 'file' });
  await fs.writeFile(filePath, bytes, { flag: 'wx' });
}

async function createExclusiveDirectory(directory) {
  await resolveCustodyPath(path.dirname(directory), { mustExist: true, expectedType: 'directory' });
  await resolveCustodyPath(directory, { mustExist: false, expectedType: 'directory' });
  await fs.mkdir(directory, { recursive: false });
  return resolveCustodyPath(directory, { mustExist: true, expectedType: 'directory' });
}

async function ensureDirectory(directory) {
  if (await exists(directory)) {
    await resolveCustodyPath(directory, { mustExist: true, expectedType: 'directory' });
    return;
  }
  const parent = path.dirname(directory);
  if (parent === directory) throw operationError('CUSTODY_DIRECTORY_CREATE_FAILED', directory);
  await ensureDirectory(parent);
  await fs.mkdir(directory, { recursive: false });
  await resolveCustodyPath(directory, { mustExist: true, expectedType: 'directory' });
}

async function listFiles(directory) {
  await resolveCustodyPath(directory, { mustExist: true, expectedType: 'directory' });
  const output = [];
  await walk(directory, directory, output);
  return output.sort();
}

async function walk(root, current, output) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw operationError('SYMBOLIC_LINK_PROHIBITED', absolute);
    if (entry.isDirectory()) await walk(root, absolute, output);
    else if (entry.isFile()) output.push(toPosix(path.relative(root, absolute)));
    else throw operationError('UNSUPPORTED_FILESYSTEM_ENTRY', absolute);
  }
}

async function resolveCustodyPath(target, options = {}) {
  const resolved = path.resolve(String(target ?? ''));
  if (!path.isAbsolute(String(target ?? ''))) throw operationError('CUSTODY_PATH_NOT_ABSOLUTE', resolved);
  const parsed = path.parse(resolved);
  const segments = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean);
  let current = parsed.root;
  let canonical = await fs.realpath(parsed.root);
  for (let index = 0; index < segments.length; index += 1) {
    const next = path.join(current, segments[index]);
    const inspected = await inspectComponent(next, index === segments.length - 1, options);
    if (!inspected.exists) {
      const remainder = segments.slice(index);
      return path.join(canonical, ...remainder);
    }
    current = next;
    canonical = await fs.realpath(next);
  }
  return canonical;
}

async function inspectComponent(target, leaf, options) {
  let stats;
  try {
    stats = await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT' && !options.mustExist) return { exists: false };
    throw error;
  }
  if (stats.isSymbolicLink()) throw operationError('SYMBOLIC_LINK_PROHIBITED', target);
  if (!leaf && !stats.isDirectory()) throw operationError('CUSTODY_ANCESTOR_NOT_DIRECTORY', target);
  if (leaf && options.expectedType === 'directory' && !stats.isDirectory()) throw operationError('CUSTODY_ROOT_NOT_DIRECTORY', target);
  if (leaf && options.expectedType === 'file' && !stats.isFile()) throw operationError('CUSTODY_TARGET_NOT_FILE', target);
  return { exists: true };
}

async function removeOwnedTree(directory, expectedCanonical = '') {
  if (!expectedCanonical) throw operationError('CUSTODY_OWNERSHIP_CLAIM_REQUIRED', directory);
  if (!await exists(directory)) return;
  const canonical = await resolveCustodyPath(directory, { mustExist: true, expectedType: 'directory' });
  if (path.resolve(canonical) !== path.resolve(expectedCanonical)) {
    throw operationError('CUSTODY_ROOT_CHANGED', directory);
  }
  await fs.rm(canonical, { recursive: true, force: false });
}

async function exists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function operationError(code, target) {
  const error = new Error(`${code}: ${target}`);
  error.code = code;
  error.evidence = { target };
  return error;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
