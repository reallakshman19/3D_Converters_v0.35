/**
 * Native CAESAR II 11 topology InputXML writer.
 * CanonicalTopology.v2 is the topology authority and TopoNodePlan.v1, applied
 * through NumberedTopologyProjection.v1, is the sole numbering authority.
 */

import { RESTRAINT_CODE_MAP } from '../../../stagedjson-to-enrichxml/sj-restraint-resolver.js';
import { cleanText, xmlAttribute } from './topology-values.js';
import {
  buildEdgeEngineeringValues,
  engineeringRecord,
  engineeringValues,
  finiteNumber,
  physicalWall,
} from './topology-inputxml-engineering-context.js';
import {
  topologyElementTraceAttributes,
  topologyRestraintTraceAttributes,
  topologyRigidTraceAttributes,
} from './topology-inputxml-trace-attributes.js';
import { applyNumberedTopologyProjection } from './topology-numbering-projection.js';

const SENTINEL = '-1.010100';

/** @param {unknown} value @returns {string} */
function fixed(value) {
  const number = finiteNumber(value);
  return number === null ? SENTINEL : number.toFixed(6);
}

/** @param {unknown} value @returns {string} */
function globalFixed(value) {
  const number = finiteNumber(value);
  if (number === null) throw new TypeError(`Invalid canonical global coordinate: ${value}.`);
  return number.toFixed(3);
}

/** @param {Record<string, unknown>} canonical @returns {Map<string,Record<string,unknown>>} */
function nodeMap(canonical) {
  return new Map(canonical.nodes.map((node) => [node.id, node]));
}

/** @param {Record<string, unknown>} edge @param {Record<string, unknown>} from @param {Record<string, unknown>} to @param {Record<string,unknown>} values @param {string} fromName @param {string} toName @returns {Array<[string,unknown]>} */
function nativeAttributes(edge, from, to, values, fromName, toName) {
  const delta = { x: to.position.x - from.position.x, y: to.position.y - from.position.y, z: to.position.z - from.position.z };
  const attributes = [
    ['ID', edge.inputXmlElementIds[0]], ['FROM_NODE', fixed(from.inputXmlNodeIds[0])], ['TO_NODE', fixed(to.inputXmlNodeIds[0])],
    ['DELTA_X', fixed(delta.x)], ['DELTA_Y', fixed(delta.y)], ['DELTA_Z', fixed(delta.z)],
    ['DIAMETER', fixed(values.diameter)], ['WALL_THICK', fixed(values.wall)], ['INSUL_THICK', fixed(values.insulation)],
    ['CORR_ALLOW', fixed(values.corrosion)], ['TEMP_EXP_C1', fixed(values.temperature)],
  ];
  for (let index = 2; index <= 9; index += 1) attributes.push([`TEMP_EXP_C${index}`, SENTINEL]);
  attributes.push(['PRESSURE1', fixed(values.pressure)]);
  for (let index = 2; index <= 9; index += 1) attributes.push([`PRESSURE${index}`, SENTINEL]);
  attributes.push(
    ['HYDRO_PRESSURE', fixed(values.hydro)], ['MODULUS', fixed(values.modulus)],
    ['POISSONS', fixed(values.poisson)], ['PIPE_DENSITY', fixed(values.pipeDensity)],
    ['INSUL_DENSITY', fixed(values.insulationDensity)], ['FLUID_DENSITY', fixed(values.fluidDensity)],
    ['MATERIAL_NUM', fixed(values.materialNumber)], ['MATERIAL_NAME', cleanText(values.materialName)],
    ['NAME', cleanText(values.name)], ['LINE_ID', cleanText(values.lineId)],
    ['FROM_NAME', fromName], ['TO_NAME', toName],
    ['FROM_GLOBAL_X', globalFixed(from.position.x)], ['FROM_GLOBAL_Y', globalFixed(from.position.y)], ['FROM_GLOBAL_Z', globalFixed(from.position.z)],
    ['TO_GLOBAL_X', globalFixed(to.position.x)], ['TO_GLOBAL_Y', globalFixed(to.position.y)], ['TO_GLOBAL_Z', globalFixed(to.position.z)],
    ['GLOBAL_COORD_BASIS_NODE', from.inputXmlNodeIds[0]], ['SOURCE_TYPE', edge.sourceTypes[0]],
    ...topologyElementTraceAttributes(edge, from, to),
  );
  return attributes;
}

/** @param {Array<[string,unknown]>} attributes @returns {string} */
function serialize(attributes) {
  return attributes.map(([name, value]) => `${name}="${xmlAttribute(value)}"`).join(' ');
}

