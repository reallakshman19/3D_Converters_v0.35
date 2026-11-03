import { canonicalSemanticJson, computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import {
  bundleHashInput, computePsiWriterBundleHash, computeSemanticValueHash, computeTextHash,
} from '../../../../tabs/stagedjson-to-enrichxml/psi-writer-parity-bundle.js';

const PROJECT = 'TE-011';
const ZONE = 'ZONE-A';
const CONDITION = Object.freeze({ temperature: 100, pressure: 1000000 });

export async function makeParityFixture() {
  const occurrencePlan = await makeOccurrencePlan();
  const nodePlan = await makeNodePlan(occurrencePlan);
  const canonicalBundle = await makeBundle('CANONICAL', occurrencePlan, nodePlan);
  const sequentialBundle = await makeBundle('SOURCE_SEQUENTIAL', occurrencePlan, nodePlan);
  return { occurrencePlan, nodePlan, canonicalBundle, sequentialBundle };
}

export async function rehashBundle(bundle, mutate) {
  const next = structuredClone(bundle);
  mutate(next);
  next.xmlHash = await computeTextHash(next.xmlText);
  next.traceHash = await computeSemanticValueHash(next.trace);
  next.bundleHash = await computePsiWriterBundleHash(next);
  return next;
}

export function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
}

