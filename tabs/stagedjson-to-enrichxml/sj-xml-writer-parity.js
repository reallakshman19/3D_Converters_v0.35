/**
 * Read-only comparison contract for canonical and sequential PSI XML outputs.
 */

export const PSI_XML_WRITER_PARITY_SCHEMA = 'stagedjson-psi-xml-writer-parity/v1';

const NODE_FIELDS = Object.freeze([
  'NodeName', 'Endpoint', 'Rigid', 'ComponentType', 'Weight', 'ComponentRefNo',
  'ConnectionType', 'OutsideDiameter', 'WallThickness', 'CorrosionAllowance',
  'InsulationThickness', 'Position', 'BendRadius', 'BendType', 'AlphaAngle',
  'SIF', 'DTXR_POS', 'DTXR_SOURCE',
]);

export function comparePsiWriterOutputs({ canonicalXmlText, sequentialXmlText, sequencePlan }) {
  const canonical = parseWriterXml(canonicalXmlText);
  const sequential = parseWriterXml(sequentialXmlText);
  const plannedBranches = sequencePlan?.branches || [];
  const expectedNames = plannedBranches.map((branch) => branch.sourceBranchName);
  const actualNames = sequential.branches.map((branch) => branch.name);
  const membershipIssues = validateMembership(sequential.branches, plannedBranches);
  const canonicalSignatures = canonical.nodes.map((node) => node.semanticSignature);
  const sequentialSignatures = sequential.nodes.map((node) => node.semanticSignature);
  const allocationMismatches = compareAllocations(canonical.nodes, sequential.nodes);
  const conditionMismatches = compareConditions(canonical, sequential, plannedBranches);
  const nodeCardinalityEquivalent = canonical.nodes.length === sequential.nodes.length;
  const engineeringEquivalent = sameMultiset(canonicalSignatures, sequentialSignatures);
  const sequenceEquivalent = sameArray(canonicalSignatures, sequentialSignatures);
  const sourceBoundaryEquivalent = sameArray(actualNames, expectedNames) && membershipIssues.length === 0;
  const branchConditionsEquivalent = conditionMismatches.length === 0;
  const errors = [];
  const warnings = [];

  if (!sourceBoundaryEquivalent) errors.push('Sequential XML does not preserve planned source branch boundaries.');
  if (!nodeCardinalityEquivalent) errors.push('Canonical and sequential XML emit different node counts.');
  if (!engineeringEquivalent) errors.push('Canonical and sequential XML differ in engineering node content.');
  if (!sequenceEquivalent) warnings.push('Canonical and sequential node order differs.');
  if (allocationMismatches.length) warnings.push('Canonical and sequential node allocations differ.');
  if (!branchConditionsEquivalent) warnings.push('Source and canonical branch condition blocks differ.');

  const selectionBlockers = buildSelectionBlockers({
    sourceBoundaryEquivalent,
    nodeCardinalityEquivalent,
    engineeringEquivalent,
    branchConditionsEquivalent,
  });

  return deepFreeze({
    schema: PSI_XML_WRITER_PARITY_SCHEMA,
    summary: {
      canonicalBranchCount: canonical.branches.length,
      sequentialBranchCount: sequential.branches.length,
      canonicalNodeCount: canonical.nodes.length,
      sequentialNodeCount: sequential.nodes.length,
      nodeCardinalityEquivalent,
      engineeringEquivalent,
      sequenceEquivalent,
      numberingEquivalent: allocationMismatches.length === 0,
      sourceBoundaryEquivalent,
      branchConditionsEquivalent,
    },
    differences: {
      canonicalBranchNames: canonical.branches.map((branch) => branch.name),
      sequentialBranchNames: actualNames,
      membershipIssues: membershipIssues.slice(0, 100),
      allocationMismatches: allocationMismatches.slice(0, 100),
      branchConditionMismatches: conditionMismatches.slice(0, 100),
    },
    validation: { ok: errors.length === 0, errors: unique(errors), warnings: unique(warnings) },
    switchGate: { allowed: false, reason: 'SHADOW_ONLY' },
    selectionGate: {
      allowed: selectionBlockers.length === 0,
      reason: selectionBlockers.length === 0 ? 'PARITY_PROVEN' : 'PARITY_BLOCKED',
      blockers: selectionBlockers,
    },
  });
}

function buildSelectionBlockers(summary) {
  const blockers = [];
  if (!summary.sourceBoundaryEquivalent) blockers.push('SOURCE_BOUNDARY_MISMATCH');
  if (!summary.nodeCardinalityEquivalent) blockers.push('NODE_CARDINALITY_MISMATCH');
  if (!summary.engineeringEquivalent) blockers.push('ENGINEERING_CONTENT_MISMATCH');
  if (!summary.branchConditionsEquivalent) blockers.push('BRANCH_CONDITION_MISMATCH');
  return blockers;
}

