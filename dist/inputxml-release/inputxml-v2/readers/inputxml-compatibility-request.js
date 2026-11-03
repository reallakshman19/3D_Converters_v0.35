/**
 * Functionality: build and validate one hash-bound InputXML compatibility request.
 * Parameters: an explicit converter route, direction, mode, source name/bytes, and optional approval ID.
 * Outputs: an immutable InputXmlCompatibilityRequest.v1 object.
 * Fallback: none; unknown routes, contradictory approvals, or stale hashes raise explicit errors.
 */
import { hashReleaseJson, releaseBytes, sha256Hex } from './inputxml-release-hash.js';

export const INPUTXML_COMPATIBILITY_ROUTE_DIRECTIONS = Object.freeze({
  stagedjson_to_inputxml: 'INPUTXML_PRODUCER',
  seljson_to_inputxml: 'INPUTXML_PRODUCER',
  pdf_to_inputxml: 'INPUTXML_PRODUCER',
  pdf_to_inputxml_cii14: 'INPUTXML_PRODUCER',
  inputxml_to_xml: 'INPUTXML_CONSUMER',
  inputxml_to_cii: 'INPUTXML_CONSUMER',
  inputxml14_to_cii: 'INPUTXML_CONSUMER',
  inputxml_to_cii2019: 'INPUTXML_CONSUMER',
  component_topology_inputxml_writer: 'TOPOLOGY_WRITER',
});

const MODES = Object.freeze(['CANONICAL_STRICT', 'ADAPTED_CANONICAL', 'DIAGNOSTIC_ONLY']);

function requiredText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function approvalValue(value, mode) {
  const approvalId = typeof value === 'string' && value.trim() ? value.trim() : null;
  if (approvalId !== null && mode !== 'ADAPTED_CANONICAL') {
    throw new TypeError('Approved semantic split requires ADAPTED_CANONICAL mode.');
  }
  return approvalId;
}

function routeDirection(converterId) {
  const direction = INPUTXML_COMPATIBILITY_ROUTE_DIRECTIONS[converterId];
  if (!direction) throw new TypeError(`Unsupported InputXML compatibility route: ${converterId}.`);
  return direction;
}

export function compatibilityMode(options) {
  const mode = requiredText(options?.inputXmlCompatibilityMode, 'InputXML compatibility mode');
  if (!MODES.includes(mode)) throw new TypeError(`Unsupported InputXML compatibility mode: ${mode}.`);
  return mode;
}

export async function buildInputXmlCompatibilityRequest(input) {
  const converterId = requiredText(input?.converterId, 'Converter ID');
  const direction = routeDirection(converterId);
  const mode = compatibilityMode(input?.options);
  const sourceName = requiredText(input?.sourceName, 'InputXML source name');
  const sourceHashSha256 = await sha256Hex(releaseBytes(input?.sourceBytes));
  const approvedSemanticSplitId = approvalValue(input?.options?.approvedSemanticSplitId, mode);
  const base = {
    schema: 'InputXmlCompatibilityRequest.v1',
    converterId,
    direction,
    mode,
    sourceName,
    sourceHashSha256,
    approvedSemanticSplitId,
  };
  return Object.freeze({
    ...base,
    requestHashSha256: await hashReleaseJson(base, 'requestHashSha256'),
  });
}

export async function validateInputXmlCompatibilityRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('InputXML compatibility request must be an object.');
  }
  if (value.schema !== 'InputXmlCompatibilityRequest.v1') {
    throw new TypeError('InputXML compatibility request schema is invalid.');
  }
  if (routeDirection(value.converterId) !== value.direction) {
    throw new TypeError('InputXML compatibility request direction does not match its route.');
  }
  if (!MODES.includes(value.mode)) throw new TypeError(`Unsupported InputXML compatibility mode: ${value.mode}.`);
  requiredText(value.sourceName, 'InputXML source name');
  if (!/^[0-9a-f]{64}$/.test(value.sourceHashSha256 || '')) {
    throw new TypeError('InputXML compatibility request source hash is invalid.');
  }
  approvalValue(value.approvedSemanticSplitId, value.mode);
  const expected = await hashReleaseJson(value, 'requestHashSha256');
  if (value.requestHashSha256 !== expected) throw new TypeError('InputXML compatibility request hash is stale.');
  return Object.freeze({ ...value });
}
