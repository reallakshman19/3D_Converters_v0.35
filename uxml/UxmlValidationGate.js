/**
 * UxmlValidationGate.js
 *
 * Agent 03: UXML validation/readiness gate.
 *
 * Scope:
 * - Validate UXML document shape.
 * - Validate references and topology-sufficiency fields.
 * - Produce readiness-style report.
 *
 * Out of scope:
 * - UniversalTopoGraph solving.
 * - Ray topology.
 * - Gap/overlap fixing.
 * - PCF/GLB/InputXML/CII emission.
 * - Master resolution.
 */

import {
  ANCHOR_ROLES,
  COMPONENT_TYPES,
  DIAGNOSTIC_SEVERITIES,
  PORT_ROLES,
  SEGMENT_TYPES,
} from './UxmlConstants.js';

import {
  assertUxmlDocumentShape,
  createUxmlDiagnostic,
  createUxmlReadinessReport,
} from './UxmlTypes.js';

const VALIDATION_SCHEMA = 'uxml-validation-gate/v1';

const INLINE_TWO_END_TYPES = new Set([
  COMPONENT_TYPES.PIPE,
  COMPONENT_TYPES.BEND,
  COMPONENT_TYPES.ELBOW,
  COMPONENT_TYPES.VALVE,
  COMPONENT_TYPES.FLANGE,
  COMPONENT_TYPES.GASKET,
  COMPONENT_TYPES.REDUCER_CONCENTRIC,
  COMPONENT_TYPES.REDUCER_ECCENTRIC,
  COMPONENT_TYPES.BLIND_FLANGE,
  COMPONENT_TYPES.CAP,
]);

const BRANCH_TYPES = new Set([
  COMPONENT_TYPES.TEE,
  COMPONENT_TYPES.OLET,
  COMPONENT_TYPES.WELDOLET,
  COMPONENT_TYPES.SOCKOLET,
]);

const OLET_TYPES = new Set([
  COMPONENT_TYPES.OLET,
  COMPONENT_TYPES.WELDOLET,
  COMPONENT_TYPES.SOCKOLET,
]);

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function isFinitePoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    Number.isFinite(Number(point.z))
  );
}

function isBlank(value) {
  return clean(value) === '';
}

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function makeDiagnosticFactory(report) {
  return function addDiagnostic({
    severity = DIAGNOSTIC_SEVERITIES.INFO,
    code,
    message,
    componentId = '',
    anchorId = '',
    portId = '',
    segmentId = '',
    supportId = '',
    sourceId = '',
    details = {},
  }) {
    const diagnostic = createUxmlDiagnostic({
      id: `VD-${String(report.diagnostics.length + 1).padStart(5, '0')}`,
      severity,
      code,
      message,
      componentId,
      anchorId,
      portId,
      segmentId,
      supportId,
      sourceId,
      details,
    });

    report.diagnostics.push(diagnostic);

    if (severity === DIAGNOSTIC_SEVERITIES.ERROR || severity === DIAGNOSTIC_SEVERITIES.FATAL) {
      report.blockers.push(diagnostic);
    } else if (severity === DIAGNOSTIC_SEVERITIES.WARNING) {
      report.warnings.push(diagnostic);
    }

    return diagnostic;
  };
}

function groupBy(items, keyFn) {
  const map = new Map();

  for (const item of items || []) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }

  return map;
}

function makeIdSet(items) {
  return new Set((items || []).map(item => clean(item.id)).filter(Boolean));
}

function componentType(component) {
  return upper(component.normalizedType || component.type || COMPONENT_TYPES.UNKNOWN);
}

function componentAnchors(doc, componentId) {
  return (doc.anchors || []).filter(anchor => clean(anchor.componentId) === clean(componentId));
}

function componentPorts(doc, componentId) {
  return (doc.ports || []).filter(port => clean(port.componentId) === clean(componentId));
}

function hasAnchorRole(doc, componentId, role) {
  return componentAnchors(doc, componentId).some(anchor => upper(anchor.role) === role);
}

function hasPortRole(doc, componentId, role) {
  return componentPorts(doc, componentId).some(port => upper(port.role) === role);
}

