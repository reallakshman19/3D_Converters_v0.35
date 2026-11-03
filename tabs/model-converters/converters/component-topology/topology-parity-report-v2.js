/**
 * Functionality: extends existing three-way parity with exact-byte and numbering authorities.
 * Parameters: the proven v1 report plus v2 topology, node plan, projection, emitted XML, and parser output.
 * Outputs: a SHA-256 anchored TopologyParityReport.v2.
 * Fallback: none; missing or inconsistent hash anchors become blocking mismatches.
 */
import { hashReleaseJson, sha256Hex } from '../../../../converters/inputxml-release/inputxml-release-hash.js';

function anchorMismatch(code, expected, actual) {
  return Object.freeze({ severity: 'BLOCKING', category: code, expected, actual, status: 'OPEN' });
}

function inputXmlTopologyHash(xmlText) {
  return String(xmlText).match(/\bCANONICAL_TOPOLOGY_SHA256="([0-9a-f]{64})"/)?.[1] ?? '';
}

export async function buildParsedInputXmlTopologyV1(input) {
  const parsed = input.parsedInputXmlTopology;
  if (parsed?.schema !== 'ParsedInputXmlTopology.v1') throw new TypeError('ParsedInputXmlTopology.v1 is required.');
  const base = {
    schema: 'ParsedInputXmlTopology.v1',
    inputXmlHashSha256: await sha256Hex(input.topologyInputXml),
    canonicalTopologyHashSha256: input.canonicalTopologyV2.canonicalTopologyHashSha256,
    nodes: parsed.nodes, elements: parsed.elements, restraints: parsed.restraints,
    rigids: parsed.rigids, issues: parsed.issues, summary: parsed.summary,
  };
  return Object.freeze({ ...base, parsedInputXmlTopologyHashSha256: await hashReleaseJson(base, 'parsedInputXmlTopologyHashSha256') });
}

export async function buildTopologyParityReportV2(input) {
  const legacy = input.topologyParityReportV1;
  if (legacy?.schema !== 'TopologyParityReport.v1') throw new TypeError('TopologyParityReport.v1 evidence is required.');
  const mismatches = [...(legacy.mismatches ?? [])];
  const embeddedHash = inputXmlTopologyHash(input.topologyInputXml);
  if (embeddedHash !== input.canonicalTopologyV2.canonicalTopologyHashSha256) {
    mismatches.push(anchorMismatch('CANONICAL_TOPOLOGY_SHA256_MISMATCH', input.canonicalTopologyV2.canonicalTopologyHashSha256, embeddedHash));
  }
  for (const difference of input.numberingShadowReport.differences ?? []) {
    mismatches.push(anchorMismatch('NODE_PLAN_NUMBERING_MISMATCH', difference.expected, difference.actual));
  }
  const status = legacy.ok && mismatches.length === 0 ? 'PASS' : 'BLOCKED';
  const base = {
    schema: 'TopologyParityReport.v2', status,
    canonicalTopologyHashSha256: input.canonicalTopologyV2.canonicalTopologyHashSha256,
    topoNodePlanHashSha256: input.topoNodePlan.nodePlanHash.replace(/^sha256:/, ''),
    numberedTopologyProjectionHashSha256: input.numberedTopologyProjection.numberedTopologyProjectionHashSha256,
    inputXmlHashSha256: await sha256Hex(input.topologyInputXml),
    parsedInputXmlTopologyHashSha256: input.parsedInputXmlTopologyV2.parsedInputXmlTopologyHashSha256,
    svgSceneHash: input.topologySvgScene.svgSceneHash,
    summary: Object.freeze({ ...legacy.summary, topologyMismatchCount: mismatches.length }),
    mismatches: Object.freeze(mismatches),
  };
  return Object.freeze({ ...base, topologyParityReportHashSha256: await hashReleaseJson(base, 'topologyParityReportHashSha256') });
}

export const _test = Object.freeze({ inputXmlTopologyHash, anchorMismatch });
