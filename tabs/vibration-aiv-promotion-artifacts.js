const AIV_PROMOTION_ARTIFACT_KEYS = Object.freeze([
  't27Reconciliation',
  'd23Flm1Reconciliation',
  'workedExampleResultScope',
  'independentBenchmarks',
  'workbookReconciliation',
]);

export { AIV_PROMOTION_ARTIFACT_KEYS };

function artifactError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'AivPromotionArtifactError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function assertArtifactKey(key) {
  if (!AIV_PROMOTION_ARTIFACT_KEYS.includes(key)) {
    throw artifactError('AIV_PROMOTION_ARTIFACT_KEY_UNSUPPORTED', `Unsupported AIV promotion artifact key ${key}.`, { key });
  }
  return key;
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256AivPromotionArtifactBytes(bytesInput) {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);
  if (!globalThis.crypto?.subtle) {
    throw artifactError('AIV_PROMOTION_SHA256_UNAVAILABLE', 'Web Crypto SHA-256 is unavailable in this runtime.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export async function parseAivPromotionVerificationArtifact(keyInput, bytesInput, metadata = {}) {
  const key = assertArtifactKey(keyInput);
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);
  if (!bytes.byteLength) {
    throw artifactError('AIV_PROMOTION_ARTIFACT_EMPTY', `${key} verification artifact is empty.`, { key });
  }
  let verification;
  try {
    verification = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw artifactError(
      'AIV_PROMOTION_ARTIFACT_JSON_INVALID',
      `${key} verification artifact must be valid UTF-8 JSON.`,
      { key, cause: String(error?.message || error) },
    );
  }
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    throw artifactError('AIV_PROMOTION_ARTIFACT_OBJECT_REQUIRED', `${key} verification JSON must contain one object.`, { key });
  }
  const artifactSha256 = await sha256AivPromotionArtifactBytes(bytes);
  return Object.freeze({
    key,
    fileName: metadata.fileName ?? null,
    byteLength: bytes.byteLength,
    artifactSha256,
    verification: Object.freeze({ ...verification }),
  });
}

export async function readAivPromotionVerificationFile(key, file) {
  assertArtifactKey(key);
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw artifactError('AIV_PROMOTION_FILE_REQUIRED', `${key} requires a readable JSON File.`);
  }
  return parseAivPromotionVerificationArtifact(key, await file.arrayBuffer(), { fileName: file.name ?? null });
}

export function promotionEvidenceFromLoadedArtifacts(loadedArtifacts = {}) {
  const evidence = {};
  for (const key of AIV_PROMOTION_ARTIFACT_KEYS) {
    const artifact = loadedArtifacts[key];
    if (!artifact) continue;
    evidence[key] = Object.freeze({
      artifactSha256: artifact.artifactSha256,
      verification: artifact.verification,
    });
  }
  return Object.freeze(evidence);
}