function requiredAnchorRolesForComponent(component) {
  const type = componentType(component);

  if (type === COMPONENT_TYPES.PIPE) {
    return [ANCHOR_ROLES.EP1, ANCHOR_ROLES.EP2];
  }

  if (type === COMPONENT_TYPES.TEE) {
    return [ANCHOR_ROLES.EP1, ANCHOR_ROLES.EP2, ANCHOR_ROLES.BP];
  }

  if (OLET_TYPES.has(type)) {
    return [ANCHOR_ROLES.CP, ANCHOR_ROLES.BP];
  }

  if (type === COMPONENT_TYPES.SUPPORT) {
    return [ANCHOR_ROLES.SUPPORT_POINT];
  }

  if (INLINE_TWO_END_TYPES.has(type)) {
    return [ANCHOR_ROLES.EP1, ANCHOR_ROLES.EP2];
  }

  return [];
}

function alternativeAnchorRoleSatisfied(doc, componentId, role) {
  if (role === ANCHOR_ROLES.SUPPORT_POINT) {
    return (
      hasAnchorRole(doc, componentId, ANCHOR_ROLES.SUPPORT_POINT) ||
      hasAnchorRole(doc, componentId, ANCHOR_ROLES.POS)
    );
  }

  return hasAnchorRole(doc, componentId, role);
}

function shouldRequireBore(component) {
  const type = componentType(component);

  if (type === COMPONENT_TYPES.SUPPORT) return false;
  if (type === COMPONENT_TYPES.UNKNOWN) return false;

  return true;
}

function shouldRequireBranchBore(component) {
  return BRANCH_TYPES.has(componentType(component));
}

function validateDuplicateIds(report, add, label, items) {
  const grouped = groupBy(items, item => clean(item.id));
  let duplicates = 0;

  for (const [id, group] of grouped.entries()) {
    if (!id) continue;

    if (group.length > 1) {
      duplicates += group.length - 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: `UXML-DUPLICATE-${label.toUpperCase()}-ID`,
        message: `Duplicate ${label} id: ${id}`,
        details: { id, count: group.length },
      });
    }
  }

  return duplicates;
}

function validateDocumentShape(doc, report, add) {
  const shape = assertUxmlDocumentShape(doc);

  if (!shape.ok) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-SHAPE-MISSING-SECTIONS',
      message: `UXML document is missing required section(s): ${shape.missing.join(', ')}`,
      details: shape,
    });
  }

  report.sections.uxml = {
    ok: shape.ok,
    missingSections: shape.missing,
  };

  return shape.ok;
}

function validateSources(doc, report, add) {
  const sources = doc.sources || [];
  const sourceIds = makeIdSet(sources);
  let missingSourceIds = 0;

  if (!sources.length) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-SOURCES-MISSING',
      message: 'UXML document has no source records.',
    });
  }

  for (const source of sources) {
    if (isBlank(source.id)) {
      missingSourceIds += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SOURCE-ID-MISSING',
        message: 'Source record has no id.',
      });
    }

    if (isBlank(source.format)) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.WARNING,
        code: 'UXML-SOURCE-FORMAT-MISSING',
        message: `Source ${source.id || '(missing id)'} has no format.`,
        sourceId: source.id || '',
      });
    }
  }

  validateDuplicateIds(report, add, 'source', sources);

  report.sections.sourceProfile = {
    ok: missingSourceIds === 0,
    sourceCount: sources.length,
    sourceIdCount: sourceIds.size,
  };

  return sourceIds;
}

