import { validateSourceEnvelope } from './source-envelope.js';
import { buildXmlSourceEntities } from './graph-xml-adapter.js';
import { buildJsonSourceEntities } from './graph-json-adapter.js';
import { summarizeUniversalSourceGraph } from './graph-summary.js';
import { validateUniversalSourceGraph } from './graph-validation.js';

function assertEnvelope(envelope) {
  const validation = validateSourceEnvelope(envelope);
  if (!validation.ok) throw new Error('A valid SourceEnvelope.v1 is required to build the source graph.');
}

async function projectEntities(envelope, dependencies) {
  if (envelope.sourceKind === 'stagedjson') return buildJsonSourceEntities(envelope, dependencies);
  if (envelope.sourceKind === 'xml' || envelope.sourceKind === 'inputxml') return buildXmlSourceEntities(envelope, dependencies);
  throw new Error(`Unsupported source kind: ${envelope.sourceKind}`);
}

export async function createUniversalSourceGraph(envelope, dependencies = {}) {
  assertEnvelope(envelope);
  const projected = await projectEntities(envelope, dependencies);
  const graph = {
    schema: 'UniversalSourceGraph.v1',
    sourceFileId: envelope.sourceFileId,
    sourceKind: envelope.sourceKind,
    sourceRevision: envelope.revision,
    contentHash: envelope.contentHash,
    rootEntityIds: projected.rootEntityIds,
    entities: projected.entities,
    summary: summarizeUniversalSourceGraph(projected.entities, projected.rootEntityIds),
  };
  return { ...graph, validation: validateUniversalSourceGraph(graph, envelope) };
}

export function serializeUniversalSourceGraph(graph) {
  return `${JSON.stringify(graph, null, 2)}\n`;
}
