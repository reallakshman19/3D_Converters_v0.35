/**
 * support-builder.js
 * Builds support specifications and canonical supports from TopoGraph + source candidates.
 */

import { CanonicalSupport } from '../canonical/CanonicalSupport.js';
import { FidelityClass } from '../canonical/FidelityClass.js';
import { getSupportMappingConfig } from './support-mapping-store.js';
import { renderTemplate, withAliasedKeys, evaluatePathExpression } from '../topo/template-evaluator.js';
import { resolveKindPure } from '../../support/SupportKindResolver.js';

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function distance(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;
  const dx = Number(pointA.x || 0) - Number(pointB.x || 0);
  const dy = Number(pointA.y || 0) - Number(pointB.y || 0);
  const dz = Number(pointA.z || 0) - Number(pointB.z || 0);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function normalizePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  const z = toFiniteNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function findNearestNode(nodes, point) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes || []) {
    const nodeDistance = distance(node?.position, point);
    if (nodeDistance < bestDistance) {
      bestDistance = nodeDistance;
      best = node;
    }
  }
  return best ? { node: best, distance: bestDistance } : null;
}

function ruleMatches(rule, candidate, context) {
  const match = rule?.match || {};
  const typeIn = Array.isArray(match.typeIn) ? match.typeIn.map((t) => String(t).toUpperCase()) : [];
  if (typeIn.length) {
    const sourceType = String(candidate?.type || '').toUpperCase();
    if (!typeIn.includes(sourceType)) return false;
  }

  const pathContains = String(match.pathContains || '').trim().toLowerCase();
  if (pathContains) {
    const sourcePath = String(context?.source?.path || context?.raw?.groupPath || '').toLowerCase();
    if (!sourcePath.includes(pathContains)) return false;
  }

  const attrKey = String(match.attrKey || '').trim();
  if (attrKey) {
    const raw = context?.raw || {};
    if (!(attrKey in raw)) return false;
  }

  const attrContains = String(match.attrContains || '').trim().toLowerCase();
  if (attrContains) {
    const attrExpr = String(match.attrExpr || `raw.${match.attrKey || ''}`).trim();
    const attrValue = String(evaluatePathExpression(attrExpr, context) || '').toLowerCase();
    if (!attrValue.includes(attrContains)) return false;
  }

  return true;
}

function pickRule(configBlock, candidate, context) {
  const rules = Array.isArray(configBlock?.rules) ? configBlock.rules : [];
  const ordered = [...rules]
    .filter((rule) => rule && rule.enabled !== false)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  for (const rule of ordered) {
    if (ruleMatches(rule, candidate, context)) return rule;
  }
  return null;
}

function pickAnchorPoint(candidate, anchorPolicy) {
  const policy = String(anchorPolicy || '').trim().toLowerCase();
  if (policy === 'ep1') return normalizePoint(candidate?.ep1);
  if (policy === 'ep2') return normalizePoint(candidate?.ep2);
  if (policy === 'cp') return normalizePoint(candidate?.cp);
  if (policy === 'bp') return normalizePoint(candidate?.bp);
  if (policy === 'path') return normalizePoint(candidate?.pathAnchor);
  return normalizePoint(candidate?.supportCoord)
    || normalizePoint(candidate?.coOrds)
    || normalizePoint(candidate?.cp)
    || normalizePoint(candidate?.bp)
    || normalizePoint(candidate?.ep1)
    || normalizePoint(candidate?.ep2);
}

