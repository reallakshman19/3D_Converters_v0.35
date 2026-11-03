import { readFile } from 'node:fs/promises';
import { buildMappingWorklist } from '../../tabs/model-converters/converters/fbx/mapping-worklist.js';
import { createDecisionSet } from '../../tabs/model-converters/converters/fbx/mapping-decision-compiler.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { FAMILY_FIXTURE_URL, FAMILY_MAPPING_URL } from './family-helpers.mjs';
import { FIXTURE_URL, MAPPING_URL } from './helpers.mjs';
import { repositoryParserEvidence } from './mapping-package-helpers.mjs';

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

export async function worklistFixture(family = false) {
  const sourceUrl = family ? FAMILY_FIXTURE_URL : FIXTURE_URL;
  const mappingUrl = family ? FAMILY_MAPPING_URL : MAPPING_URL;
  const bytes = new Uint8Array(await readFile(sourceUrl));
  const [graph, parserEvidence, mapping] = await Promise.all([
    parseFbxBytesNode(bytes), repositoryParserEvidence(), readJson(mappingUrl),
  ]);
  const worklist = await buildMappingWorklist({ bytes, graph, parserEvidence });
  return { bytes, graph, parserEvidence, mapping, worklist };
}

export function explicitDecisions(worklist, mapping) {
  const entries = new Map(mapping.entries.map((entry) => [entry.sourceModelObjectId, entry]));
  const exclusions = new Map(mapping.exclusions.map((item) => [item.sourceModelObjectId, item]));
  return worklist.workItems.map((item) => {
    const entry = entries.get(item.sourceModelObjectId);
    if (entry) return { workItemId: item.workItemId, disposition: 'promote', mappingEntry: structuredClone(entry) };
    const exclusion = exclusions.get(item.sourceModelObjectId);
    if (exclusion) return { workItemId: item.workItemId, disposition: 'exclude-with-reason', reason: exclusion.reason };
    throw new Error(`fixture mapping has no decision for source ${item.sourceModelObjectId}`);
  });
}

export async function completeDecisionSet(context) {
  return createDecisionSet({
    worklist: context.worklist,
    decisions: explicitDecisions(context.worklist, context.mapping),
  });
}