/** @param {Record<string,unknown>} restraint @param {Record<string,unknown>} support @param {number} index @returns {string} */
function restraintXml(restraint, support, index) {
  const type = cleanText(restraint.type || restraint.kind).toUpperCase();
  const code = RESTRAINT_CODE_MAP[type];
  if (!Number.isFinite(code)) throw new Error(`Unsupported CAESAR restraint type ${type || '(blank)'}.`);
  const cosine = type === '+X' ? [1, 0, 0] : type === '+Y' ? [0, 1, 0] : type === '+Z' ? [0, 0, 1] : [0, 0, 0];
  const attributes = [
    ['ID', `RESTRAINT:${support.id}:${index + 1}`], ['NUM', fixed(index + 1)], ['NODE', fixed(support.inputXmlNodeId)], ['TYPE', fixed(code)],
    ['STIFFNESS', fixed(restraint.stiffness)], ['GAP', fixed(restraint.gap)], ['FRIC_COEF', fixed(restraint.friction)],
    ['CNODE', SENTINEL], ['XCOSINE', fixed(cosine[0])], ['YCOSINE', fixed(cosine[1])], ['ZCOSINE', fixed(cosine[2])],
    ['TAG', support.tag], ['GUID', ''],
    ...topologyRestraintTraceAttributes(support),
  ];
  return `      <RESTRAINT ${serialize(attributes)}/>`;
}

/** @param {Record<string,unknown>} bend @param {Map<string,Record<string,unknown>>} nodes @returns {string} */
function bendXml(bend, nodes) {
  const node = nodes.get(bend.nodeId);
  if (!node) throw new Error(`Bend ${bend.id} references missing canonical node ${bend.nodeId}.`);
  const halfAngle = finiteNumber(bend.angleDeg) === null ? null : Number(bend.angleDeg) / 2;
  const attributes = [
    ['ID', bend.id], ['RADIUS', fixed(bend.radiusMm)], ['TYPE', SENTINEL],
    ['ANGLE1', fixed(halfAngle)], ['NODE1', fixed(node.inputXmlNodeIds[0])],
    ['ANGLE2', SENTINEL], ['NODE2', SENTINEL], ['ANGLE3', SENTINEL], ['NODE3', SENTINEL],
    ['NUM_MITER', SENTINEL], ['FITTINGTHICKNESS', SENTINEL], ['KFACTOR', SENTINEL],
    ['RADIUS_AUTHORITY', cleanText(bend.radiusAuthority)],
  ];
  return `      <BEND ${serialize(attributes)}/>`;
}

/** @param {Record<string, unknown>} canonical @returns {{supportsByEdge:Map<string,Record<string,unknown>[]>,namesByNode:Map<string,string>}} */
function supportIndex(canonical) {
  const supportsByEdge = new Map(), namesByNode = new Map();
  for (const support of canonical.supports) {
    namesByNode.set(support.nodeId, support.tag);
    const incident = canonical.edges.filter((edge) => (
      (edge.fromNodeId === support.nodeId || edge.toNodeId === support.nodeId)
      && support.sourceEntityIds.some((id) => edge.sourceEntityIds.includes(id))
    ));
    const edge = incident.find((row) => row.toNodeId === support.nodeId) ?? incident[0];
    if (!edge) throw new Error(`Support ${support.id} has no incident InputXML element.`);
    supportsByEdge.set(edge.id, [...(supportsByEdge.get(edge.id) ?? []), support]);
  }
  return { supportsByEdge, namesByNode };
}

function rigidGroupWeight(rigids) {
  const weights = rigids.map((rigid) => finiteNumber(rigid.weightKg));
  if (weights.some((weight) => weight === null)) return null;
  return weights.reduce((sum, weight) => sum + weight, 0);
}

/** @param {Record<string, unknown>} edge @param {Map<string,Record<string,unknown>>} nodes @param {Record<string,unknown>} values @param {Record<string,unknown>[]} supports @param {Record<string,unknown>[]} rigids @param {Map<string,string>} names @returns {string} */
function elementXml(edge, nodes, values, supports, rigids, bends, names) {
  const from = nodes.get(edge.fromNodeId), to = nodes.get(edge.toNodeId);
  if (!from || !to) throw new Error(`InputXML edge ${edge.id} references a missing canonical node.`);
  const attributes = nativeAttributes(edge, from, to, values, names.get(from.id) ?? '', names.get(to.id) ?? '');
  const children = [];
  if (rigids.length) {
    const weight = rigidGroupWeight(rigids);
    const types = [...new Set(rigids.map((rigid) => cleanText(rigid.componentType)).filter(Boolean))];
    children.push(`      <RIGID ${serialize([
      ['ID', `RIGID:${edge.id}`], ['WEIGHT', fixed(weight)], ['TYPE', types.join('+')], ['SOURCE_BODY_COUNT', rigids.length],
      ...topologyRigidTraceAttributes(edge, rigids),
    ])}/>`);
  }
  for (const bend of bends) children.push(bendXml(bend, nodes));
  for (const support of supports) for (const [index, restraint] of support.restraints.entries()) children.push(restraintXml(restraint, support, index));
  return `    <PIPINGELEMENT ${serialize(attributes)}>\n${children.join('\n')}${children.length ? '\n' : ''}    </PIPINGELEMENT>`;
}

