const ALLOWED_AUTHORITIES = new Set(['EXPLICIT_SOURCE_REFERENCE', 'APPROVED_HOST_MANIFEST']);

function blocked(reason) {
  return { state: 'BLOCKED', hostIdentity: null, authority: null, candidateHostIdentities: [], reason };
}

function validateResolution(result) {
  if (!result || typeof result !== 'object') return blocked('HOST_RESOLVER_INVALID_RESULT');
  if (!['RESOLVED', 'ORPHAN', 'AMBIGUOUS', 'NOT_APPLICABLE', 'BLOCKED'].includes(result.state)) return blocked('HOST_RESOLVER_INVALID_STATE');
  if (result.state === 'RESOLVED' && (typeof result.hostIdentity !== 'string' || !result.hostIdentity)) return blocked('HOST_IDENTITY_REQUIRED');
  if (result.state === 'RESOLVED' && !ALLOWED_AUTHORITIES.has(result.authority)) return blocked('HOST_AUTHORITY_NOT_APPROVED');
  return { state: result.state, hostIdentity: result.hostIdentity ?? null, authority: result.authority ?? null, candidateHostIdentities: Array.isArray(result.candidateHostIdentities) ? [...result.candidateHostIdentities].map(String).sort() : [], reason: result.reason ?? null };
}

function resolveHost(record, side, resolver, required) {
  if (typeof resolver !== 'function') return required ? blocked('HOST_RESOLVER_REQUIRED') : { state: 'NOT_APPLICABLE', hostIdentity: null, authority: null, candidateHostIdentities: [], reason: null };
  try { return validateResolution(resolver({ record, side })); }
  catch (error) { return blocked(`HOST_RESOLVER_ERROR:${error instanceof Error ? error.message : String(error)}`); }
}

function resultState(reference, actual) {
  if ([reference.state, actual.state].includes('BLOCKED') || [reference.state, actual.state].includes('AMBIGUOUS')) return 'BLOCKED';
  if ([reference.state, actual.state].includes('ORPHAN')) return 'ORPHAN';
  if (reference.state === 'NOT_APPLICABLE' && actual.state === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (reference.state !== 'RESOLVED' || actual.state !== 'RESOLVED') return 'BLOCKED';
  if (reference.authority !== actual.authority) return 'BLOCKED';
  return reference.hostIdentity === actual.hostIdentity ? 'PASS' : 'FAIL';
}

export function compareSupportHost(referenceRecord, actualRecord, resolver, required) {
  const reference = resolveHost(referenceRecord, 'reference', resolver, required);
  const actual = resolveHost(actualRecord, 'actual', resolver, required);
  return Object.freeze({
    authorityMode: reference.authority && reference.authority === actual.authority ? reference.authority : null,
    referenceHostIdentity: reference.hostIdentity,
    actualHostIdentity: actual.hostIdentity,
    referenceState: reference.state,
    actualState: actual.state,
    candidateHostIdentities: [...new Set([...reference.candidateHostIdentities, ...actual.candidateHostIdentities])].sort(),
    reasons: [reference.reason, actual.reason].filter(Boolean),
    state: resultState(reference, actual),
  });
}
