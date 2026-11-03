/**
 * Parses topology exclusively from generated InputXML into
 * ParsedInputXmlTopology.v1. Missing canonical identities remain explicit
 * parser issues; no ledger, source, DOM, branch-order, or proximity repair is
 * permitted.
 */

import { hashText, stampArtifactHash, TOPOLOGY_HASH_ALGORITHM } from './topology-deterministic-hash.js';
import { cleanText, uniqueText } from './topology-values.js';
import {
  attribute,
  finiteNumber,
  list,
  normalizeNodeId,
  normalizedNumber,
  parseAttributes,
  point,
} from './topology-inputxml-parser-values.js';

const GLOBAL_DECIMALS = 3;
const DELTA_DECIMALS = 6;

function issue(code, message, context, sequence) {
  return Object.freeze({
    id: `INPUTXML-PARSE-${String(sequence).padStart(6, '0')}`,
    category: code,
    severity: 'ERROR',
    blocking: true,
    message,
    ...context,
  });
}

function parseRestraint(attrs, elementId) {
  const id = attribute(attrs, 'ID');
  return Object.freeze({
    id,
    supportId: attribute(attrs, 'SUPPORT_ID') || id.replace(/^RESTRAINT:/, '').replace(/:\d+$/, ''),
    ownerInputXmlElementId: elementId,
    inputXmlNodeId: normalizeNodeId(attribute(attrs, 'NODE')),
    canonicalNodeId: attribute(attrs, 'CANONICAL_NODE_ID'),
    tag: attribute(attrs, 'TAG'),
    type: attribute(attrs, 'TYPE'),
    sourceEntityIds: Object.freeze(list(attribute(attrs, 'SOURCE_ENTITY_IDS'))),
    sourcePaths: Object.freeze(list(attribute(attrs, 'SOURCE_PATHS'))),
    branchIds: Object.freeze(list(attribute(attrs, 'BRANCH_IDS'))),
    attachmentAuthority: attribute(attrs, 'ATTACHMENT_AUTHORITY'),
    attachmentReferences: Object.freeze(list(attribute(attrs, 'ATTACHMENT_REFERENCES'))),
    connectionResidual: normalizedNumber(attribute(attrs, 'CONNECTION_RESIDUAL'), DELTA_DECIMALS),
    sourcePosition: point(attrs, 'SOURCE', DELTA_DECIMALS),
    attachmentPosition: point(attrs, 'ATTACHMENT', DELTA_DECIMALS),
    attributes: Object.freeze(attrs),
  });
}

function parseRigid(attrs, elementId) {
  return Object.freeze({
    id: attribute(attrs, 'ID'),
    ownerInputXmlElementId: elementId,
    canonicalEdgeId: attribute(attrs, 'CANONICAL_EDGE_ID'),
    sourceEntityIds: Object.freeze(list(attribute(attrs, 'SOURCE_ENTITY_IDS'))),
    sourcePaths: Object.freeze(list(attribute(attrs, 'SOURCE_PATHS'))),
    branchIds: Object.freeze(list(attribute(attrs, 'BRANCH_IDS'))),
    assignmentAuthorities: Object.freeze(list(attribute(attrs, 'ASSIGNMENT_AUTHORITY'))),
    weightAuthorities: Object.freeze(list(attribute(attrs, 'WEIGHT_AUTHORITY'))),
    connectionResidual: normalizedNumber(attribute(attrs, 'CONNECTION_RESIDUAL'), DELTA_DECIMALS),
    sourceBodyCount: finiteNumber(attribute(attrs, 'SOURCE_BODY_COUNT')),
    weight: finiteNumber(attribute(attrs, 'WEIGHT')),
    attributes: Object.freeze(attrs),
  });
}