function parseWriterXml(xmlText) {
  const branches = xmlBlocks(xmlText, 'Branch').map((block) => {
    const name = tagValue(block, 'Branchname');
    const nodes = xmlBlocks(block, 'Node').map((node) => parseNode(node, name));
    return {
      name,
      nodes,
      conditionSignature: JSON.stringify({
        temperature: normalizedBlock(block, 'Temperature'),
        pressure: normalizedBlock(block, 'Pressure'),
        materialNumber: tagValue(block, 'MaterialNumber'),
        insulationDensity: tagValue(block, 'InsulationDensity'),
        fluidDensity: tagValue(block, 'FluidDensity'),
      }),
    };
  });
  return { branches, nodes: branches.flatMap((branch) => branch.nodes) };
}

function parseNode(block, branchName) {
  const fields = {};
  for (const field of NODE_FIELDS) fields[field] = tagValue(block, field);
  fields.Restraints = xmlBlocks(block, 'Restraint').map(normalizeXml);
  return {
    branchName,
    nodeNumber: tagValue(block, 'NodeNumber'),
    componentRefNo: fields.ComponentRefNo,
    semanticSignature: JSON.stringify(fields),
  };
}

function validateMembership(actualBranches, plannedBranches) {
  const issues = [];
  const actualByName = new Map(actualBranches.map((branch) => [branch.name, branch]));
  for (const planned of plannedBranches) {
    const actual = actualByName.get(planned.sourceBranchName);
    if (!actual) {
      issues.push({ branchName: planned.sourceBranchName, issue: 'MISSING_BRANCH' });
      continue;
    }
    const expectedRefs = new Set(planned.components.map((component) => (
      text(component.record?.ref || component.record?.name || component.ref || component.name)
    )));
    const actualRefs = new Set(actual.nodes.map((node) => text(node.componentRefNo)));
    for (const ref of actualRefs) {
      if (ref && !expectedRefs.has(ref)) {
        issues.push({ branchName: planned.sourceBranchName, componentRefNo: ref, issue: 'UNEXPECTED_NODE' });
      }
    }
    for (const ref of expectedRefs) {
      if (ref && !actualRefs.has(ref)) {
        issues.push({ branchName: planned.sourceBranchName, componentRefNo: ref, issue: 'MISSING_NODE' });
      }
    }
  }
  return issues;
}

function compareAllocations(canonicalNodes, sequentialNodes) {
  const canonical = occurrenceMap(canonicalNodes);
  const sequential = occurrenceMap(sequentialNodes);
  const keys = new Set([...canonical.keys(), ...sequential.keys()]);
  const mismatches = [];
  for (const key of keys) {
    const left = canonical.get(key);
    const right = sequential.get(key);
    if (!left || !right || left.nodeNumber !== right.nodeNumber) {
      mismatches.push({
        semanticOccurrence: key,
        canonicalNodeNumber: left?.nodeNumber ?? null,
        sequentialNodeNumber: right?.nodeNumber ?? null,
      });
    }
  }
  return mismatches;
}

function compareConditions(canonical, sequential, plannedBranches) {
  const canonicalByName = new Map(canonical.branches.map((branch) => [branch.name, branch]));
  const sequentialByName = new Map(sequential.branches.map((branch) => [branch.name, branch]));
  const mismatches = [];
  for (const planned of plannedBranches) {
    const source = sequentialByName.get(planned.sourceBranchName);
    const owner = canonicalByName.get(planned.canonicalBranchName);
    if (source && owner && source.conditionSignature !== owner.conditionSignature) {
      mismatches.push({
        sourceBranchName: planned.sourceBranchName,
        canonicalBranchName: planned.canonicalBranchName,
      });
    }
  }
  return mismatches;
}

function occurrenceMap(nodes) {
  const counts = new Map();
  const result = new Map();
  for (const node of nodes) {
    const count = (counts.get(node.semanticSignature) || 0) + 1;
    counts.set(node.semanticSignature, count);
    result.set(`${node.semanticSignature}#${count}`, node);
  }
  return result;
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false;
  const counts = new Map();
  for (const value of left) counts.set(value, (counts.get(value) || 0) + 1);
  for (const value of right) {
    const count = counts.get(value) || 0;
    if (!count) return false;
    if (count === 1) counts.delete(value);
    else counts.set(value, count - 1);
  }
  return counts.size === 0;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function xmlBlocks(value, tagName) {
  return String(value ?? '').match(new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'g')) || [];
}

function normalizedBlock(value, tagName) {
  return normalizeXml(xmlBlocks(value, tagName)[0] || '');
}

function tagValue(value, tagName) {
  const match = String(value ?? '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return decodeXml(text(match?.[1]));
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeXml(value) {
  return String(value ?? '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values)];
}

function text(value) {
  return String(value ?? '').trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
