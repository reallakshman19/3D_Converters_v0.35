/**
 * Immutable R1 input custody. This is the already-enriched ENGINE INPUT,
 * not the original uploaded XML and not the Python post-processed document.
 * Explicitly reject inferred/partial configuration and unverifiable custody.
 */
const encode = new TextEncoder();
const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('ROUNDTRIP_SNAPSHOT_MISSING_' + name);
  return value;
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const frozen = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) frozen(member);
    Object.freeze(value);
  }
  return value;
};
export async function roundtripSha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('ROUNDTRIP_SHA256_UNAVAILABLE');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encode.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function byteLength(value) { return encode.encode(value).length; }

export async function createRoundtripSnapshot(input = {}) {
  const originalXmlText = required(input.originalXmlText, 'ORIGINAL_XML');
  const engineInputText = required(input.engineInputText, 'ENGINE_INPUT_XML');
  const originalCiiText = required(input.originalCiiText, 'ORIGINAL_CII');
  const supportConfigJson = required(input.supportConfigJson, 'EFFECTIVE_CONFIG');
  const engineIdentity = required(input.engineIdentity, 'ENGINE_IDENTITY');
  const runIdentity = required(input.runIdentity, 'RUN_IDENTITY');
  const sourceName = required(input.sourceName, 'SOURCE_NAME');
  if (!Object.hasOwn(input, 'stagedJsonText') || typeof input.stagedJsonText !== 'string')
    throw new Error('ROUNDTRIP_SNAPSHOT_MISSING_STAGED_JSON_CUSTODY');
  if (!input.options || typeof input.options !== 'object' || Array.isArray(input.options))
    throw new Error('ROUNDTRIP_SNAPSHOT_MISSING_EFFECTIVE_OPTIONS');
  const config = JSON.parse(supportConfigJson);
  if (!config || Array.isArray(config) || typeof config !== 'object')
    throw new Error('ROUNDTRIP_SNAPSHOT_INVALID_CONFIG');
  const options = copy(input.options);
  if (options.analyzeTopology === true || options.generateTopoFix === true || options.useTopoFixForCii === true)
    throw new Error('ROUNDTRIP_TOPOFIX_REPLAY_NOT_QUALIFIED');
  if (typeof options.kgToNewton !== 'boolean')
    throw new Error('ROUNDTRIP_WEIGHT_SCALE_NOT_PINNED');
  const stagedJsonText = input.stagedJsonText;
  const effectiveOptionsJson = JSON.stringify(options);
  const hashes = {
    originalXmlSha256: await roundtripSha256(originalXmlText),
    engineInputSha256: await roundtripSha256(engineInputText),
    originalCiiSha256: await roundtripSha256(originalCiiText),
    configSha256: await roundtripSha256(supportConfigJson),
    stagedJsonSha256: await roundtripSha256(stagedJsonText),
    optionsSha256: await roundtripSha256(effectiveOptionsJson),
  };
  const fingerprint = await roundtripSha256(JSON.stringify({
    runIdentity, sourceName, engineIdentity, ...hashes,
  }));
  return frozen({
    schema: 'xml-cii-roundtrip-snapshot/v1',
    runIdentity, sourceName, engineIdentity,
    originalXmlText, engineInputText, originalCiiText,
    supportConfigJson, stagedJsonText, options, hashes, fingerprint,
    weightScale: options.kgToNewton === false ? 1 : 10,
    ciiByteLength: byteLength(originalCiiText),
    canonicalEditStage: 'ENGINE_INPUT_XML',
    qualification: 'NOT_YET_REPLAY_VERIFIED',
  });
}

export async function verifyRoundtripSnapshotCustody(snapshot) {
  if (snapshot?.schema !== 'xml-cii-roundtrip-snapshot/v1') throw new Error('ROUNDTRIP_INVALID_SNAPSHOT');
  const pairs = [
    ['originalXmlText', 'originalXmlSha256'],
    ['engineInputText', 'engineInputSha256'],
    ['originalCiiText', 'originalCiiSha256'],
    ['supportConfigJson', 'configSha256'],
    ['stagedJsonText', 'stagedJsonSha256'],
  ];
  for (const [field, digest] of pairs) {
    if (await roundtripSha256(snapshot[field]) !== snapshot.hashes[digest])
      throw new Error('ROUNDTRIP_STALE_' + field.toUpperCase());
  }
  if (await roundtripSha256(JSON.stringify(snapshot.options)) !== snapshot.hashes.optionsSha256)
    throw new Error('ROUNDTRIP_STALE_OPTIONS');
  const fingerprint = await roundtripSha256(JSON.stringify({
    runIdentity: snapshot.runIdentity, sourceName: snapshot.sourceName,
    engineIdentity: snapshot.engineIdentity, ...snapshot.hashes,
  }));
  if (fingerprint !== snapshot.fingerprint) throw new Error('ROUNDTRIP_STALE_FINGERPRINT');
  return true;
}
