import {
  applyXmlRestraints,
  restraintEntriesFromSupportKind,
} from './support-mapping.js?v=20260803-atta-default-rest-closure-1';
import { migrateSupportMappingConfig } from './support-mapping-config.js?v=20260803-atta-default-rest-closure-1';

const PLACEHOLDER_TYPES = new Set(['LIM', 'LIMIT', 'LINESTOP']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function childrenByName(parent, name) {
  return [...(parent?.childNodes || parent?.children || [])]
    .filter((node) => node?.nodeType === undefined || node.nodeType === 1)
    .filter((node) => localName(node) === name);
}

function firstChild(parent, name) {
  return childrenByName(parent, name)[0] || null;
}

function childText(parent, name) {
  return text(firstChild(parent, name)?.textContent);
}

function attributeText(element, name) {
  return text(element?.getAttribute?.(name));
}

function zeroOrBlank(value) {
  const raw = text(value);
  if (!raw) return true;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric === 0;
}

function hasText(value) {
  return text(value) !== '';
}

export function isZeroInformationLimitRestraintElement(restraint) {
  const type = childText(restraint, 'Type').toUpperCase().replace(/\s+/g, '');
  if (!PLACEHOLDER_TYPES.has(type)) return false;
  if (!zeroOrBlank(childText(restraint, 'Stiffness'))) return false;
  if (!zeroOrBlank(childText(restraint, 'Gap'))) return false;
  if (['DirectionCosineX', 'DirectionCosineY', 'DirectionCosineZ']
    .some((name) => hasText(childText(restraint, name)))) return false;
  return ![
    attributeText(restraint, 'source'),
    attributeText(restraint, 'basis'),
    attributeText(restraint, 'resolvedKey'),
    childText(restraint, 'OriginalText'),
    childText(restraint, 'ResolvedFrom'),
    childText(restraint, 'SideloadRow'),
  ].some(hasText);
}

function diagnostic(node, kind, entries) {
  const replacement = kind === 'placeholder-replaced';
  return {
    type: replacement
      ? 'zero-information-limit-restraint-replaced'
      : 'atta-default-rest-restraint-materialized',
    nodeNumber: childText(node, 'NodeNumber'),
    nodeName: childText(node, 'NodeName'),
    componentType: childText(node, 'ComponentType'),
    authority: 'component-default-rest',
    restraintTypes: entries.map((entry) => entry.type),
    replacedExistingPlaceholder: replacement,
    message: replacement
      ? 'A zero-information LIM placeholder was replaced by the governed ATTA default REST profile.'
      : 'ATTA had no authoritative restraint evidence; the governed default REST profile was materialized.',
  };
}

export function closeGovernedAttaDefaultRestraints(document, config = {}) {
  const stats = {
    attaDefaultRestRestraintsAdded: 0,
    zeroInformationLimitPlaceholdersReplaced: 0,
    authoritativeAttaRestraintsPreserved: 0,
  };
  const diagnostics = [];
  const supportMapping = migrateSupportMappingConfig(config);
  if (supportMapping.useJsonForRestraints === false) {
    return {
      changed: false,
      stats,
      diagnostics: [{
        type: 'atta-default-restraint-closure-skipped',
        reason: 'json-restraints-disabled',
      }],
    };
  }

  for (const node of [...(document?.getElementsByTagName?.('Node') || [])]) {
    if (childText(node, 'ComponentType').toUpperCase() !== 'ATTA') continue;
    const restraints = childrenByName(node, 'Restraint');
    const missing = restraints.length === 0;
    const placeholderOnly = restraints.length > 0
      && restraints.every(isZeroInformationLimitRestraintElement);
    if (!missing && !placeholderOnly) {
      stats.authoritativeAttaRestraintsPreserved += 1;
      continue;
    }

    const entries = restraintEntriesFromSupportKind('REST', {}, node, config);
    if (!entries.length) {
      diagnostics.push({
        type: 'atta-default-restraint-closure-blocked',
        nodeNumber: childText(node, 'NodeNumber'),
        nodeName: childText(node, 'NodeName'),
        reason: 'rest-profile-empty',
      });
      continue;
    }

    applyXmlRestraints(document, node, entries, config);
    if (!childrenByName(node, 'Restraint').length) {
      diagnostics.push({
        type: 'atta-default-restraint-closure-blocked',
        nodeNumber: childText(node, 'NodeNumber'),
        nodeName: childText(node, 'NodeName'),
        reason: 'restraint-write-failed',
      });
      continue;
    }

    if (placeholderOnly) stats.zeroInformationLimitPlaceholdersReplaced += 1;
    else stats.attaDefaultRestRestraintsAdded += 1;
    diagnostics.push(diagnostic(
      node,
      placeholderOnly ? 'placeholder-replaced' : 'missing-added',
      entries,
    ));
  }

  return {
    changed: stats.attaDefaultRestRestraintsAdded > 0
      || stats.zeroInformationLimitPlaceholdersReplaced > 0,
    stats,
    diagnostics,
  };
}

export function closeGovernedAttaDefaultRestraintsXml(xmlText, config = {}) {
  const source = String(xmlText ?? '');
  if (!source.trim()) {
    return {
      xmlText: source,
      changed: false,
      stats: {},
      diagnostics: [{ type: 'atta-default-restraint-closure-skipped', reason: 'empty-xml' }],
    };
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return {
      xmlText: source,
      changed: false,
      stats: {},
      diagnostics: [{ type: 'atta-default-restraint-closure-skipped', reason: 'dom-unavailable' }],
    };
  }
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) {
    return {
      xmlText: source,
      changed: false,
      stats: {},
      diagnostics: [{ type: 'atta-default-restraint-closure-skipped', reason: 'xml-parse-failed' }],
    };
  }
  const result = closeGovernedAttaDefaultRestraints(document, config);
  return {
    ...result,
    xmlText: result.changed ? new XMLSerializer().serializeToString(document) : source,
  };
}
