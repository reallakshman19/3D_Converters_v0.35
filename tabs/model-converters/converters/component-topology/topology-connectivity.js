/**
 * Explicit connectivity authority for component topology.
 * Inputs: identified source model and tolerance. Output: union operations,
 * CREF connection plans, and diagnostics. Coordinates only verify an explicit
 * source-order/reference relationship; they never create unrelated topology.
 */

import {
  CREF_CONNECTION_SPAN_LIMIT_MM,
  REFERENCE_CONNECTION_TOLERANCE_MM,
  SOURCE_CONNECTION_TOLERANCE_MM,
  cleanText,
  componentCategory,
  pointDistance,
} from './topology-values.js';

/** @param {Record<string, unknown>[]} ports @returns {Readonly<Record<string, unknown>>} */
function createDisjointSet(ports) {
  const parent = new Map(ports.map((port) => [port.key, port.key]));
  const rank = new Map(ports.map((port) => [port.key, 0]));
  const find = (key) => {
    const current = parent.get(key);
    if (!current) throw new Error(`Unknown source port key ${key}.`);
    if (current === key) return key;
    const root = find(current);
    parent.set(key, root);
    return root;
  };
  const unite = (left, right) => {
    let leftRoot = find(left), rightRoot = find(right);
    if (leftRoot === rightRoot) return leftRoot;
    const leftRank = rank.get(leftRoot) ?? 0, rightRank = rank.get(rightRoot) ?? 0;
    if (leftRank < rightRank) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    parent.set(rightRoot, leftRoot);
    if (leftRank === rightRank) rank.set(leftRoot, leftRank + 1);
    return leftRoot;
  };
  return Object.freeze({ find, unite });
}

/** @param {Record<string, unknown>} entity @param {string} role @returns {Record<string, unknown>|null} */
export function portForRole(entity, role) {
  return entity.ports.find((port) => port.role === role) ?? null;
}