function validateComponents(doc, report, add, sourceIds) {
  const components = doc.components || [];
  const componentIds = makeIdSet(components);
  let missingIdCount = 0;
  let missingTypeCount = 0;
  let unknownTypeCount = 0;
  let missingSourceRefCount = 0;

  if (!components.length) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-COMPONENTS-EMPTY',
      message: 'UXML document has no components.',
    });
  }

  for (const component of components) {
    if (isBlank(component.id)) {
      missingIdCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-COMPONENT-ID-MISSING',
        message: 'Component has no id.',
      });
    }

    if (isBlank(component.type) && isBlank(component.normalizedType)) {
      missingTypeCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-COMPONENT-TYPE-MISSING',
        message: `Component ${component.id || '(missing id)'} has no type/normalizedType.`,
        componentId: component.id || '',
      });
    }

    if (componentType(component) === COMPONENT_TYPES.UNKNOWN) {
      unknownTypeCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.WARNING,
        code: 'UXML-COMPONENT-TYPE-UNKNOWN',
        message: `Component ${component.id || '(missing id)'} has unknown type.`,
        componentId: component.id || '',
      });
    }

    if (Array.isArray(component.sourceRefs) && component.sourceRefs.length) {
      for (const sourceRef of component.sourceRefs) {
        if (!sourceIds.has(clean(sourceRef))) {
          add({
            severity: DIAGNOSTIC_SEVERITIES.WARNING,
            code: 'UXML-COMPONENT-SOURCE-REF-MISSING',
            message: `Component ${component.id || '(missing id)'} refers to missing source ${sourceRef}.`,
            componentId: component.id || '',
            sourceId: clean(sourceRef),
          });
        }
      }
    } else {
      missingSourceRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.WARNING,
        code: 'UXML-COMPONENT-SOURCE-REFS-EMPTY',
        message: `Component ${component.id || '(missing id)'} has no sourceRefs.`,
        componentId: component.id || '',
      });
    }
  }

  validateDuplicateIds(report, add, 'component', components);

  report.stats.componentCount = components.length;
  report.stats.missingComponentIdCount = missingIdCount;
  report.stats.missingComponentTypeCount = missingTypeCount;
  report.stats.unknownComponentTypeCount = unknownTypeCount;
  report.stats.componentMissingSourceRefCount = missingSourceRefCount;

  return componentIds;
}

function validateAnchors(doc, report, add, componentIds) {
  const anchors = doc.anchors || [];
  const anchorIds = makeIdSet(anchors);
  let invalidPointCount = 0;
  let missingRoleCount = 0;
  let missingComponentRefCount = 0;

  for (const anchor of anchors) {
    if (isBlank(anchor.id)) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-ANCHOR-ID-MISSING',
        message: 'Anchor has no id.',
      });
    }

    if (isBlank(anchor.role)) {
      missingRoleCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-ANCHOR-ROLE-MISSING',
        message: `Anchor ${anchor.id || '(missing id)'} has no role.`,
        anchorId: anchor.id || '',
      });
    }

    if (!componentIds.has(clean(anchor.componentId))) {
      missingComponentRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-ANCHOR-COMPONENT-REF-MISSING',
        message: `Anchor ${anchor.id || '(missing id)'} refers to missing component ${anchor.componentId}.`,
        anchorId: anchor.id || '',
        componentId: anchor.componentId || '',
      });
    }

    if (!isFinitePoint(anchor.point)) {
      invalidPointCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-ANCHOR-POINT-INVALID',
        message: `Anchor ${anchor.id || '(missing id)'} has invalid or missing point.`,
        anchorId: anchor.id || '',
        componentId: anchor.componentId || '',
      });
    }

    if (isBlank(anchor.confidence)) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.WARNING,
        code: 'UXML-ANCHOR-CONFIDENCE-MISSING',
        message: `Anchor ${anchor.id || '(missing id)'} has no confidence.`,
        anchorId: anchor.id || '',
        componentId: anchor.componentId || '',
      });
    }
  }

  validateDuplicateIds(report, add, 'anchor', anchors);

  report.sections.anchors = {
    ok: invalidPointCount === 0 && missingRoleCount === 0 && missingComponentRefCount === 0,
    anchorCount: anchors.length,
    invalidPointCount,
    missingRoleCount,
    missingComponentRefCount,
  };

  report.stats.anchorCount = anchors.length;
  report.stats.invalidAnchorPointCount = invalidPointCount;

  return anchorIds;
}

