import { isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveRepositoryPath(root, path) {
  if (typeof path !== 'string' || path.length === 0) throw new Error('MALFORMED_REPOSITORY_PATH');
  const repositoryRoot = resolve(root);
  const absolute = resolve(repositoryRoot, path);
  const remainder = relative(repositoryRoot, absolute);
  const escapes = remainder === '..'
    || remainder.startsWith(`..${sep}`)
    || isAbsolute(remainder);
  if (escapes) throw new Error(`REPOSITORY_PATH_ESCAPE:${path}`);
  return absolute;
}
