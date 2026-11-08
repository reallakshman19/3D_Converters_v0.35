/**
 * Immutable, run-pinned input custody for the first XML -> CII replay gate.
 * This is not the original upload: engineInputText is the EXACT XML supplied
 * to the standalone Python engine after JS parity enrichment.
 */
import { ciiSha256 } from '../xml-cii-final-property-reader.js';

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('ROUNDTRIP_SNAPSHOT_MISSING_' + name);
  return value;
}
function safeObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ROUNDTRIP_SNAPSHOT_INVALID_' + name);
  const copy = JSON.parse(JSON.stringify(value));
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) throw new Error('ROUNDTRIP_SNAPSHOT_INVALID_' + name);
  return Object.freeze(copy);
}
function parseConfig(value) {
  const raw = requireText(value, 'EFFECTIVE_CONFIG');
  try {
    const parsed = JSON.parse(raw);
    safeObject(parsed, 'EFFECTIVE_CONFIG');
  } catch {
    throw new Error('ROUNDTRIP_SNAPSHOT_INVALID_EFFECTIVE_CONFIG');
  }
  return raw;
}

/**
 * Caller must supply the *effective*, post-override config used for original
 * CII conversion. Never reconstruct it from current UI state.
 * engineIdentity is an externally verified exact code/version fingerprint,
 * NOT inferred from a user-supplied filename.
 */
export async function createRoundtripSnapshot(input) {
  const runIdentity = requireText(input?.runIdentity, 'RUN_IDENTITY');
  const engineIdentity = requireText(input?.engineIdentity, 'ENGINE_IDENTITY');
  const engineInputText = requireText(input?.engineInputText, 'ENGINE_INPUT');
  const originalCiiText = requireText(input?.originalCiiText, 'ORIGINAL_CII');
  const supportConfigJson = parseConfig(input?.supportConfigJson);
  const sourceName = requireText(input?.sourceName, 'SOURCE_NAME');
  if (input?.sourceKind !== 'xml') throw new Error('ROUNDTRIP_SNAPSHOT_SOURCE_KIND_NOT_SUPPORTED');
  const originalOptions = safeObject(input.options, 'EFFECTIVE_OPTIONS');
  // TopoFix can substitute a different input XML for the writer. Until that
  // post-TopoFix artifact is frozen, the replay source is not authoritative.
  if (originalOptions.useTopoFixForCii === true) throw new Error('ROUNDTRIP_SNAPSHOT_TOPOFIX_INPUT_NOT_CAPTURED');
  const options = Object.freeze({ ...originalOptions, outputMode: 'cii-only' });
  const stagedJsonText = typeof input.stagedJsonText === 'string' ? input.stagedJsonText : '';
  const sourceXmlText = typeof input.sourceXmlText === 'string' ? input.sourceXmlText : null;
  const snapshot = {
    schema: 'xml-cii-roundtrip-snapshot/v1',
    runIdentity, engineIdentity, sourceKind: 'xml', sourceName,
    engineInputText, originalCiiText, supportConfigJson,
    stagedJsonText, sourceXmlText, options,
    manifest: Object.freeze({
      engineInputSha256: await ciiSha256(engineInputText),
      originalCiiSha256: await ciiSha256(originalCiiText),
      effectiveConfigSha256: await ciiSha256(supportConfigJson),
      stagedJsonSha256: await ciiSha256(stagedJsonText),
      upstreamSourceSha256: sourceXmlText === null ? null : await ciiSha256(sourceXmlText),
      optionsSha256: await ciiSha256(JSON.stringify(options)),
      weightScale: options.kgToNewton === false ? 1 : 10,
      engineIdentity, runIdentity,
    }),
  };
  return Object.freeze(snapshot);
}

export async function assertRoundtripSnapshotFresh(snapshot, current = {}) {
  if (snapshot?.schema !== 'xml-cii-roundtrip-snapshot/v1') throw new Error('ROUNDTRIP_SNAPSHOT_SCHEMA');
  if (current.runIdentity !== snapshot.runIdentity || current.engineIdentity !== snapshot.engineIdentity)
    throw new Error('ROUNDTRIP_REPLAY_STALE_RUN_OR_ENGINE');
  const fields = [
    ['engineInputText', 'engineInputSha256'],
    ['originalCiiText', 'originalCiiSha256'],
    ['supportConfigJson', 'effectiveConfigSha256'],
    ['stagedJsonText', 'stagedJsonSha256'],
  ];
  for (const [field, digestName] of fields) {
    const value = current[field] === undefined ? snapshot[field] : current[field];
    if (typeof value !== 'string' || await ciiSha256(value) !== snapshot.manifest[digestName])
      throw new Error('ROUNDTRIP_REPLAY_STALE_' + field);
  }
  const options = current.options === undefined ? snapshot.options : { ...current.options, outputMode: 'cii-only' };
  if (await ciiSha256(JSON.stringify(options)) !== snapshot.manifest.optionsSha256)
    throw new Error('ROUNDTRIP_REPLAY_STALE_OPTIONS');
  return true;
}
