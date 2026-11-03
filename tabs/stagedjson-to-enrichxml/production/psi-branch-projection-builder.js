import { canonicalSemanticJson, text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import {
  array, assertUnchanged, freeze, issue, makeValidation, shaSemantic, snapshot,
} from './production-common.js';

export async function buildProductionBranchProjections({ sequencePlan, occurrencePlan }) {
  const input = { sequencePlan, occurrencePlan };
  const before = snapshot(input);
  const blockers = [];
  const projectionBySource = indexComponentProjections(occurrencePlan, blockers);
  const ordered = orderedMembership(sequencePlan, projectionBySource, blockers);
  validateCoverage(occurrencePlan, ordered, blockers);
  let canonical = null;
  let sequential = null;
  if (!blockers.length) {
    canonical = await buildProjection('CANONICAL', sequencePlan, ordered);
    sequential = await buildProjection('SOURCE_SEQUENTIAL', sequencePlan, ordered);
  }
  const result = freeze({
    schema: 'PsiBranchProjectionBuildResult.v1',
    canonical,
    sequential,
    validation: makeValidation(blockers),
  });
  assertUnchanged(input, before, 'Branch projection builder');
  return result;
}

async function buildProjection(kind, sequencePlan, ordered) {
  const groups = kind === 'CANONICAL'
    ? canonicalGroups(sequencePlan, ordered)
    : sequentialGroups(sequencePlan, ordered);
  const branches = [];
  for (const group of groups) branches.push(await buildBranch(kind, sequencePlan, group));
  const semantic = {
    schema: 'PsiBranchProjection.v1',
    projectId: text(sequencePlan.projectId),
    zoneId: text(sequencePlan.zoneId),
    projectionKind: kind,
    branches,
  };
  return freeze({ ...semantic, projectionId: await shaSemantic(semantic) });
}

async function buildBranch(kind, sequencePlan, group) {
  const branchName = kind === 'CANONICAL' ? group.canonicalMainLine : group.sourceBranch;
  const semantic = {
    projectId: text(sequencePlan.projectId),
    zoneId: text(sequencePlan.zoneId),
    projectionKind: kind,
    branchName,
    canonicalMainLine: group.canonicalMainLine,
    sourceBranches: group.sourceBranches,
    componentProjectionIds: group.componentProjectionIds,
  };
  return {
    branchId: await shaSemantic(semantic),
    branchName,
    canonicalMainLine: group.canonicalMainLine,
    sourceBranches: group.sourceBranches,
    componentProjectionIds: group.componentProjectionIds,
  };
}

function orderedMembership(sequencePlan, projectionBySource, blockers) {
  const rows = [];
  const seen = new Set();
  for (const component of array(sequencePlan?.components)) {
    const sourceEntityId = text(component?.sourceEntityId);
    const sourceBranch = text(component?.sourceBranch);
    const projection = projectionBySource.get(sourceEntityId);
    if (!projection) {
      blockers.push(issue('BRANCH_PROJECTION_COMPONENT_MISSING', { sourceEntityId }));
      continue;
    }
    if (seen.has(projection.componentProjectionId)) blockers.push(issue(
      'BRANCH_PROJECTION_COMPONENT_DUPLICATE', { componentProjectionId: projection.componentProjectionId },
    ));
    seen.add(projection.componentProjectionId);
    const branch = array(sequencePlan?.branches).find((row) => text(row?.sourceBranch) === sourceBranch);
    if (!branch) blockers.push(issue('BRANCH_PROJECTION_SOURCE_BRANCH_MISSING', { sourceEntityId, sourceBranch }));
    rows.push({
      sourceEntityId,
      sourceBranch,
      canonicalMainLine: text(branch?.canonicalMainLine),
      componentProjectionId: projection.componentProjectionId,
    });
  }
  return rows;
}

function indexComponentProjections(occurrencePlan, blockers) {
  const result = new Map();
  for (const projection of array(occurrencePlan?.componentProjection)) {
    const sourceEntityId = text(projection?.sourceEntityId);
    if (!sourceEntityId || result.has(sourceEntityId)) blockers.push(issue(
      'BRANCH_PROJECTION_SOURCE_ENTITY_CONFLICT', { sourceEntityId },
    ));
    else result.set(sourceEntityId, projection);
  }
  return result;
}

function canonicalGroups(sequencePlan, ordered) {
  const groups = new Map();
  for (const branch of array(sequencePlan?.branches)) {
    const line = text(branch?.canonicalMainLine);
    if (!groups.has(line)) groups.set(line, {
      canonicalMainLine: line, sourceBranches: [], componentProjectionIds: [],
    });
    addUnique(groups.get(line).sourceBranches, text(branch?.sourceBranch));
  }
  for (const row of ordered) groups.get(row.canonicalMainLine)?.componentProjectionIds.push(row.componentProjectionId);
  return [...groups.values()];
}

function sequentialGroups(sequencePlan, ordered) {
  return array(sequencePlan?.branches).map((branch) => {
    const sourceBranch = text(branch?.sourceBranch);
    return {
      sourceBranch,
      canonicalMainLine: text(branch?.canonicalMainLine),
      sourceBranches: [sourceBranch],
      componentProjectionIds: ordered.filter((row) => row.sourceBranch === sourceBranch)
        .map((row) => row.componentProjectionId),
    };
  });
}

function validateCoverage(occurrencePlan, ordered, blockers) {
  const expected = array(occurrencePlan?.componentProjection).map((row) => text(row?.componentProjectionId)).sort();
  const actual = ordered.map((row) => row.componentProjectionId).sort();
  if (canonicalSemanticJson(expected) !== canonicalSemanticJson(actual)) blockers.push(issue(
    'BRANCH_PROJECTION_COVERAGE_MISMATCH', { expected, actual },
  ));
  const numberFields = findNumberFields({ ordered });
  if (numberFields.length) blockers.push(issue('BRANCH_PROJECTION_ALLOCATION_DRIFT', { fields: numberFields }));
}

function findNumberFields(value, result = []) {
  if (Array.isArray(value)) value.forEach((row) => findNumberFields(row, result));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (/(engineeringNodeNumber|nodeNumber|counter|offset|increment|lease|range)/i.test(key)) result.push(key);
    findNumberFields(child, result);
  }
  return [...new Set(result)].sort();
}

function addUnique(rows, value) {
  if (value && !rows.includes(value)) rows.push(value);
}