function parseChildren(body, elementId, issues, next) {
  const restraints = [], rigids = [], otherChildren = [];
  const pattern = /<([A-Za-z_][\w:.-]*)\b([^>]*)\/?\s*>/g;
  for (const match of String(body ?? '').matchAll(pattern)) {
    const rawTag = cleanText(match[1]);
    const tag = rawTag.includes(':') ? rawTag.split(':').at(-1).toUpperCase() : rawTag.toUpperCase();
    if (tag === 'PIPINGELEMENT') continue;
    const attrs = parseAttributes(match[2]);
    if (tag === 'RESTRAINT') {
      const row = parseRestraint(attrs, elementId);
      if (!row.id) issues.push(issue('RESTRAINT_ID_MISSING', `RESTRAINT under ${elementId} has no stable ID.`, { inputXmlElementId: elementId }, next()));
      if (!row.canonicalNodeId) issues.push(issue('RESTRAINT_CANONICAL_NODE_ID_MISSING', `RESTRAINT ${row.id || '(unnamed)'} has no CANONICAL_NODE_ID.`, { inputXmlElementId: elementId, inputXmlChildId: row.id }, next()));
      restraints.push(row);
    } else if (tag === 'RIGID') {
      const row = parseRigid(attrs, elementId);
      if (!row.id) issues.push(issue('RIGID_ID_MISSING', `RIGID under ${elementId} has no stable ID.`, { inputXmlElementId: elementId }, next()));
      if (!row.canonicalEdgeId) issues.push(issue('RIGID_CANONICAL_EDGE_ID_MISSING', `RIGID ${row.id || '(unnamed)'} has no CANONICAL_EDGE_ID.`, { inputXmlElementId: elementId, inputXmlChildId: row.id }, next()));
      rigids.push(row);
    } else {
      otherChildren.push(Object.freeze({
        id: attribute(attrs, 'ID'), tag, attributes: Object.freeze(attrs), ownerInputXmlElementId: elementId,
      }));
    }
  }
  return {
    restraints: Object.freeze(restraints),
    rigids: Object.freeze(rigids),
    otherChildren: Object.freeze(otherChildren),
  };
}

function endpointRows(element) {
  return [
    {
      canonicalNodeId: element.fromCanonicalNodeId,
      inputXmlNodeId: element.fromNode,
      position: element.fromPosition,
      sourceEntityIds: element.fromSourceEntityIds?.length ? element.fromSourceEntityIds : element.sourceEntityIds,
      sourcePortIds: element.fromSourcePortIds?.length ? element.fromSourcePortIds : element.sourcePortIds,
      elementId: element.id,
    },
    {
      canonicalNodeId: element.toCanonicalNodeId,
      inputXmlNodeId: element.toNode,
      position: element.toPosition,
      sourceEntityIds: element.toSourceEntityIds?.length ? element.toSourceEntityIds : element.sourceEntityIds,
      sourcePortIds: element.toSourcePortIds?.length ? element.toSourcePortIds : element.sourcePortIds,
      elementId: element.id,
    },
  ];
}

function buildNodes(elements, issues, next) {
  const byCanonicalId = new Map(), inputToCanonical = new Map();
  for (const endpoint of elements.flatMap(endpointRows)) {
    if (!endpoint.canonicalNodeId) continue;
    const existing = byCanonicalId.get(endpoint.canonicalNodeId);
    if (!existing) {
      byCanonicalId.set(endpoint.canonicalNodeId, {
        id: endpoint.canonicalNodeId,
        canonicalNodeId: endpoint.canonicalNodeId,
        inputXmlNodeId: endpoint.inputXmlNodeId,
        position: endpoint.position,
        sourceEntityIds: [...endpoint.sourceEntityIds],
        sourcePortIds: [...endpoint.sourcePortIds],
        incidentInputXmlElementIds: [endpoint.elementId],
      });
    } else {
      if (existing.inputXmlNodeId !== endpoint.inputXmlNodeId) issues.push(issue(
        'CANONICAL_NODE_INPUT_ID_CONFLICT',
        `Canonical node ${endpoint.canonicalNodeId} maps to multiple InputXML node IDs.`,
        { canonicalNodeId: endpoint.canonicalNodeId, expected: existing.inputXmlNodeId, actual: endpoint.inputXmlNodeId }, next(),
      ));
      if (JSON.stringify(existing.position) !== JSON.stringify(endpoint.position)) issues.push(issue(
        'CANONICAL_NODE_COORDINATE_CONFLICT',
        `Canonical node ${endpoint.canonicalNodeId} has conflicting InputXML global coordinates.`,
        { canonicalNodeId: endpoint.canonicalNodeId, expected: existing.position, actual: endpoint.position }, next(),
      ));
      existing.sourceEntityIds.push(...endpoint.sourceEntityIds);
      existing.sourcePortIds.push(...endpoint.sourcePortIds);
      existing.incidentInputXmlElementIds.push(endpoint.elementId);
    }
    const mapped = inputToCanonical.get(endpoint.inputXmlNodeId);
    if (mapped && mapped !== endpoint.canonicalNodeId) issues.push(issue(
      'INPUT_NODE_CANONICAL_ID_CONFLICT',
      `InputXML node ${endpoint.inputXmlNodeId} maps to multiple canonical node IDs.`,
      { inputXmlNodeId: endpoint.inputXmlNodeId, expected: mapped, actual: endpoint.canonicalNodeId }, next(),
    ));
    else if (endpoint.inputXmlNodeId) inputToCanonical.set(endpoint.inputXmlNodeId, endpoint.canonicalNodeId);
  }
  return Object.freeze([...byCanonicalId.values()].map((row) => Object.freeze({
    ...row,
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds)),
    sourcePortIds: Object.freeze(uniqueText(row.sourcePortIds)),
    incidentInputXmlElementIds: Object.freeze(uniqueText(row.incidentInputXmlElementIds)),
  })));
}

