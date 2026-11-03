import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

export async function domainHash(domain, value) {
  return sha256Hex(`${domain}\0${canonicalJson(value)}`);
}

export async function artifactWithId(schema, prefix, body) {
  const artifactId = `${prefix}:${await domainHash(schema, body)}`;
  return deepFreeze({ schema, artifactId, ...body });
}

export async function evidenceId(domain, prefix, body) {
  return `${prefix}:${await domainHash(domain, body)}`;
}
