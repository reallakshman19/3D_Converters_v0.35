/**
 * Builds an immutable, source-grounded sequence plan for the future PSI writer.
 * This module does not serialize XML and does not infer geometry. It preserves
 * exact source branch identity, source traversal order, HREF/TREF/CREF evidence,
 * and the surviving enriched-record order.
 */

import { resolveBranchIdentity } from './sj-branch-identity.js';

export const PSI_SEQUENCE_PLAN_SCHEMA = 'stagedjson-psi-sequence-plan/v1';

export function buildPsiSequencePlan(stagedJson, records = []) {
  const errors = [];
  const warnings = [];
  const sourceBranches = collectSourceBranches(stagedJson, errors);
  const branchesByName = new Map(sourceBranches.map((branch) => [branch.sourceName, branch]));
  const recordGroups = groupRecords(records, branchesByName, sourceBranches.length, errors);
  const allBranches = appendRecordOnlyBranches(sourceBranches, recordGroups, branchesByName);

  const branches = allBranches
    .sort(compareBranch)
    .map((branch, branchSequence) => buildBranchPlan(
      branch,
      recordGroups.get(branch.sourceName) || [],
      branchSequence,
    ));

  const knownNames = new Set(branches.map((branch) => branch.sourceBranchName));
  const unresolvedReferences = [];
  for (const branch of branches) {
    for (const reference of branch.references) {
      if (!knownNames.has(reference.targetBranchName)) {
        unresolvedReferences.push({
          sourceBranchName: branch.sourceBranchName,
          ...reference,
        });
      }
    }
    if (branch.components.length === 0) {
      warnings.push(`Source branch ${branch.sourceBranchName} has no exported components.`);
    }
  }
  for (const reference of unresolvedReferences) {
    warnings.push(
      `${reference.kind} reference from ${reference.sourceBranchName} targets absent branch ${reference.targetBranchName}.`,
    );
  }

  const canonicalNames = new Set(branches.map((branch) => branch.canonicalBranchName));
  const componentCount = branches.reduce((total, branch) => total + branch.components.length, 0);

  return Object.freeze({
    schema: PSI_SEQUENCE_PLAN_SCHEMA,
    orderingPolicy: 'SOURCE_BRANCH_TRAVERSAL_THEN_SURVIVING_RECORD_ORDER',
    branches: Object.freeze(branches),
    unresolvedReferences: Object.freeze(unresolvedReferences),
    summary: Object.freeze({
      sourceBranchCount: branches.length,
      canonicalBranchCount: canonicalNames.size,
      componentCount,
      unresolvedReferenceCount: unresolvedReferences.length,
    }),
    validation: Object.freeze({
      ok: errors.length === 0,
      errors: Object.freeze(unique(errors)),
      warnings: Object.freeze(unique(warnings)),
    }),
  });
}

function collectSourceBranches(stagedJson, errors) {
  const root = Array.isArray(stagedJson) ? stagedJson : (stagedJson?.objects || [stagedJson]);
  const branches = [];
  const names = new Set();

  walk(root, (node) => {
    const attrs = plain(node.attributes);
    const rawType = text(node.type || attrs.TYPE || attrs.RAW_TYPE).toUpperCase();
    if (rawType !== 'BRANCH') return;

    const identity = resolveBranchIdentity({
      sourceName: node.name || attrs.NAME,
      owner: attrs.OWNER,
      sourceOrder: branches.length,
      headRef: attrs.HREF,
      tailRef: attrs.TREF,
      headPosition: attrs.HPOS,
      tailPosition: attrs.TPOS,
    });
    if (!identity.sourceName) {
      errors.push(`Source branch at order ${branches.length} has no identity.`);
      return;
    }
    if (names.has(identity.sourceName)) {
      errors.push(`Duplicate source branch identity ${identity.sourceName}.`);
      return;
    }
    names.add(identity.sourceName);
    branches.push(identity);
  });

  return branches;
}

function groupRecords(records, branchesByName, nextBranchOrder, errors) {
  if (!Array.isArray(records)) {
    errors.push('Enriched records must be an array.');
    return new Map();
  }

  const groups = new Map();
  records.forEach((record, sourceOrder) => {
    const sourceBranchName = text(record?.sourceBranchName || record?.branchName || '/UNMAPPED');
    if (!groups.has(sourceBranchName)) groups.set(sourceBranchName, []);
    groups.get(sourceBranchName).push({ record, sourceOrder });

    if (!branchesByName.has(sourceBranchName)) {
      branchesByName.set(sourceBranchName, resolveBranchIdentity({
        sourceName: sourceBranchName,
        owner: record?.branchOwner || record?.branchName,
        sourceOrder: nextBranchOrder + branchesByName.size,
      }));
    }
  });
  return groups;
}

function appendRecordOnlyBranches(sourceBranches, recordGroups, branchesByName) {
  const result = [...sourceBranches];
  const included = new Set(result.map((branch) => branch.sourceName));
  for (const sourceBranchName of recordGroups.keys()) {
    if (included.has(sourceBranchName)) continue;
    result.push(branchesByName.get(sourceBranchName));
    included.add(sourceBranchName);
  }
  return result;
}

function buildBranchPlan(branch, groupedRecords, branchSequence) {
  const components = groupedRecords
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map(({ record, sourceOrder }, componentSequence) => Object.freeze({
      sequence: componentSequence,
      sourceOrder,
      name: text(record?.name),
      ref: text(record?.ref || record?.attrs?.REF || record?.name),
      componentType: text(record?.componentType || record?.rawType || 'UNKNOWN'),
      connectionBranchRefs: Object.freeze(unique([
        record?.attrs?.CREF,
        record?.attrs?.HREF,
        record?.attrs?.TREF,
      ].map(text).filter(Boolean))),
      record,
    }));

  const references = [];
  addReference(references, 'HREF', branch.headRef);
  addReference(references, 'TREF', branch.tailRef);
  for (const component of components) {
    for (const targetBranchName of component.connectionBranchRefs) {
      addReference(references, 'CREF', targetBranchName, component.ref);
    }
  }

  return Object.freeze({
    sequence: branchSequence,
    sourceOrder: branch.sourceOrder,
    sourceBranchName: branch.sourceName,
    canonicalBranchName: branch.canonicalName,
    branchOwner: branch.owner,
    branchSuffix: branch.suffix,
    headPosition: branch.headPosition,
    tailPosition: branch.tailPosition,
    references: Object.freeze(references),
    components: Object.freeze(components),
  });
}

function addReference(references, kind, targetBranchName, componentRef = '') {
  const target = text(targetBranchName);
  if (!target) return;
  const key = `${kind}\u0000${target}\u0000${componentRef}`;
  if (references.some((reference) => reference.key === key)) return;
  references.push(Object.freeze({ key, kind, targetBranchName: target, componentRef }));
}

function compareBranch(left, right) {
  return left.sourceOrder - right.sourceOrder || left.sourceName.localeCompare(right.sourceName);
}

function walk(nodes, visit) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    visit(node);
    walk(node.children, visit);
  }
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values)];
}

function text(value) {
  return String(value ?? '').trim();
}