export function replaceNodeField(xml, occurrenceIndex, tag, value) {
  let seen = -1;
  return xml.replace(/<Node>[\s\S]*?<\/Node>/g, (block) => {
    seen += 1;
    if (seen !== occurrenceIndex) return block;
    return block.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`), `<${tag}>${value}</${tag}>`);
  });
}

export function duplicateFirstSequentialOccurrence(bundle) {
  const next = structuredClone(bundle);
  const node = next.xmlText.match(/<Node>[\s\S]*?<\/Node>/)?.[0];
  next.xmlText = next.xmlText.replace('</Branch>', `${node}\n</Branch>`);
  const duplicate = { ...next.trace[0], traceIndex: 2, nodeIndexInBranch: 2 };
  next.trace.splice(2, 0, duplicate);
  next.trace.slice(3).forEach((row, index) => { row.traceIndex = index + 3; });
  next.summary.traceCount = next.trace.length;
  next.summary.xmlNodeCount = next.trace.length;
  return next;
}

export function addExtraEmission(bundle) {
  const next = structuredClone(bundle);
  const node = nodeXml({ number: 540, type: 'REDU', endpoint: 2, name: '', ref: 'D1', position: '40,0,0' });
  next.xmlText = next.xmlText.replace(/<\/Branch>\s*<\/Pipe>/, `${node}\n</Branch>\n</Pipe>`);
  next.trace.push(traceRow({ occurrenceId: 'O-D', componentProjectionId: 'CP-D', sourceEntityId: 'D',
    logicalNodeId: 'LN-D', number: 540, type: 'REDU', role: 'LEAVE', endpoint: 2,
    branchProjectionId: next.branchProjectionId, projectionKind: next.projectionKind,
    branchName: next.projectionKind === 'CANONICAL' ? '/MAIN' : '/MAIN/B2', traceIndex: next.trace.length,
    branchIndex: next.projectionKind === 'CANONICAL' ? 0 : 1, nodeIndexInBranch: 1 }));
  next.summary.traceCount = next.trace.length;
  next.summary.xmlNodeCount = next.trace.length;
  return next;
}

export function addReservedEmission(bundle) {
  const next = structuredClone(bundle);
  const node = nodeXml({ number: 530, type: 'ELBO', endpoint: 0, name: '', ref: 'R1', position: '30,0,0' });
  next.xmlText = next.xmlText.replace(/<\/Branch>\s*<\/Pipe>/, `${node}\n</Branch>\n</Pipe>`);
  next.trace.push(traceRow({ occurrenceId: 'O-R', componentProjectionId: 'CP-C', sourceEntityId: 'C',
    logicalNodeId: 'LN-R', number: 530, type: 'ELBO', role: 'RESERVED_AFTER', endpoint: 0,
    branchProjectionId: next.branchProjectionId, projectionKind: next.projectionKind,
    branchName: next.projectionKind === 'CANONICAL' ? '/MAIN' : '/MAIN/B2', traceIndex: next.trace.length,
    branchIndex: next.projectionKind === 'CANONICAL' ? 0 : 1, nodeIndexInBranch: 1 }));
  next.summary.traceCount = next.trace.length;
  next.summary.xmlNodeCount = next.trace.length;
  return next;
}

export function preprocessRef(fixture) {
  return {
    schema: 'TopoPreprocessAuditRef.v1', artifactId: 'AUDIT-1', artifactHash: 'sha256:audit',
    projectId: fixture.occurrencePlan.projectId, zoneId: fixture.occurrencePlan.zoneId,
    nodePlanHash: fixture.nodePlan.nodePlanHash,
    occurrencePlanHash: fixture.occurrencePlan.occurrencePlanHash,
    serializationPlanHash: fixture.canonicalBundle.serializationPlanHash,
  };
}

async function makeOccurrencePlan() {
  const occurrences = [
    occurrence('O-A', 'A', '/MAIN/B1', 'CP-A', 'ARRIVE', 1, 'PIPE', 'EMITTED'),
    occurrence('O-B', 'B', '/MAIN/B1', 'CP-B', 'ARRIVE', 0, 'ELBO', 'EMITTED'),
    occurrence('O-C', 'C', '/MAIN/B2', 'CP-C', 'LEAVE', 2, 'REDU', 'EMITTED'),
    occurrence('O-R', 'C', '/MAIN/B2', 'CP-C', 'RESERVED_AFTER', 'RESERVED', 'ELBO', 'RESERVED'),
  ];
  const componentProjection = [
    projection('CP-A', 'A', ['O-A']), projection('CP-B', 'B', ['O-B']), projection('CP-C', 'C', ['O-C', 'O-R']),
  ];
  const semantic = {
    schema: 'PsiWriterOccurrencePlan.v1', projectId: PROJECT, zoneId: ZONE,
    sourceInventoryHash: 'sha256:source', logicalTopologyHash: 'sha256:topology',
    sequencePlanHash: 'sha256:sequence', occurrences, componentProjection,
  };
  return { ...semantic, validation: pass(), occurrencePlanHash: await computeSemanticValueHash(semantic) };
}

async function makeNodePlan(plan) {
  const allocations = new Map([['O-A', ['LN-A', 500]], ['O-B', ['LN-B', 510]], ['O-C', ['LN-C', 520]], ['O-R', ['LN-R', 530]]]);
  const rows = plan.occurrences.map((row) => nodeRow(row, allocations.get(row.occurrenceId)));
  const semantic = {
    schema: 'TopoNodePlan.v1', projectId: PROJECT, zoneId: ZONE,
    sourceInventoryHash: plan.sourceInventoryHash, logicalTopologyHash: plan.logicalTopologyHash,
    sequencePlanHash: plan.sequencePlanHash, baseRegistrySnapshotHash: 'sha256:registry', configHash: 'sha256:config',
    logicalNodes: rows.map((row) => ({ logicalNodeId: row.logicalNodeId })),
    emittedOccurrences: rows.filter((row) => row.disposition === 'EMITTED'),
    reservedOccurrences: rows.filter((row) => row.disposition === 'RESERVED'), rawPortMappings: [],
    componentProjection: plan.componentProjection.map((row) => ({
      componentProjectionId: row.componentProjectionId, sourceEntityId: row.sourceEntityId,
      emittedOccurrenceIds: row.occurrenceIds.filter((id) => plan.occurrences.find((item) => item.occurrenceId === id).disposition === 'EMITTED'),
      reservedOccurrenceIds: row.occurrenceIds.filter((id) => plan.occurrences.find((item) => item.occurrenceId === id).disposition === 'RESERVED'),
    })), validation: pass(),
  };
  return { ...semantic, nodePlanHash: await computeSemanticHash(semantic, 'nodePlanHash') };
}

async function makeBundle(kind, plan, nodePlan) {
  const canonical = kind === 'CANONICAL';
  const branchProjectionId = canonical ? 'BP-CANONICAL' : 'BP-SEQUENTIAL';
  const nodes = [
    nodeData('O-A', 'CP-A', 'A', 'LN-A', 500, 'PIPE', 'ARRIVE', 1, '/MAIN/B1', '/MAIN', 'P1', 'P1', '0,0,0'),
    nodeData('O-B', 'CP-B', 'B', 'LN-B', 510, 'ELBO', 'ARRIVE', 0, '/MAIN/B1', '/MAIN', '', 'E1', '10,0,0'),
    nodeData('O-C', 'CP-C', 'C', 'LN-C', 520, 'REDU', 'LEAVE', 2, '/MAIN/B2', '/MAIN', '', 'R1', '20,0,0'),
  ];
  const branches = canonical ? [{ name: '/MAIN', nodes }] : [
    { name: '/MAIN/B1', nodes: nodes.slice(0, 2) }, { name: '/MAIN/B2', nodes: nodes.slice(2) },
  ];
  const xmlText = xmlDocument(branches);
  const trace = branches.flatMap((branch, branchIndex) => branch.nodes.map((row, nodeIndexInBranch) => traceRow({
    ...row, branchName: branch.name, branchProjectionId, projectionKind: kind,
    traceIndex: 0, branchIndex, nodeIndexInBranch,
  }))).map((row, traceIndex) => ({ ...row, traceIndex }));
  const base = {
    schema: 'topo-enriched-xml-writer-bundle/v1', generated: true, selectable: false,
    operatingMode: 'SHADOW', profile: 'STRICT_PSI', evaluatedAt: '2026-07-20T07:00:00Z',
    projectId: PROJECT, zoneId: ZONE, nodePlanHash: nodePlan.nodePlanHash,
    occurrencePlanHash: plan.occurrencePlanHash, serializationPlanHash: 'sha256:serialization',
    branchProjectionId, projectionKind: kind, xmlText, xmlHash: await computeTextHash(xmlText),
    trace, traceHash: await computeSemanticValueHash(trace),
    summary: { branchCount: branches.length, emittedOccurrenceCount: 3, reservedOccurrenceCount: 1,
      xmlNodeCount: trace.length, traceCount: trace.length, writerSideAllocations: 0 }, validation: pass(),
  };
  return { ...base, bundleHash: await computeSemanticValueHash(bundleHashInput(base)) };
}

function xmlDocument(branches) {
  return ['<?xml version="1.0" encoding="utf-8"?>', '<PipeStressExport>', '<Pipe>',
    ...branches.flatMap((branch) => branchXml(branch)), '</Pipe>', '</PipeStressExport>'].join('\n');
}

function branchXml(branch) {
  return ['<Branch>', `<Branchname>${branch.name}</Branchname>`, conditionXml(),
    ...branch.nodes.map(nodeXml), '</Branch>'];
}

function conditionXml() {
  return `<Temperature><Temperature1>${CONDITION.temperature}</Temperature1>${rangeXml('Temperature', 2, 9, -100000)}</Temperature>\n`
    + `<Pressure><Pressure1>${CONDITION.pressure}</Pressure1>${rangeXml('Pressure', 2, 9, 0)}</Pressure>\n`
    + '<MaterialNumber>0</MaterialNumber>\n<InsulationDensity>0</InsulationDensity>\n<FluidDensity>0</FluidDensity>';
}

function nodeXml(row) {
  const rigid = row.type === 'ELBO' || row.type === 'REDU' ? '' : '<Rigid>0</Rigid>\n';
  const special = row.type === 'ELBO' ? '<BendType>0</BendType>\n' : (row.type === 'REDU' ? '<AlphaAngle>7.5</AlphaAngle>\n' : '');
  return `<Node>\n<NodeNumber>${row.number}</NodeNumber>\n<NodeName>${row.name}</NodeName>\n<Endpoint>${row.endpoint}</Endpoint>\n${rigid}`
    + `<ComponentType>${row.type}</ComponentType>\n<Weight>0</Weight>\n<ComponentRefNo>${row.ref}</ComponentRefNo>\n`
    + `<ConnectionType>${row.type === 'REDU' ? '' : row.type}</ConnectionType>\n<OutsideDiameter>114.3</OutsideDiameter>\n`
    + '<WallThickness>6.02</WallThickness>\n<CorrosionAllowance>1.5</CorrosionAllowance>\n<InsulationThickness>50</InsulationThickness>\n'
    + `<Position>${row.position}</Position>\n<BendRadius>${row.type === 'ELBO' ? 152.4 : 0}</BendRadius>\n${special}<SIF>0</SIF>\n</Node>`;
}

function occurrence(id, sourceEntityId, sourceBranch, componentProjectionId, projectionRole, endpoint, psiComponentType, disposition) {
  return { occurrenceId: id, sourceEntityId, sourceBranch, canonicalMainLine: '/MAIN', componentProjectionId,
    projectionRole, endpoint, psiComponentType, coordinateRole: disposition === 'RESERVED' ? 'NONE' : projectionRole,
    disposition, rawComponentType: psiComponentType, normalizedComponentType: psiComponentType };
}
function projection(componentProjectionId, sourceEntityId, occurrenceIds) { return { componentProjectionId, sourceEntityId, sourceBranch: sourceEntityId === 'C' ? '/MAIN/B2' : '/MAIN/B1', canonicalMainLine: '/MAIN', rawComponentType: 'PIPE', normalizedComponentType: 'PIPE', occurrenceIds }; }
function nodeRow(row, allocation) { return { ...row, logicalNodeId: allocation[0], engineeringNodeNumber: allocation[1] }; }
function nodeData(occurrenceId, componentProjectionId, sourceEntityId, logicalNodeId, number, type, role, endpoint, sourceBranch, canonicalMainLine, name, ref, position) { return { occurrenceId, componentProjectionId, sourceEntityId, logicalNodeId, number, type, role, endpoint, sourceBranch, canonicalMainLine, name, ref, position }; }
function traceRow(row) { return { traceIndex: row.traceIndex, branchIndex: row.branchIndex, nodeIndexInBranch: row.nodeIndexInBranch, branchProjectionId: row.branchProjectionId, branchName: row.branchName, projectionKind: row.projectionKind, occurrenceId: row.occurrenceId, componentProjectionId: row.componentProjectionId, sourceEntityId: row.sourceEntityId, logicalNodeId: row.logicalNodeId, engineeringNodeNumber: row.number, psiComponentType: row.type, projectionRole: row.role, endpoint: row.endpoint }; }
function rangeXml(prefix, start, end, value) { return Array.from({ length: end - start + 1 }, (_, index) => `<${prefix}${index + start}>${value}</${prefix}${index + start}>`).join(''); }
function pass() { return { status: 'PASS', blockers: [], reviewItems: [], warnings: [] }; }