function parseElement(attrs, body, index, issues, next) {
  const id = attribute(attrs, 'ID');
  const children = parseChildren(body, id || `PIPINGELEMENT[${index}]`, issues, next);
  const row = Object.freeze({
    id,
    inputXmlElementId: id,
    canonicalEdgeId: attribute(attrs, 'CANONICAL_EDGE_ID'),
    fromNode: normalizeNodeId(attribute(attrs, 'FROM_NODE')),
    toNode: normalizeNodeId(attribute(attrs, 'TO_NODE')),
    fromCanonicalNodeId: attribute(attrs, 'FROM_CANONICAL_NODE_ID'),
    toCanonicalNodeId: attribute(attrs, 'TO_CANONICAL_NODE_ID'),
    fromPosition: point(attrs, 'FROM_GLOBAL', GLOBAL_DECIMALS),
    toPosition: point(attrs, 'TO_GLOBAL', GLOBAL_DECIMALS),
    delta: Object.freeze({
      x: normalizedNumber(attribute(attrs, 'DELTA_X'), DELTA_DECIMALS),
      y: normalizedNumber(attribute(attrs, 'DELTA_Y'), DELTA_DECIMALS),
      z: normalizedNumber(attribute(attrs, 'DELTA_Z'), DELTA_DECIMALS),
    }),
    sourceEntityIds: Object.freeze(list(attribute(attrs, 'SOURCE_ENTITY_IDS'))),
    sourcePortIds: Object.freeze(list(attribute(attrs, 'SOURCE_PORT_IDS'))),
    fromSourceEntityIds: Object.freeze(list(attribute(attrs, 'FROM_SOURCE_ENTITY_IDS'))),
    toSourceEntityIds: Object.freeze(list(attribute(attrs, 'TO_SOURCE_ENTITY_IDS'))),
    fromSourcePortIds: Object.freeze(list(attribute(attrs, 'FROM_SOURCE_PORT_IDS'))),
    toSourcePortIds: Object.freeze(list(attribute(attrs, 'TO_SOURCE_PORT_IDS'))),
    branchIds: Object.freeze(list(attribute(attrs, 'BRANCH_IDS'))),
    topologyOperation: attribute(attrs, 'TOPOLOGY_OPERATION'),
    projectionCardinality: attribute(attrs, 'PROJECTION_CARDINALITY'),
    mergeAuthority: attribute(attrs, 'MERGE_AUTHORITY'),
    sourceType: attribute(attrs, 'SOURCE_TYPE'),
    attributes: Object.freeze(attrs),
    ...children,
  });
  if (!row.id) issues.push(issue('INPUTXML_ELEMENT_ID_MISSING', `PIPINGELEMENT[${index}] has no ID.`, {}, next()));
  if (!row.canonicalEdgeId) issues.push(issue('CANONICAL_EDGE_ID_MISSING', `PIPINGELEMENT ${row.id || index} has no CANONICAL_EDGE_ID.`, { inputXmlElementId: row.id }, next()));
  if (!row.fromCanonicalNodeId) issues.push(issue('FROM_CANONICAL_NODE_ID_MISSING', `PIPINGELEMENT ${row.id || index} has no FROM_CANONICAL_NODE_ID.`, { inputXmlElementId: row.id }, next()));
  if (!row.toCanonicalNodeId) issues.push(issue('TO_CANONICAL_NODE_ID_MISSING', `PIPINGELEMENT ${row.id || index} has no TO_CANONICAL_NODE_ID.`, { inputXmlElementId: row.id }, next()));
  if (!row.fromPosition || !row.toPosition) issues.push(issue('GLOBAL_COORDINATE_MISSING', `PIPINGELEMENT ${row.id || index} lacks complete global endpoint coordinates.`, { inputXmlElementId: row.id }, next()));
  return row;
}

