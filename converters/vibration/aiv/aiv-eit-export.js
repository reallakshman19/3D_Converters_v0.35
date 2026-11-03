import { AIV_EIT_AUTHORITY_POLICY, AIV_EIT_SCHEMA } from './aiv-eit-contract.js';
import { assertAivEitScreeningAuthority } from './aiv-eit-authority.js';
import { buildAivEitV5Document } from './aiv-eit-document.js';

export function buildAivEitExport({ screeningPackage, title = 'AIV Screening Export', options = {} } = {}) {
  if (screeningPackage?.schema !== 'AivScreeningExportPackage.v1') {
    throw new TypeError('AIV .eit export requires AivScreeningExportPackage.v1.');
  }
  assertAivEitScreeningAuthority(screeningPackage.result);
  return Object.freeze({
    schema: AIV_EIT_SCHEMA,
    document: buildAivEitV5Document(screeningPackage, title, options),
    authorityPolicy: AIV_EIT_AUTHORITY_POLICY,
  });
}

export function serializeAivEitExport(input) {
  const built = input?.schema === AIV_EIT_SCHEMA ? input : buildAivEitExport(input);
  return `${JSON.stringify(built.document)}\n`;
}
