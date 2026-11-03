import { canonicalSemanticJson, computeSemanticHash } from '../../contracts/topo-enriched-xml/contract-core.js';
import { PSIWRITEROCCURRENCEPLAN_V1, TOPOSEQUENCEPLAN_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import { isSupportType, mapComponentType } from './sj-type-mapper.js';
import { arrivePosition, bestPosition, leavePosition, parsePoint } from './sj-point-resolver.js';

const PLAN_SCHEMA = 'PsiWriterOccurrencePlan.v1';
const ROOT_FIELDS = ['projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash'];
const POSITION_POLICIES = Object.freeze({
  ARRIVE: Object.freeze({ select: arrivePosition, fields: ['APOS', 'HPOS', 'POS'], directRole: 'APOS' }),
  LEAVE: Object.freeze({ select: leavePosition, fields: ['LPOS', 'TPOS', 'POS'], directRole: 'LPOS' }),
  BEST: Object.freeze({ select: bestPosition, fields: ['APOS', 'POS', 'LPOS', 'HPOS', 'TPOS', 'BPOS'], directRole: null }),
});

export async function buildPsiWriterOccurrencePlan(input) {
  const root = requiredRoot(input);
  const blockers = [], reviewItems = [], warnings = [];
  const sequencePlan = input?.sequencePlan;
  const sequenceErrors = TOPOSEQUENCEPLAN_V1.validate(sequencePlan);
  addIssue(blockers, sequenceErrors.length, 'INVALID_SEQUENCE_PLAN', { errors: sequenceErrors });
  addSequenceStatus(sequencePlan, blockers, reviewItems, warnings);
  validateSequenceChain(root, sequencePlan, blockers);
  await validateSequenceHash(root.sequencePlanHash, sequencePlan, blockers);
  const recordsById = indexRecords(input?.records, blockers);
  const canonicalByBranch = indexBranches(sequencePlan?.branches, blockers);
  const state = createState(blockers);
  const components = Array.isArray(sequencePlan?.components) ? sequencePlan.components : [];
  for (const [componentSequence, component] of components.entries()) {
    await appendComponent({
      component, componentSequence,
      record: recordsById.get(text(component?.sourceEntityId)),
      canonicalMainLine: canonicalByBranch.get(text(component?.sourceBranch)),
      logicalNodeBySourceEntityId: input?.logicalNodeBySourceEntityId,
      root, state,
    });
  }
  const validation = buildValidation(blockers, reviewItems, warnings);
  const semantic = semanticPlan(root, state.occurrences, state.projections);
  const candidate = {
    ...semantic, evaluatedAt: input?.evaluatedAt ?? null, validation,
    occurrencePlanHash: await hashPlan(semantic),
  };
  const contractErrors = PSIWRITEROCCURRENCEPLAN_V1.validate(candidate);
  if (contractErrors.length) throw new TypeError(`PsiWriterOccurrencePlan.v1 validation failed: ${contractErrors.join('; ')}`);
  return PSIWRITEROCCURRENCEPLAN_V1.freeze(candidate);
}

function requiredRoot(input) {
  const root = {};
  for (const field of ROOT_FIELDS) {
    root[field] = text(input?.[field]);
    if (!root[field]) throw new TypeError(`${field} is required.`);
  }
  return root;
}

function addSequenceStatus(plan, blockers, reviewItems, warnings) {
  const validation = plan?.validation || {};
  if (validation.status === 'BLOCKED') blockers.push(issue('SEQUENCE_PLAN_BLOCKED', { blockers: validation.blockers || [] }));
  if (validation.status === 'REVIEW_REQUIRED') reviewItems.push(issue('SEQUENCE_PLAN_REVIEW_REQUIRED', { reviewItems: validation.reviewItems || [] }));
  warnings.push(...(validation.warnings || []));
}

function validateSequenceChain(root, plan, blockers) {
  for (const field of ROOT_FIELDS.slice(0, 4)) {
    if (text(plan?.[field]) !== root[field]) {
      blockers.push(issue('SEQUENCE_PLAN_CHAIN_MISMATCH', { field, expected: root[field], actual: text(plan?.[field]) }));
    }
  }
}

async function validateSequenceHash(expected, plan, blockers) {
  if (!plan || typeof plan !== 'object') return;
  const actual = await computeSemanticHash(plan, 'sequencePlanHash');
  if (actual !== expected) blockers.push(issue('SEQUENCE_PLAN_HASH_MISMATCH', { expected, actual }));
}

function indexRecords(records, blockers) {
  const result = new Map();
  if (!Array.isArray(records)) {
    blockers.push(issue('INVALID_RECORDS_INPUT'));
    return result;
  }
  for (const [recordIndex, record] of records.entries()) {
    const sourceEntityId = text(record?.sourceEntityId);
    if (!sourceEntityId) {
      blockers.push(issue('MISSING_SOURCE_ENTITY_ID', { recordIndex }));
    } else if (result.has(sourceEntityId)) {
      blockers.push(issue('DUPLICATE_SOURCE_ENTITY_ID', { sourceEntityId }));
      result.set(sourceEntityId, null);
    } else result.set(sourceEntityId, record);
  }
  return result;
}

function indexBranches(branches, blockers) {
  const result = new Map();
  for (const branch of Array.isArray(branches) ? branches : []) {
    const sourceBranch = text(branch?.sourceBranch);
    const canonicalMainLine = text(branch?.canonicalMainLine);
    if (!sourceBranch || !canonicalMainLine) blockers.push(issue('INVALID_SEQUENCE_BRANCH', { sourceBranch, canonicalMainLine }));
    else result.set(sourceBranch, canonicalMainLine);
  }
  return result;
}

function createState(blockers) {
  return { blockers, occurrences: [], projections: [], occurrenceIds: new Set(), projectionIds: new Set() };
}

async function appendComponent(context) {
  const sourceEntityId = text(context.component?.sourceEntityId);
  const sourceBranch = text(context.component?.sourceBranch);
  if (!context.record) {
    context.state.blockers.push(issue('MISSING_SEQUENCE_RECORD', { sourceEntityId }));
    return;
  }
  if (!context.canonicalMainLine) {
    context.state.blockers.push(issue('MISSING_CANONICAL_MAIN_LINE', { sourceEntityId, sourceBranch }));
    return;
  }
  const types = resolveTypes(context.record);
  if (!types.rawComponentType) {
    context.state.blockers.push(issue('UNSUPPORTED_COMPONENT_SEMANTICS', { sourceEntityId, reason: 'BLANK_COMPONENT_TYPE' }));
    return;
  }
  const componentProjectionId = await projectionId(context.root, sourceEntityId, sourceBranch, context.canonicalMainLine);
  const occurrences = await buildOccurrences({
    ...context, ...types, componentProjectionId, specs: occurrenceSpecs(types),
  });
  if (context.state.projectionIds.has(componentProjectionId)) {
    context.state.blockers.push(issue('DUPLICATE_COMPONENT_PROJECTION_ID', { componentProjectionId, sourceEntityId }));
    recordOccurrenceCollisions(occurrences, context.state);
    return;
  }
  const accepted = acceptOccurrences(occurrences, context.state);
  if (!accepted.length) {
    context.state.blockers.push(issue('CONTRADICTORY_COMPONENT_PROJECTION', { sourceEntityId, componentProjectionId }));
    return;
  }
  context.state.projectionIds.add(componentProjectionId);
  context.state.occurrences.push(...accepted);
  context.state.projections.push(buildProjection(context, types, componentProjectionId, accepted));
}

function resolveTypes(record) {
  const rawComponentType = text(record?.componentType ?? record?.rawType ?? record?.type
    ?? record?.attrs?.RAW_TYPE ?? record?.attributes?.RAW_TYPE).toUpperCase();
  let normalizedComponentType = rawComponentType ? mapComponentType(rawComponentType) : '';
  if (rawComponentType === 'REDUCER') normalizedComponentType = 'REDU';
  if (isSupportType(rawComponentType)) normalizedComponentType = 'ATTA';
  return { rawComponentType, normalizedComponentType };
}

function occurrenceSpecs(types) {
  if (isSupportType(types.rawComponentType)) return [spec('PRIMARY', 1, 'ATTA', 'BEST', 'EMITTED')];
  if (types.normalizedComponentType === 'PIPE') return pair('PIPE');
  if (types.normalizedComponentType === 'OLET') return pair('OLET');
  if (types.normalizedComponentType === 'ELBO') return [
    spec('ARRIVE', 0, 'ELBO', 'ARRIVE', 'EMITTED'),
    spec('RESERVED_AFTER', 'RESERVED', 'ELBO', 'NONE', 'RESERVED'),
  ];
  if (types.normalizedComponentType === 'TEE') return [
    spec('RESERVED_BEFORE', 'RESERVED', 'BRAN', 'NONE', 'RESERVED'),
    spec('BRANCH_LEAVE', 1, 'BRAN', 'LEAVE', 'EMITTED'),
  ];
  if (types.normalizedComponentType === 'REDU') return [
    spec('RESERVED_BEFORE', 'RESERVED', 'REDU', 'NONE', 'RESERVED'),
    spec('LEAVE', 2, 'REDU', 'LEAVE', 'EMITTED'),
  ];
  return [spec('PRIMARY', 1, types.normalizedComponentType, 'BEST', 'EMITTED')];
}

function pair(type) {
  return [spec('ARRIVE', 1, type, 'ARRIVE', 'EMITTED'), spec('LEAVE', 2, type, 'LEAVE', 'EMITTED')];
}

async function buildOccurrences(context) {
  const result = [];
  for (const [occurrenceSequence, definition] of context.specs.entries()) {
    const coordinate = coordinateEvidence(context.record, definition.coordinateRequest);
    if (definition.disposition === 'EMITTED' && !coordinate.available) {
      context.state.blockers.push(issue('MISSING_EMITTED_COORDINATE', {
        sourceEntityId: text(context.component?.sourceEntityId), projectionRole: definition.projectionRole,
      }));
    }
    result.push(await buildOccurrence(context, definition, coordinate, occurrenceSequence));
  }
  return result;
}

async function buildOccurrence(context, definition, coordinate, occurrenceSequence) {
  const identity = {
    componentProjectionId: context.componentProjectionId,
    projectionRole: definition.projectionRole,
    endpoint: definition.endpoint,
    psiComponentType: definition.psiComponentType,
    coordinateRole: coordinate.selectedRole,
    disposition: definition.disposition,
  };
  const role = definition.projectionRole;
  const logicalNodeId = text(context.logicalNodeBySourceEntityId?.[text(context.component?.sourceEntityId)]?.[role]);
  return {
    occurrenceId: await semanticId('WO', identity),
    sourceEntityId: text(context.component?.sourceEntityId),
    sourceBranch: text(context.component?.sourceBranch),
    canonicalMainLine: context.canonicalMainLine,
    ...identity,
    ...(logicalNodeId ? { logicalNodeId } : {}),
    ...(text(context.record?.sourceRecordId) ? { sourceRecordId: text(context.record.sourceRecordId) } : {}),
    rawComponentType: context.rawComponentType,
    normalizedComponentType: context.normalizedComponentType,
    coordinateEvidence: coordinate,
    orderingEvidence: { componentSequence: context.componentSequence, occurrenceSequence },
  };
}

function coordinateEvidence(record, request) {
  if (request === 'NONE') return { selectedRole: 'NONE', sourceField: null, available: false };
  const attrs = record?.attrs || record?.attributes || {};
  const owner = record?.attrs ? 'attrs' : 'attributes';
  const policy = POSITION_POLICIES[request] || POSITION_POLICIES.BEST;
  const point = policy.select(attrs);
  if (!point) return { selectedRole: policy.directRole || 'BEST', sourceField: null, available: false };
  const sourceKey = policy.fields.find((key) => parsePoint(attrs?.[key])) || null;
  const selectedRole = sourceKey === policy.directRole ? policy.directRole : 'BEST';
  return evidence(selectedRole || 'BEST', sourceKey ? `${owner}.${sourceKey}` : null, point);
}

function evidence(selectedRole, sourceField, point) {
  return { selectedRole, sourceField: sourceField || null, available: true, point };
}

function acceptOccurrences(occurrences, state) {
  const accepted = [];
  for (const occurrence of occurrences) {
    if (state.occurrenceIds.has(occurrence.occurrenceId)) {
      state.blockers.push(issue('DUPLICATE_OCCURRENCE_ID', {
        occurrenceId: occurrence.occurrenceId, sourceEntityId: occurrence.sourceEntityId,
      }));
    } else {
      state.occurrenceIds.add(occurrence.occurrenceId);
      accepted.push(occurrence);
    }
  }
  return accepted;
}

function recordOccurrenceCollisions(occurrences, state) {
  for (const occurrence of occurrences) {
    if (state.occurrenceIds.has(occurrence.occurrenceId)) {
      state.blockers.push(issue('DUPLICATE_OCCURRENCE_ID', { occurrenceId: occurrence.occurrenceId }));
    }
  }
}

function buildProjection(context, types, componentProjectionId, occurrences) {
  return {
    componentProjectionId,
    sourceEntityId: text(context.component?.sourceEntityId),
    sourceBranch: text(context.component?.sourceBranch),
    canonicalMainLine: context.canonicalMainLine,
    rawComponentType: types.rawComponentType,
    normalizedComponentType: types.normalizedComponentType,
    occurrenceIds: occurrences.map((occurrence) => occurrence.occurrenceId),
  };
}

function semanticPlan(root, occurrences, componentProjection) {
  return { schema: PLAN_SCHEMA, ...root, occurrences, componentProjection };
}
function buildValidation(blockers, reviewItems, warnings) {
  return { status: blockers.length ? 'BLOCKED' : (reviewItems.length ? 'REVIEW_REQUIRED' : 'PASS'), blockers, reviewItems, warnings };
}
async function projectionId(root, sourceEntityId, sourceBranch, canonicalMainLine) {
  return semanticId('CP', { projectId: root.projectId, zoneId: root.zoneId, sourceEntityId, sourceBranch, canonicalMainLine });
}
async function semanticId(prefix, value) {
  return `${prefix}-${(await sha256Hex(canonicalSemanticJson(value))).slice(0, 24)}`;
}
async function hashPlan(semantic) { return `sha256:${await sha256Hex(canonicalSemanticJson(semantic))}`; }
async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is required.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function spec(projectionRole, endpoint, psiComponentType, coordinateRequest, disposition) {
  return Object.freeze({ projectionRole, endpoint, psiComponentType, coordinateRequest, disposition });
}
function addIssue(target, condition, code, evidence) { if (condition) target.push(issue(code, evidence)); }
function issue(code, evidence = {}) { return { code, evidence }; }
function text(value) { return String(value ?? '').trim(); }