function validatePorts(doc, report, add, componentIds, anchorIds) {
  const ports = doc.ports || [];
  const portIds = makeIdSet(ports);
  let missingRoleCount = 0;
  let missingComponentRefCount = 0;
  let missingAnchorRefCount = 0;
  let invalidPointCount = 0;
  let supportPipeContinuityPorts = 0;

  const componentsById = new Map((doc.components || []).map(component => [clean(component.id), component]));

  for (const port of ports) {
    if (isBlank(port.id)) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-PORT-ID-MISSING',
        message: 'Port has no id.',
      });
    }

    if (isBlank(port.role)) {
      missingRoleCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-PORT-ROLE-MISSING',
        message: `Port ${port.id || '(missing id)'} has no role.`,
        portId: port.id || '',
      });
    }

    if (!componentIds.has(clean(port.componentId))) {
      missingComponentRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-PORT-COMPONENT-REF-MISSING',
        message: `Port ${port.id || '(missing id)'} refers to missing component ${port.componentId}.`,
        portId: port.id || '',
        componentId: port.componentId || '',
      });
    }

    if (!anchorIds.has(clean(port.anchorId))) {
      missingAnchorRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-PORT-ANCHOR-REF-MISSING',
        message: `Port ${port.id || '(missing id)'} refers to missing anchor ${port.anchorId}.`,
        portId: port.id || '',
        anchorId: port.anchorId || '',
        componentId: port.componentId || '',
      });
    }

    if (port.point != null && !isFinitePoint(port.point)) {
      invalidPointCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-PORT-POINT-INVALID',
        message: `Port ${port.id || '(missing id)'} has invalid point.`,
        portId: port.id || '',
        componentId: port.componentId || '',
      });
    }

    const component = componentsById.get(clean(port.componentId));
    const type = component ? componentType(component) : '';

    if (
      type === COMPONENT_TYPES.SUPPORT &&
      upper(port.connectsTo || '') === 'ENDPOINT' &&
      upper(port.role) !== PORT_ROLES.SUPPORT_POINT
    ) {
      supportPipeContinuityPorts += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SUPPORT-PIPE-CONTINUITY-PORT',
        message: `Support component ${component.id} has an inline pipe-continuity port ${port.id}.`,
        componentId: component.id,
        portId: port.id || '',
      });
    }
  }

  validateDuplicateIds(report, add, 'port', ports);

  report.stats.portCount = ports.length;
  report.stats.supportPipeContinuityPorts = supportPipeContinuityPorts;

  return {
    portIds,
    supportPipeContinuityPorts,
    missingRoleCount,
    missingComponentRefCount,
    missingAnchorRefCount,
    invalidPointCount,
  };
}

function validateSegments(doc, report, add, componentIds, anchorIds) {
  const segments = doc.segments || [];
  const segmentIds = makeIdSet(segments);
  let missingComponentRefCount = 0;
  let missingAnchorRefCount = 0;
  let missingTypeCount = 0;

  for (const segment of segments) {
    if (isBlank(segment.id)) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SEGMENT-ID-MISSING',
        message: 'Segment has no id.',
      });
    }

    if (isBlank(segment.type)) {
      missingTypeCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.WARNING,
        code: 'UXML-SEGMENT-TYPE-MISSING',
        message: `Segment ${segment.id || '(missing id)'} has no type.`,
        segmentId: segment.id || '',
      });
    }

    if (!componentIds.has(clean(segment.componentId))) {
      missingComponentRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SEGMENT-COMPONENT-REF-MISSING',
        message: `Segment ${segment.id || '(missing id)'} refers to missing component ${segment.componentId}.`,
        segmentId: segment.id || '',
        componentId: segment.componentId || '',
      });
    }

    const hasStart = isBlank(segment.startAnchorId) || anchorIds.has(clean(segment.startAnchorId));
    const hasEnd = isBlank(segment.endAnchorId) || anchorIds.has(clean(segment.endAnchorId));
    const hasSupport = isBlank(segment.supportAnchorId) || anchorIds.has(clean(segment.supportAnchorId));

    if (!hasStart || !hasEnd || !hasSupport) {
      missingAnchorRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SEGMENT-ANCHOR-REF-MISSING',
        message: `Segment ${segment.id || '(missing id)'} has missing anchor reference.`,
        segmentId: segment.id || '',
        componentId: segment.componentId || '',
        details: {
          startAnchorId: segment.startAnchorId,
          endAnchorId: segment.endAnchorId,
          supportAnchorId: segment.supportAnchorId,
        },
      });
    }
  }

  validateDuplicateIds(report, add, 'segment', segments);

  report.stats.segmentCount = segments.length;

  return {
    segmentIds,
    missingComponentRefCount,
    missingAnchorRefCount,
    missingTypeCount,
  };
}

