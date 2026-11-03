import { readUniqueZipEntry } from './browser-zip.js';

export const FBX2_BROWSER_PROFILE = Object.freeze({
  profileId: 'FBX2-SMALL-GLRD-20260731',
  selectedZoneLabel: '/GLRD-1000-CU-PI-P',
  sourceArchive: Object.freeze({
    fileName: 'STF_2026Jul23-1554_binary.zip',
    byteLength: 3126315,
    sha256: '18758c5283b852efb2a1154fd07dcd9982c088b793e4ffe63b1a9ab2f11e6131',
  }),
  sourceFbx: Object.freeze({
    fileName: 'STF_2026Jul23-1554_binary.fbx',
    byteLength: 10066688,
    sha256: '7f198ce867ea33ce98b6d4f73f5a06c3c0e9a2f1a8e35412a63e38c504c83c1b',
  }),
  managedArchive: Object.freeze({
    fileName: 'ATTRIBUTE_GL_managed_stage.zip',
    byteLength: 73205,
    sha256: 'e0dbbc42ddedd17e96c3eadced2a4d65e10a333552c791dea4e725b9feea4cd8',
  }),
  managedJson: Object.freeze({
    fileName: 'ATTRIBUTE_GL_managed_stage.json',
    byteLength: 1687826,
    sha256: '5b7430e371442c9b24d8eba87edbbfb5c3c52761a13c743fa2bcff94418c6f1e',
  }),
});

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('FBX browser input must contain bytes.');
}
function nameOf(input) {
  return String(input?.name || '').trim();
}
function extension(name) {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}
function hex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}
export async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA256_RUNTIME_UNAVAILABLE');
  const bytes = bytesOf(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return hex(new Uint8Array(digest));
}
async function identity(name, bytes) {
  return Object.freeze({ fileName: name, byteLength: bytes.length, sha256: await sha256Hex(bytes) });
}
function identityMatches(actual, expected) {
  return actual.fileName === expected.fileName
    && actual.byteLength === expected.byteLength
    && actual.sha256 === expected.sha256;
}
function exactName(name, expected) {
  return name.toLowerCase() === expected.fileName.toLowerCase();
}
function branchLike(entry) {
  const type = String(entry?.type || entry?.attributes?.TYPE || '').trim().toUpperCase();
  return (type === 'BRAN' || type === 'BRANCH') && Array.isArray(entry?.children);
}
export function isManagedStageHierarchy(value) {
  return Array.isArray(value) && value.length > 0 && value.every(branchLike);
}
function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) {
    throw new Error(`${label}_JSON_INVALID:${error instanceof Error ? error.message : String(error)}`);
  }
}
async function sourceFromZip(input) {
  const archiveBytes = bytesOf(input.bytes);
  const entry = await readUniqueZipEntry(archiveBytes, (name) => /\.fbx$/i.test(name), {
    maxEntries: 16, maxEntryBytes: 24 * 1024 * 1024, maxTotalBytes: 24 * 1024 * 1024,
  });
  const fileName = entry.name.split('/').at(-1);
  return Object.freeze({
    name: fileName,
    bytes: entry.bytes,
    archive: await identity(nameOf(input), archiveBytes),
    file: await identity(fileName, entry.bytes),
    fromArchive: true,
  });
}
async function sourceFromFbx(input) {
  const bytes = bytesOf(input.bytes), name = nameOf(input);
  if (!/\.fbx$/i.test(name)) throw new Error('FBX_PRIMARY_TYPE_UNSUPPORTED');
  return Object.freeze({ name, bytes, archive: null, file: await identity(name, bytes), fromArchive: false });
}
export async function resolveBrowserFbxPrimary(input) {
  if (!input?.bytes) throw new Error('FBX input is required.');
  return extension(nameOf(input)) === 'zip' ? sourceFromZip(input) : sourceFromFbx(input);
}
async function managedFromZip(input) {
  const archiveBytes = bytesOf(input.bytes);
  const entry = await readUniqueZipEntry(archiveBytes,
    (name) => /_managed_stage\.json$/i.test(name) || /\.json$/i.test(name), {
      maxEntries: 32, maxEntryBytes: 16 * 1024 * 1024, maxTotalBytes: 24 * 1024 * 1024,
    });
  const fileName = entry.name.split('/').at(-1), value = parseJson(entry.bytes, 'MANAGED_STAGE');
  if (!isManagedStageHierarchy(value)) throw new Error('MANAGED_STAGE_HIERARCHY_INVALID');
  return Object.freeze({ kind: 'managed-stage', value, name: fileName,
    archive: await identity(nameOf(input), archiveBytes), file: await identity(fileName, entry.bytes),
    fromArchive: true });
}
async function secondaryFromJson(input) {
  const bytes = bytesOf(input.bytes), name = nameOf(input), value = parseJson(bytes, 'SECONDARY');
  const managedIntent = /_managed_stage\.json$/i.test(name);
  if (isManagedStageHierarchy(value)) {
    return Object.freeze({ kind: 'managed-stage', value, name,
      archive: null, file: await identity(name, bytes), fromArchive: false });
  }
  if (managedIntent) throw new Error('MANAGED_STAGE_HIERARCHY_INVALID');
  return Object.freeze({ kind: 'mapping', value, name, archive: null,
    file: await identity(name, bytes), fromArchive: false });
}
export async function resolveBrowserFbxSecondary(input) {
  if (!input?.bytes) return Object.freeze({ kind: 'none', value: null });
  const type = extension(nameOf(input));
  if (type === 'zip') return managedFromZip(input);
  if (type === 'json') {
    try { return await secondaryFromJson(input); }
    catch (error) {
      if (/_managed_stage\.json$/i.test(nameOf(input))) throw error;
      return Object.freeze({ kind: 'mapping-error', value: null,
        error: error instanceof Error ? error.message : String(error), name: nameOf(input) });
    }
  }
  throw new Error('FBX_SECONDARY_TYPE_UNSUPPORTED');
}
function governedNamePresent(primary, secondary) {
  return Boolean((primary.archive && exactName(primary.archive.fileName, FBX2_BROWSER_PROFILE.sourceArchive))
    || (secondary.archive && exactName(secondary.archive.fileName, FBX2_BROWSER_PROFILE.managedArchive)));
}
export function bindFbx2BrowserProfile(primary, secondary) {
  if (secondary?.kind !== 'managed-stage') return null;
  const archiveBound = Boolean(primary.archive && secondary.archive);
  const sourceArchivePass = archiveBound
    && identityMatches(primary.archive, FBX2_BROWSER_PROFILE.sourceArchive);
  const managedArchivePass = archiveBound
    && identityMatches(secondary.archive, FBX2_BROWSER_PROFILE.managedArchive);
  const sourceFilePass = identityMatches(primary.file, FBX2_BROWSER_PROFILE.sourceFbx);
  const managedFilePass = identityMatches(secondary.file, FBX2_BROWSER_PROFILE.managedJson);
  if (governedNamePresent(primary, secondary)
      && !(sourceArchivePass && managedArchivePass && sourceFilePass && managedFilePass)) {
    throw new Error('FBX2_BROWSER_SOURCE_IDENTITY_MISMATCH');
  }
  if (!(sourceArchivePass && managedArchivePass && sourceFilePass && managedFilePass)) return null;
  return Object.freeze({
    profileId: FBX2_BROWSER_PROFILE.profileId,
    selectedZoneLabel: FBX2_BROWSER_PROFILE.selectedZoneLabel,
    archiveBound: true,
    source: Object.freeze({ archive: primary.archive, file: primary.file }),
    managed: Object.freeze({ archive: secondary.archive, file: secondary.file }),
  });
}

export function selectedManagedReferenceLabel(context, profile) {
  const explicit = String(context?.options?.fbxSelectedZoneLabel || '').trim();
  if (profile) return profile.selectedZoneLabel;
  if (explicit) return explicit;
  throw new Error('MANAGED_STAGE_ZONE_LABEL_REQUIRED');
}