export function buildSupportSpecs({
  format,
  supportCandidates,
  nodes,
  assemblyId,
  projectDiagnostics,
}) {
  const config = getSupportMappingConfig();
  const formatKey = String(format || 'XML').toUpperCase();
  const block = config?.formats?.[formatKey] || config?.formats?.XML || {};
  const tolerances = block?.tolerances || {};
  const anchorTolerance = Math.max(toFiniteNumber(tolerances.anchorMm, 0.5), 0.0001);
  const mappingProfile = block?.mappingProfile || {};

  const specs = [];
  const supports = [];
  let supportCounter = 1;

  for (const candidate of supportCandidates || []) {
    const raw = withAliasedKeys(candidate?.rawAttributes || {});
    const context = {
      raw,
      source: {
        id: candidate?.id,
        index: candidate?.index,
        type: candidate?.type,
        path: candidate?.path,
      },
      geometry: {
        ep1: candidate?.ep1,
        ep2: candidate?.ep2,
        cp: candidate?.cp,
        bp: candidate?.bp,
        supportCoord: candidate?.supportCoord,
      },
    };

    const rule = pickRule(block, candidate, context);
    const output = rule?.output || {};
    const anchorPolicy = String(rule?.anchorPolicy || block?.anchorPolicy || 'nearest-node');
    let anchorPoint = pickAnchorPoint(candidate, anchorPolicy);
    let anchorSource = 'DIRECT';

    if (!anchorPoint && anchorPolicy === 'nearest-node') {
      anchorPoint = pickAnchorPoint(candidate, 'ep1') || pickAnchorPoint(candidate, 'ep2');
      anchorSource = 'FALLBACK_EP';
    }

    const nearest = anchorPoint ? findNearestNode(nodes, anchorPoint) : null;
    let hostRef = nearest?.node?.id || null;
    const hostConfidence = nearest
      ? Math.max(0, 1 - (nearest.distance / anchorTolerance))
      : 0;

    if (!hostRef) {
      projectDiagnostics?.warn('SUPPORT_ANCHOR_FALLBACK', 'Support candidate could not be anchored to a node.', {
        candidateId: candidate?.id || null,
        anchorPolicy,
      });
    }

    const kindTemplate = output?.supportKindTemplate || mappingProfile?.supportKindTemplate || '{{source.type || "SUPPORT"}}';
    const orientationTemplate = output?.orientationTemplate || mappingProfile?.orientationTemplate || '{{raw.SUPPORT_DIRECTION || "UNKNOWN"}}';
    const sizeTemplate = output?.sizeTemplate || mappingProfile?.sizeTemplate || '{{raw.SIZE || ""}}';
    const refNoTemplate = output?.refNoTemplate || mappingProfile?.refNoTemplate || '{{source.id || source.index}}';
    const seqNoTemplate = output?.seqNoTemplate || mappingProfile?.seqNoTemplate || '{{source.index}}';

    const supportCode = renderTemplate(kindTemplate, context);
    const supportKind = resolveKindPure(
      { ...raw, SKEY: supportCode },
      { userRules: [], kindMap: {}, defaultKind: '' },
    ) || 'REST';
    const orientation = renderTemplate(orientationTemplate, context);
    const sizeText = renderTemplate(sizeTemplate, context);
    const refNo = renderTemplate(refNoTemplate, context);
    const seqNoRaw = renderTemplate(seqNoTemplate, context);
    const seqNo = toFiniteNumber(seqNoRaw, supportCounter * 10);

    const supportSpec = {
      id: `SUPSPEC-${supportCounter}`,
      supportCode,
      supportKind,
      anchor: {
        policy: anchorPolicy,
        point: anchorPoint,
        nodeId: hostRef,
        source: anchorSource,
      },
      orientation,
      size: sizeText,
      attrs: raw,
      sourceRefs: candidate?.sourceRefs || [],
      hostRefType: hostRef ? 'NODE' : 'INFERRED',
      refNo,
      seqNo,
    };
    specs.push(supportSpec);

    const support = new CanonicalSupport({
      id: `SUP-${supportCounter++}`,
      assemblyId,
      hostRefType: supportSpec.hostRefType,
      hostRef,
      hostRefConfidence: hostConfidence,
      rawAttributes: raw,
      derivedAttributes: {
        anchorPolicy,
        orientation,
        size: sizeText,
      },
      normalized: {
        supportCoord: anchorPoint,
        supportCode,
        supportKind,
        orientation,
        size: sizeText,
        refNo,
        seqNo,
      },
      directionSource: 'RULE_TEMPLATE',
      classificationSource: rule ? 'RULE_MATCH' : 'DEFAULT_PROFILE',
      sourceRefs: supportSpec.sourceRefs,
      fidelity: FidelityClass.RECONSTRUCTED,
      metadata: {
        supportSpecId: supportSpec.id,
      },
    });
    supports.push(support);
  }

  return { specs, supports };
}
