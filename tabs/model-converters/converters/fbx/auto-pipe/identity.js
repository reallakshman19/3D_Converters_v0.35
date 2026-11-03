import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

export function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareOccurrenceId(left, right) {
  const a = String(left).replace(/^occ:/, ''), b = String(right).replace(/^occ:/, '');
  try {
    const av = BigInt(a), bv = BigInt(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  } catch {
    return compareText(left, right);
  }
}

export async function profileHash(profile) {
  return sha256Hex(`fbx-auto-pipe-profile\0${canonicalJson(profile)}`);
}

export async function deterministicId(prefix, domain, value) {
  const digest = await sha256Hex(`${domain}\0${canonicalJson(value)}`);
  return `${prefix}-${digest}`;
}

export function splitEndpoint(value) {
  const text = String(value || ''), split = text.lastIndexOf(':');
  if (split <= 0 || split === text.length - 1) {
    throw new Error(`BLOCKED_AUTO_PIPE_CONNECTIVITY invalid endpoint ${text}.`);
  }
  return { mappingEntryId: text.slice(0, split), portId: text.slice(split + 1) };
}
