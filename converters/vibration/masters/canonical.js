function assertJsonValue(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`VIBRATION_MASTER_NONFINITE_NUMBER: ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, child] of Object.entries(value)) assertJsonValue(child, `${path}.${key}`);
    return;
  }
  throw new TypeError(`VIBRATION_MASTER_JSON_VALUE_INVALID: ${path}`);
}

export function stableVibrationMasterJson(value) {
  assertJsonValue(value);
  if (Array.isArray(value)) return `[${value.map(stableVibrationMasterJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableVibrationMasterJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function vibrationMasterContentPayload(master) {
  const payload = {
    schema: master.schema,
    masterId: master.masterId,
    methodId: master.methodId,
    edition: master.edition,
    revision: master.revision,
    authorityClass: master.authorityClass,
    source: master.source,
    dataSchema: master.dataSchema,
    data: master.data,
  };
  if (master.applicability !== undefined) payload.applicability = master.applicability;
  return payload;
}

export async function hashVibrationMasterContent(master) {
  if (!globalThis.crypto?.subtle) throw new Error('VIBRATION_MASTER_WEB_CRYPTO_REQUIRED');
  const canonical = stableVibrationMasterJson(vibrationMasterContentPayload(master));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function deepFreezeVibrationMaster(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreezeVibrationMaster(child);
  return value;
}