export function parseTopologyInputXml(xmlText) {
  const xml = String(xmlText ?? '');
  if (!/<CAESARII\b/i.test(xml) || !/<PIPINGMODEL\b/i.test(xml)) throw new TypeError('ParsedInputXmlTopology requires CAESARII/PIPINGMODEL InputXML.');
  const modelAttributes = parseAttributes(xml.match(/<PIPINGMODEL\b([^>]*)>/i)?.[1] ?? '');
  const issues = [], elements = [];
  let sequence = 0, match;
  const next = () => ++sequence;
  const paired = /<PIPINGELEMENT\b([^>]*)>([\s\S]*?)<\/PIPINGELEMENT>/gi;
  while ((match = paired.exec(xml))) elements.push(parseElement(parseAttributes(match[1]), match[2], elements.length + 1, issues, next));
  if (!elements.length) throw new TypeError('ParsedInputXmlTopology contains no paired PIPINGELEMENT records.');
  const counts = new Map();
  for (const element of elements) if (element.canonicalEdgeId) counts.set(element.canonicalEdgeId, (counts.get(element.canonicalEdgeId) ?? 0) + 1);
  for (const [edgeId, count] of counts) if (count !== 1) issues.push(issue('CANONICAL_EDGE_CARDINALITY_INVALID', `Canonical edge ${edgeId} occurs ${count} times in InputXML; expected exactly one.`, { canonicalEdgeId: edgeId, actual: count }, next()));
  const nodes = buildNodes(elements, issues, next);
  const restraints = Object.freeze(elements.flatMap((element) => element.restraints));
  const rigids = Object.freeze(elements.flatMap((element) => element.rigids));
  const parsed = Object.freeze({
    schema: 'ParsedInputXmlTopology.v1',
    hashAlgorithm: TOPOLOGY_HASH_ALGORITHM,
    inputXmlHash: hashText(xml),
    canonicalTopologyHash: attribute(modelAttributes, 'CANONICAL_TOPOLOGY_HASH'),
    topologyTraceLedgerHash: attribute(modelAttributes, 'TOPOLOGY_TRACE_LEDGER_HASH'),
    serialization: Object.freeze({ coordinateUnit: 'mm', globalCoordinateDecimals: GLOBAL_DECIMALS, deltaDecimals: DELTA_DECIMALS, coordinateToleranceMm: 0 }),
    modelAttributes: Object.freeze(modelAttributes),
    nodes,
    elements: Object.freeze(elements),
    restraints,
    rigids,
    issues: Object.freeze(issues),
    summary: Object.freeze({ nodes: nodes.length, elements: elements.length, restraints: restraints.length, rigids: rigids.length, issues: issues.length, blockingIssues: issues.filter((row) => row.blocking).length }),
  });
  return stampArtifactHash(parsed, 'parsedInputXmlTopologyHash');
}

export const INPUTXML_TOPOLOGY_SERIALIZATION = Object.freeze({ globalCoordinateDecimals: GLOBAL_DECIMALS, deltaDecimals: DELTA_DECIMALS, coordinateToleranceMm: 0 });
export const _test = Object.freeze({ issue, parseRestraint, parseRigid, parseChildren, endpointRows, buildNodes, parseElement });