function validateSupports(doc, report, add, componentIds, anchorIds) {
  const supports = doc.supports || [];
  const supportIds = makeIdSet(supports);
  let missingComponentRefCount = 0;
  let missingAnchorRefCount = 0;

  for (const support of supports) {
    if (isBlank(support.id)) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SUPPORT-ID-MISSING',
        message: 'Support has no id.',
      });
    }

    if (!componentIds.has(clean(support.componentId))) {
      missingComponentRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SUPPORT-COMPONENT-REF-MISSING',
        message: `Support ${support.id || '(missing id)'} refers to missing component ${support.componentId}.`,
        supportId: support.id || '',
        componentId: support.componentId || '',
      });
    }

    if (!isBlank(support.supportAnchorId) && !anchorIds.has(clean(support.supportAnchorId))) {
      missingAnchorRefCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-SUPPORT-ANCHOR-REF-MISSING',
        message: `Support ${support.id || '(missing id)'} refers to missing support anchor ${support.supportAnchorId}.`,
        supportId: support.id || '',
        anchorId: support.supportAnchorId || '',
        componentId: support.componentId || '',
      });
    }
  }

  validateDuplicateIds(report, add, 'support', supports);

  report.sections.supports = {
    ok: missingComponentRefCount === 0 && missingAnchorRefCount === 0,
    supportCount: supports.length,
    missingComponentRefCount,
    missingAnchorRefCount,
  };

  report.stats.supportCount = supports.length;

  return supportIds;
}

function validateComponentTopologySufficiency(doc, report, add) {
  let requiredAnchorMissingCount = 0;
  let convertedBoreMissingCount = 0;
  let branchBoreMissingCount = 0;
  let segmentMissingCount = 0;

  for (const component of doc.components || []) {
    const type = componentType(component);
    const requiredRoles = requiredAnchorRolesForComponent(component);

    for (const role of requiredRoles) {
      if (!alternativeAnchorRoleSatisfied(doc, component.id, role)) {
        requiredAnchorMissingCount += 1;
        add({
          severity: DIAGNOSTIC_SEVERITIES.ERROR,
          code: 'UXML-COMPONENT-REQUIRED-ANCHOR-MISSING',
          message: `Component ${component.id || '(missing id)'} type ${type} is missing required anchor ${role}.`,
          componentId: component.id || '',
          details: { type, role },
        });
      }
    }

    if (shouldRequireBore(component) && !isPositiveNumber(component.bore)) {
      convertedBoreMissingCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-COMPONENT-BORE-MISSING',
        message: `Component ${component.id || '(missing id)'} type ${type} is missing positive bore.`,
        componentId: component.id || '',
        details: { type, bore: component.bore },
      });
    }

    if (shouldRequireBranchBore(component) && !isPositiveNumber(component.branchBore)) {
      branchBoreMissingCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-COMPONENT-BRANCH-BORE-MISSING',
        message: `Branch component ${component.id || '(missing id)'} type ${type} is missing positive branchBore.`,
        componentId: component.id || '',
        details: { type, branchBore: component.branchBore },
      });
    }

    if (
      type === COMPONENT_TYPES.PIPE &&
      !(component.segmentIds || []).some(id => (doc.segments || []).some(segment => segment.id === id))
    ) {
      segmentMissingCount += 1;
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-PIPE-SEGMENT-MISSING',
        message: `PIPE component ${component.id || '(missing id)'} has no valid pipe segment.`,
        componentId: component.id || '',
      });
    }
  }

  report.sections.boreUnits = {
    ok: convertedBoreMissingCount === 0 && branchBoreMissingCount === 0,
    convertedBoreMissingCount,
    branchBoreMissingCount,
  };

  report.sections.universalTopology = {
    ok: requiredAnchorMissingCount === 0 && segmentMissingCount === 0,
    requiredAnchorMissingCount,
    segmentMissingCount,
    note: 'Validation-only topology sufficiency. UniversalTopoGraph is not built in Agent 03.',
  };

  report.stats.requiredAnchorMissingCount = requiredAnchorMissingCount;
  report.stats.convertedBoreMissingCount = convertedBoreMissingCount;
  report.stats.branchBoreMissingCount = branchBoreMissingCount;
  report.stats.pipeSegmentMissingCount = segmentMissingCount;
}