/** @param {Record<string, unknown>} component @returns {{entry:Record<string,unknown>,exit:Record<string,unknown>}|null} */
function routeAnchors(component) {
  const category = componentCategory(component.sourceType);
  if (category === 'SUPPORT') return null;
  if (category === 'OLET') {
    const point = portForRole(component, 'P');
    return point ? { entry: point, exit: point } : null;
  }
  if (category === 'TEE' && component.finiteSpan !== true) {
    const point = portForRole(component, 'P');
    return point ? { entry: point, exit: point } : null;
  }
  if (component.geometryClassification !== 'FINITE' && !(category === 'TEE' && component.finiteSpan === true)) return null;
  const entry = portForRole(component, 'A'), exit = portForRole(component, 'L');
  return entry && exit ? { entry, exit } : null;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right @param {number} toleranceMm @returns {boolean} */
function sameFiniteSpan(left, right, toleranceMm) {
  const leftStart = portForRole(left, 'A'), leftEnd = portForRole(left, 'L');
  const rightStart = portForRole(right, 'A'), rightEnd = portForRole(right, 'L');
  return Boolean(leftStart && leftEnd && rightStart && rightEnd
    && left.finiteSpan === true && right.finiteSpan === true
    && pointDistance(leftStart.position, rightStart.position) <= toleranceMm
    && pointDistance(leftEnd.position, rightEnd.position) <= toleranceMm);
}

/** @param {Record<string, unknown>[]} branches @param {number} toleranceMm @returns {Record<string, unknown>[]} */
function findManagedOverlapGroups(branches, toleranceMm) {
  return branches.flatMap((branch) => {
    const pipes = branch.components.filter((component) => (
      componentCategory(component.sourceType) === 'PIPE'
      && cleanText(component.attributes.AUTO_GENERATED_PIPE).toLowerCase() === 'true'
    ));
    const instruments = branch.components.filter((component) => componentCategory(component.sourceType) === 'INST');
    return instruments.flatMap((instrument) => {
      const pipe = pipes.find((candidate) => sameFiniteSpan(candidate, instrument, toleranceMm));
      return pipe ? [{
        primary: instrument,
        secondary: pipe,
        sourceEntityIds: [instrument.sourceEntityId, pipe.sourceEntityId],
        authority: 'AUTO_GENERATED_PIPE_COMPONENT_SPAN',
      }] : [];
    });
  });
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right @param {number} toleranceMm @param {number} acceptedSourcePrecisionMm @param {Readonly<Record<string, unknown>>} set @param {Record<string, unknown>[]} issues @param {Record<string, unknown>} evidence @returns {void} */
function uniteVerified(left, right, toleranceMm, acceptedSourcePrecisionMm, set, issues, evidence) {
  const residual = pointDistance(left.position, right.position);
  if (residual <= toleranceMm) {
    set.unite(left.key, right.key);
    return;
  }
  if (residual <= acceptedSourcePrecisionMm) {
    set.unite(left.key, right.key);
    issues.push({
      code: 'SOURCE_CONNECTION_PRECISION_RESIDUAL',
      blocking: false,
      residualMm: residual,
      toleranceMm,
      acceptedSourcePrecisionMm,
      leftPortId: left.sourcePortId,
      rightPortId: right.sourcePortId,
      ...evidence,
    });
    return;
  }
  issues.push({
    code: 'EXPLICIT_CONNECTION_RESIDUAL_EXCEEDED',
    blocking: true,
    residualMm: residual,
    toleranceMm,
    leftPortId: left.sourcePortId,
    rightPortId: right.sourcePortId,
    ...evidence,
  });
}

/** @param {Record<string, unknown>} branch @param {number} toleranceMm @param {Readonly<Record<string, unknown>>} set @param {Record<string, unknown>[]} issues @returns {void} */
function connectBranchRoute(branch, toleranceMm, set, issues, secondaryIds) {
  const anchors = branch.components.filter((component) => !secondaryIds.has(component.sourceEntityId)).map(routeAnchors).filter(Boolean);
  for (let index = 1; index < anchors.length; index += 1) {
    uniteVerified(anchors[index - 1].exit, anchors[index].entry, toleranceMm, SOURCE_CONNECTION_TOLERANCE_MM, set, issues, {
      authority: 'BRANCH_CHILD_ORDER',
      sourcePath: branch.sourcePath,
    });
  }
  const head = portForRole(branch, 'H'), tail = portForRole(branch, 'T');
  const headTarget = head && anchors.length ? nearestPort(head, [anchors[0].entry, anchors[0].exit]) : null;
  const tailTarget = tail && anchors.length ? nearestPort(tail, [anchors.at(-1).entry, anchors.at(-1).exit]) : null;
  if (head && headTarget) uniteVerified(head, headTarget, toleranceMm, SOURCE_CONNECTION_TOLERANCE_MM, set, issues, {
    authority: 'BRANCH_HEAD_ORDER', sourcePath: branch.sourcePath,
  });
  if (tail && tailTarget) uniteVerified(tailTarget, tail, toleranceMm, SOURCE_CONNECTION_TOLERANCE_MM, set, issues, {
    authority: 'BRANCH_TAIL_ORDER', sourcePath: branch.sourcePath,
  });
}

/** @param {Record<string, unknown>} point @param {Record<string, unknown>[]} candidates @returns {Record<string, unknown>|null} */
function nearestPort(point, candidates) {
  return candidates
    .map((port) => ({ port, distance: pointDistance(point.position, port.position) }))
    .sort((left, right) => left.distance - right.distance)[0]?.port ?? null;
}

/** @param {Record<string, unknown>[]} branches @param {number} toleranceMm @param {Readonly<Record<string, unknown>>} set @param {Record<string, unknown>[]} issues @returns {void} */
function connectBranchReferences(branches, toleranceMm, set, issues) {
  const byName = new Map(branches.map((branch) => [cleanText(branch.name), branch]));
  for (const branch of branches) for (const [field, role] of [['HREF', 'H'], ['TREF', 'T']]) {
    const reference = cleanText(branch.attributes[field]);
    const target = byName.get(reference), sourcePort = portForRole(branch, role);
    if (!reference || !target || !sourcePort) continue;
    const targetPort = nearestPort(sourcePort, [portForRole(target, 'H'), portForRole(target, 'T')].filter(Boolean));
    if (targetPort) uniteVerified(sourcePort, targetPort, toleranceMm, REFERENCE_CONNECTION_TOLERANCE_MM, set, issues, {
      authority: field, sourcePath: branch.sourcePath, reference,
    });
  }
}

/** @param {Record<string, unknown>} component @param {Record<string, unknown>} target @returns {string} */
function reciprocalRole(component, target) {
  const aliases = new Set([cleanText(component.sourceRef), cleanText(component.name)].filter(Boolean));
  if (aliases.has(cleanText(target.attributes.HREF))) return 'H';
  if (aliases.has(cleanText(target.attributes.TREF))) return 'T';
  return '';
}

/** @param {Record<string, unknown>} model @param {number} toleranceMm @param {Readonly<Record<string, unknown>>} set @param {Record<string, unknown>[]} issues @returns {Record<string, unknown>[]} */
function planCrefConnections(model, toleranceMm, set, issues) {
  const branches = model.branches, byName = new Map(branches.map((branch) => [cleanText(branch.name), branch]));
  const components = model.components.filter((component) => ['TEE', 'OLET'].includes(componentCategory(component.sourceType)));
  return components.flatMap((component) => {
    const reference = cleanText(component.attributes.CREF);
    if (!reference) return [];
    const target = byName.get(reference), junctionPort = portForRole(component, 'P');
    const role = target ? reciprocalRole(component, target) : '';
    const targetPort = target && role ? portForRole(target, role) : null;
    if (!target || !junctionPort || !targetPort) {
      issues.push({ code: 'CREF_TARGET_UNRESOLVED', blocking: true, sourcePath: component.sourcePath, reference });
      return [];
    }
    const residualMm = pointDistance(junctionPort.position, targetPort.position);
    if (residualMm > CREF_CONNECTION_SPAN_LIMIT_MM) {
      issues.push({
        code: 'CREF_CONNECTION_SPAN_REJECTED',
        blocking: false,
        residualMm,
        maximumSpanMm: CREF_CONNECTION_SPAN_LIMIT_MM,
        sourcePath: component.sourcePath,
        targetPath: target.sourcePath,
        reference,
      });
      return [];
    }
    const merged = residualMm <= toleranceMm;
    if (merged) set.unite(junctionPort.key, targetPort.key);
    return [{ component, targetBranch: target, junctionPort, targetPort, targetRole: role, residualMm, merged }];
  });
}

/** @param {Record<string, unknown>} model @param {number} toleranceMm @returns {Readonly<Record<string, unknown>>} */
export function buildExplicitConnectivity(model, toleranceMm) {
  const set = createDisjointSet(model.sourcePorts), issues = [];
  const overlapGroups = findManagedOverlapGroups(model.branches, toleranceMm);
  const secondaryIds = new Set(overlapGroups.map((group) => group.secondary.sourceEntityId));
  for (const branch of model.branches) connectBranchRoute(branch, toleranceMm, set, issues, secondaryIds);
  connectBranchReferences(model.branches, toleranceMm, set, issues);
  const crefConnections = planCrefConnections(model, toleranceMm, set, issues);
  return Object.freeze({
    set,
    crefConnections: Object.freeze(crefConnections),
    overlapGroups: Object.freeze(overlapGroups),
    issues: Object.freeze(issues),
  });
}