/**
 * Serializes canonical topology and its resolved engineering projection to
 * native CAESAR II InputXML. Optional edit hashes bind an exported InputXML
 * snapshot to the exact draft and edit-ledger authority that produced it.
 *
 * @param {Record<string, unknown>} canonical
 * @param {Record<string,unknown>} engineering
 * @param {Record<string,unknown>} numberedProjection
 * @param {{jobName:string,inputXmlCompatibilityMode:string,topologyTraceLedgerHash?:string,topologyEditDraftHash?:string,topologyEditLedgerHash?:string}} options
 * @returns {string}
 */
export function buildTopologyInputXml(canonical, engineering, numberedProjection, options) {
  if (!cleanText(canonical.canonicalTopologyHashSha256)) throw new Error('Topology InputXML requires a hashed CanonicalTopology.v2 snapshot.');
  if (options.inputXmlCompatibilityMode !== 'CANONICAL_STRICT') {
    throw new Error('Topology InputXML writer requires explicit CANONICAL_STRICT compatibility mode.');
  }
  const numbered = applyNumberedTopologyProjection(canonical, numberedProjection);
  const nodes = nodeMap(numbered), supportData = supportIndex(numbered);
  const engineeringByEdge = buildEdgeEngineeringValues(numbered.edges, engineering.recordBySourceEntityId);
  const rigidByEdge = new Map();
  for (const rigid of numbered.rigids) rigidByEdge.set(rigid.edgeId, [...(rigidByEdge.get(rigid.edgeId) ?? []), rigid]);
  const bendByEdge = new Map();
  for (const bend of numbered.bends ?? []) {
    const edgeId = bend.edgeIds?.[0];
    if (!edgeId) throw new Error(`Bend ${bend.id} has no owning InputXML edge.`);
    bendByEdge.set(edgeId, [...(bendByEdge.get(edgeId) ?? []), bend]);
  }
  const elements = numbered.edges.map((edge) => elementXml(
    edge, nodes, engineeringByEdge.get(edge.id),
    supportData.supportsByEdge.get(edge.id) ?? [], rigidByEdge.get(edge.id) ?? [],
    bendByEdge.get(edge.id) ?? [], supportData.namesByNode,
  )).join('\n');
  const restraintCount = numbered.supports.reduce((sum, support) => sum + support.restraints.length, 0);
  const derivedBendCount = numbered.edges.filter((edge) => edge.segmentRole.includes('ELBO/BEND_RUN_IN')).length;
  const bendCount = derivedBendCount + (numbered.bends ?? []).length;
  const modelAttributes = [
    ['JOBNAME', options.jobName], ['NUMELT', numbered.edges.length], ['NUMNOZ', 0], ['NOHGRS', 0], ['NUMBEND', bendCount],
    ['NUMRIGID', rigidByEdge.size], ['NUMEXPJNT', 0], ['NUMREST', restraintCount], ['NUMFORCMNT', 0], ['NUMUNFLOAD', 0],
    ['NUMWIND', 0], ['NUMELEOFF', 0], ['NUMALLOW', 0], ['NUMISECT', 0], ['NORTH_X', 0], ['NORTH_Y', 1], ['NORTH_Z', 0],
    ['CANONICAL_TOPOLOGY_HASH', cleanText(options.legacyCanonicalTopologyHash)],
    ['CANONICAL_TOPOLOGY_SHA256', canonical.canonicalTopologyHashSha256], ['TOPO_NODE_PLAN_HASH', numberedProjection.topoNodePlanHashSha256],
    ['NUMBERED_TOPOLOGY_PROJECTION_HASH', numberedProjection.numberedTopologyProjectionHashSha256],
    ['TOPOLOGY_TRACE_LEDGER_HASH', cleanText(options.topologyTraceLedgerHash)],
    ['INPUTXML_COMPATIBILITY_MODE', options.inputXmlCompatibilityMode],
  ];
  if (cleanText(options.topologyEditDraftHash)) modelAttributes.push(['TOPOLOGY_EDIT_DRAFT_HASH', cleanText(options.topologyEditDraftHash)]);
  if (cleanText(options.topologyEditLedgerHash)) modelAttributes.push(['TOPOLOGY_EDIT_LEDGER_HASH', cleanText(options.topologyEditLedgerHash)]);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">',
    `  <PIPINGMODEL xmlns="" ${serialize(modelAttributes)}>`,
    elements,
    '  </PIPINGMODEL>',
    '</CAESARII>',
    '',
  ].join('\n');
}

export const _test = Object.freeze({ finiteNumber, fixed, globalFixed, physicalWall, nodeMap, engineeringRecord, engineeringValues, nativeAttributes, serialize, supportIndex, bendXml, rigidGroupWeight, elementXml });