function finalizeReport(report) {
  const fatalCount = report.diagnostics.filter(d => d.severity === DIAGNOSTIC_SEVERITIES.FATAL).length;
  const errorCount = report.diagnostics.filter(d => d.severity === DIAGNOSTIC_SEVERITIES.ERROR).length;
  const warningCount = report.diagnostics.filter(d => d.severity === DIAGNOSTIC_SEVERITIES.WARNING).length;

  report.stats.fatalCount = fatalCount;
  report.stats.errorCount = errorCount;
  report.stats.warningCount = warningCount;
  report.stats.blockerCount = report.blockers.length;
  report.stats.warningItemCount = report.warnings.length;

  report.ready = fatalCount === 0 && errorCount === 0;
  report.exportAllowed = report.ready;

  report.sections.transactionSafety = {
    ok: true,
    note: 'No mutation/transaction is performed in Agent 03.',
  };

  report.sections.exportPermission = {
    ok: report.exportAllowed,
    exportAllowed: report.exportAllowed,
    blockerCount: report.blockers.length,
  };

  report.sections.rayComparison = {
    ok: true,
    note: 'Ray comparison is not run in Agent 03.',
  };

  report.sections.gapOverlap = {
    ok: true,
    note: 'Gap/overlap solving is not run in Agent 03.',
  };

  report.sections.masters = {
    ok: true,
    note: 'Master resolution is intentionally deferred until final stage.',
  };

  return report;
}

export function validateUxmlDocument(doc, options = {}) {
  const report = createUxmlReadinessReport({
    schema: VALIDATION_SCHEMA,
    stats: {
      strict: options.strict === true,
    },
  });

  const add = makeDiagnosticFactory(report);

  if (!doc || typeof doc !== 'object') {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-DOCUMENT-NOT-OBJECT',
      message: 'UXML validation input is not an object.',
    });

    return finalizeReport(report);
  }

  const shapeOk = validateDocumentShape(doc, report, add);

  if (!shapeOk) {
    return finalizeReport(report);
  }

  const sourceIds = validateSources(doc, report, add);
  const componentIds = validateComponents(doc, report, add, sourceIds);
  const anchorIds = validateAnchors(doc, report, add, componentIds);
  const portValidation = validatePorts(doc, report, add, componentIds, anchorIds);
  validateSegments(doc, report, add, componentIds, anchorIds);
  validateSupports(doc, report, add, componentIds, anchorIds);
  validateComponentTopologySufficiency(doc, report, add);

  report.sections.ports = {
    ok:
      portValidation.missingRoleCount === 0 &&
      portValidation.missingComponentRefCount === 0 &&
      portValidation.missingAnchorRefCount === 0 &&
      portValidation.invalidPointCount === 0 &&
      portValidation.supportPipeContinuityPorts === 0,
    portCount: (doc.ports || []).length,
    missingRoleCount: portValidation.missingRoleCount,
    missingComponentRefCount: portValidation.missingComponentRefCount,
    missingAnchorRefCount: portValidation.missingAnchorRefCount,
    invalidPointCount: portValidation.invalidPointCount,
    supportPipeContinuityPorts: portValidation.supportPipeContinuityPorts,
  };

  return finalizeReport(report);
}

export const runUxmlValidationGate = validateUxmlDocument;
