import { createXmlBuilderDiagnostic } from '../../converters/xml-cii2019-core/custom-input-diagnostics.js';

const SENTINEL = -1.0101;
const clean = (value) => String(value ?? '').trim();
const finite = (value) => Number.isFinite(Number(value));

function add(records, input) {
  records.push(createXmlBuilderDiagnostic({ module: 'xml-cii-node-to-inputxml-core', ...input }));
}

function isRouteCandidate(node) {
  return Number(node?.nodeNumber) > 0 && node?.componentType !== 'GASK';
}

function branchRecords(records, branch, elements, options) {
  const branchElements = elements.filter((element) => element.branch === branch);
  const lineId = clean(branch?.context?.lineId);
  if (!lineId) add(records, {
    severity: 'WARNING', code: 'XML_BUILDER_LINE_ID_FALLBACK', stage: 'field-mapping',
    branch: branch.branchName, sourceField: 'LineNo', outputField: 'PIPINGELEMENT@LINE_ID',
    message: 'Explicit LineNo is absent; branch name is used as LINE_ID.',
  });
  for (const node of branch.nodes || []) {
    const context = { componentType: node.componentType, componentRefNo: node.componentRefNo };
    if (!finite(node.nodeNumber) || Number(node.nodeNumber) <= 0) add(records, {
      severity: 'WARNING', code: 'XML_BUILDER_NODE_DROPPED_INVALID_NUMBER', stage: 'topology',
      branch: branch.branchName, node: node.nodeNumberRaw, sourceField: 'NodeNumber', action: 'drop', context,
      message: 'Node is excluded because NodeNumber is missing, non-numeric, or not positive.',
    });
    if (isRouteCandidate(node) && !node.position) add(records, {
      severity: 'WARNING', code: 'XML_BUILDER_NODE_DROPPED_MISSING_POSITION', stage: 'topology',
      branch: branch.branchName, node: node.nodeNumberRaw, sourceField: 'Position', action: 'drop', context,
      message: 'Node is excluded because no explicit three-value Position is available.',
    });
    if (node.componentType === 'GASK') add(records, {
      severity: 'INFO', code: 'XML_BUILDER_NODE_DROPPED_GASK', stage: 'topology',
      branch: branch.branchName, node: node.nodeNumberRaw, action: 'drop', context,
      message: 'GASK node is excluded from the route by the existing topology policy.',
    });
    if ((node.restraints || []).length > 6) add(records, {
      severity: 'WARNING', code: 'XML_BUILDER_RESTRAINT_SLOT_TRUNCATED', stage: 'fixed-array',
      branch: branch.branchName, node: node.nodeNumberRaw, outputField: 'PIPINGELEMENT/RESTRAINT', action: 'drop',
      count: node.restraints.length - 6, context: { sourceCount: node.restraints.length, slotCount: 6 },
      message: `${node.restraints.length - 6} restraint row(s) exceed the six fixed InputXML slots and are not emitted.`,
    });
    for (const restraint of node.restraints || []) {
      if (restraint.sourceElementName === 'CustomRestraint') add(records, {
        severity: 'INFO', code: 'XML_BUILDER_CUSTOM_RESTRAINT_COMPATIBILITY', stage: 'parse',
        branch: branch.branchName, node: node.nodeNumberRaw, action: 'compatibility-read',
        message: 'Historical CustomRestraint input was accepted through the compatibility parser.',
      });
      if (!finite(restraint.typeCode) || Math.abs(Number(restraint.typeCode) - SENTINEL) < 1e-9) add(records, {
        severity: 'WARNING', code: 'XML_BUILDER_RESTRAINT_TYPE_UNRESOLVED', stage: 'field-mapping',
        branch: branch.branchName, node: node.nodeNumberRaw, sourceField: 'Restraint.Type/Direction', outputField: 'RESTRAINT@TYPE',
        context: { sourceType: restraint.sourceType, sourceDirection: restraint.sourceDirection },
        message: 'Restraint type could not be resolved from a recognized/numeric Type or Direction; sentinel is emitted.',
      });
    }
  }
  const first = branchElements.find((element) => element.isFirstInBranch);
  if (first) {
    if (!finite(first.toRow?.od) && !finite(first.fromRow?.od)) add(records, {
      severity: 'WARNING', code: 'XML_BUILDER_OUTSIDE_DIAMETER_MISSING', stage: 'field-mapping',
      branch: branch.branchName, node: first.toRow?.nodeNumberRaw, sourceField: 'OutsideDiameter', outputField: 'PIPINGELEMENT@DIAMETER',
      message: 'No explicit OutsideDiameter is available. BoreMm is not substituted; DIAMETER remains sentinel.',
    });
    if (!finite(branch?.context?.insulationDensity)) add(records, {
      severity: 'INFO', code: 'XML_BUILDER_INSULATION_DENSITY_MISSING', stage: 'field-mapping',
      branch: branch.branchName, sourceField: 'InsulationDensity', outputField: 'PIPINGELEMENT@INSUL_DENSITY',
      message: 'No explicit numeric insulation density is available; sentinel is emitted.',
    });
    if (!clean(first.toRow?.materialCode) && !clean(branch?.context?.materialNumber)) add(records, {
      severity: 'WARNING', code: 'XML_BUILDER_MATERIAL_DEFAULT_SUBSTITUTED', stage: 'default',
      branch: branch.branchName, node: first.toRow?.nodeNumberRaw, outputField: 'PIPINGELEMENT@MATERIAL_NUM', action: 'default',
      context: { defaultValue: 1 }, message: 'No source material number is available; compatibility default 1 is emitted.',
    });
  }
  if (options.repeatContextOnEveryElement !== true && branchElements.length > 1) add(records, {
    severity: 'INFO', code: 'XML_BUILDER_CONTEXT_FIRST_ELEMENT_ONLY', stage: 'default',
    branch: branch.branchName, count: branchElements.length - 1,
    message: 'Branch context is emitted on the first element only; later elements use sentinels by compatibility policy.',
  });
}

export function buildNodeToInputXmlDiagnosticRecords({ branches = [], elements = [], topologyDiagnostics = {}, options = {} } = {}) {
  const records = [];
  add(records, {
    severity: 'INFO', code: 'XML_BUILDER_AXIS_TRANSFORM_APPLIED', stage: 'coordinate-transform',
    sourceField: 'Position(x,y,z)', outputField: 'DELTA/FROM/TO coordinates',
    context: { point: '(x,z,-y)', delta: '(dx,dz,-dy)', zeroToleranceMm: 0.5, sentinel: SENTINEL },
    message: 'Existing project coordinate transform and sub-0.5 mm sentinel policy were applied.',
  });
  for (const branch of branches) branchRecords(records, branch, elements, options);
  for (const row of topologyDiagnostics.rigid || []) {
    if (finite(row.weight) && Number(row.weight) > 0) add(records, {
      severity: 'INFO', code: 'XML_BUILDER_RIGID_WEIGHT_SCALE_APPLIED', stage: 'value-transform',
      branch: row.branchName, node: row.sourceNode, sourceField: 'Weight', outputField: 'RIGID@WEIGHT',
      context: { sourceValue: Number(row.weight), factor: 10 },
      message: 'Existing rigid-weight multiplication by 10 was applied.',
    });
  }
  if (!elements.length) add(records, {
    severity: 'ERROR', code: 'XML_BUILDER_ZERO_ROUTE_OUTPUT', stage: 'output', action: 'block-download',
    message: 'No PIPINGELEMENT route was generated; InputXML is not ready for download.',
  });
  return records;
}
