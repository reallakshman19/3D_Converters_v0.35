import { parseAivMasterDatabase } from './aiv-master-db.js';
import {
  AIV_MASTER_DB_REFERENCE,
  calculateAivGitBlobSha1,
} from './aiv-master-db-reference.js';

const BUNDLED_MASTER_URLS = Object.freeze({
  'M_COMPONENT_TYPE.csv': new URL('./master-data/M_COMPONENT_TYPE.csv', import.meta.url),
  'M_DOCUMENT_SOURCE.csv': new URL('./master-data/M_DOCUMENT_SOURCE.csv', import.meta.url),
  'M_MATERIAL.csv': new URL('./master-data/M_MATERIAL.csv', import.meta.url),
  'M_PIPE_DIMENSION.csv': new URL('./master-data/M_PIPE_DIMENSION.csv', import.meta.url),
  'M_PIPING_CLASS.csv': new URL('./master-data/M_PIPING_CLASS.csv', import.meta.url),
  'M_SOURCE_DEVICE_TYPE.csv': new URL('./master-data/M_SOURCE_DEVICE_TYPE.csv', import.meta.url),
  'M_UNIT.csv': new URL('./master-data/M_UNIT.csv', import.meta.url),
});

function masterError(code, message, details = {}) {
  const value = new Error(message);
  value.name = 'AivBundledMasterDbError';
  value.code = code;
  value.details = Object.freeze({ ...details });
  return value;
}

async function fetchMaster(filename, fetchImpl) {
  const expectedBlob = AIV_MASTER_DB_REFERENCE.files[filename];
  const response = await fetchImpl(BUNDLED_MASTER_URLS[filename]);
  if (!response?.ok) {
    throw masterError(
      'AIV_MASTER_ASSET_FETCH_FAILED',
      `Bundled AIV master asset ${filename} could not be loaded.`,
      { filename, status: response?.status ?? null },
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualBlob = await calculateAivGitBlobSha1(bytes);
  if (actualBlob !== expectedBlob) {
    throw masterError(
      'AIV_MASTER_ASSET_BLOB_MISMATCH',
      `Bundled AIV master asset ${filename} does not match its approved source Git blob.`,
      { filename, expectedBlob, actualBlob },
    );
  }
  return Object.freeze({
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    verification: Object.freeze({ expectedBlob, actualBlob, status: 'MATCH' }),
  });
}

export async function loadBundledAivMasterDatabase({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw masterError('AIV_MASTER_FETCH_REQUIRED', 'AIV master auto-load requires a fetch implementation.');
  }
  const texts = {};
  const verification = {};
  for (const filename of Object.keys(AIV_MASTER_DB_REFERENCE.files)) {
    const loaded = await fetchMaster(filename, fetchImpl);
    texts[filename] = loaded.text;
    verification[filename] = loaded.verification;
  }
  return parseAivMasterDatabase(texts, verification);
}

export { BUNDLED_MASTER_URLS };
