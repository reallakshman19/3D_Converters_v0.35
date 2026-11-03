import { byteLengthOf, normalizeSourceText } from './source-text.js';
import { analyzeSourceText } from './source-structure.js';

const VALID_KINDS = new Set(['xml', 'inputxml', 'stagedjson']);
const VALID_ORIGINS = new Set(['file', 'paste', 'editor']);

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable.');
  const bytes = new TextEncoder().encode(String(value ?? ''));
  return bytesToHex(await cryptoApi.subtle.digest('SHA-256', bytes));
}

export async function createSourceFileId(sourceText, sourceKind, hashText = sha256Hex) {
  const normalizedText = normalizeSourceText(sourceText);
  const identityHash = await hashText(`${sourceKind}\u0000${normalizedText}`);
  return `source-${identityHash.slice(0, 32)}`;
}

function envelopeFieldErrors(envelope) {
  const errors = [];
  if (envelope?.schema !== 'SourceEnvelope.v1') errors.push('Envelope schema must be SourceEnvelope.v1.');
  if (!VALID_KINDS.has(envelope?.sourceKind)) errors.push('Envelope sourceKind is invalid.');
  if (!VALID_ORIGINS.has(envelope?.origin)) errors.push('Envelope origin is invalid.');
  if (!Number.isInteger(envelope?.revision) || envelope.revision < 1) errors.push('Envelope revision must be a positive integer.');
  if (!/^[a-f0-9]{64}$/.test(envelope?.contentHash || '')) errors.push('Envelope contentHash must be SHA-256 hex.');
  if (!/^source-[a-f0-9]{32}$/.test(envelope?.sourceFileId || '')) errors.push('Envelope sourceFileId is invalid.');
  if (!envelope?.sourceText) errors.push('Envelope sourceText is empty.');
  if (envelope?.byteLength !== byteLengthOf(envelope?.sourceText || '')) errors.push('Envelope byteLength does not match sourceText.');
  return errors;
}

export function validateSourceEnvelope(envelope) {
  const structural = envelope?.validation || {};
  const errors = [...(structural.errors || []), ...envelopeFieldErrors(envelope)];
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...(structural.warnings || [])] };
}

export async function createSourceEnvelope(input, dependencies = {}) {
  const sourceText = normalizeSourceText(input.sourceText);
  const hashText = dependencies.hashText || sha256Hex;
  const analysis = input.analysis || analyzeSourceText(sourceText, input.sourceKind, dependencies.ParserCtor);
  const contentHash = await hashText(sourceText);
  const sourceFileId = await createSourceFileId(sourceText, input.sourceKind, hashText);
  const envelope = {
    schema: 'SourceEnvelope.v1', sourceFileId, sourceKind: input.sourceKind,
    sourceName: String(input.sourceName || 'untitled-source'), sourceText, contentHash,
    origin: input.origin, revision: input.revision, byteLength: byteLengthOf(sourceText),
    createdAt: (dependencies.now || (() => new Date().toISOString()))(),
    validation: { ok: analysis.ok, errors: [...analysis.errors], warnings: [...analysis.warnings] },
  };
  return { ...envelope, validation: validateSourceEnvelope(envelope) };
}

export function serializeSourceEnvelope(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function summarizeSourceEnvelope(envelope, ParserCtor = globalThis.DOMParser) {
  if (!envelope) return null;
  const analysis = analyzeSourceText(envelope.sourceText, envelope.sourceKind, ParserCtor);
  return {
    effectiveKind: envelope.sourceKind,
    detectedKind: analysis.detectedKind,
    sourceName: envelope.sourceName,
    origin: envelope.origin,
    revision: envelope.revision,
    byteLength: envelope.byteLength,
    contentHash: envelope.contentHash,
    sourceFileId: envelope.sourceFileId,
    rootShape: analysis.rootName || analysis.rootShape || '',
    validation: envelope.validation,
  };
}
