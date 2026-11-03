/**
 * UxmlCl1PackageSnapshot.js
 *
 * CL1 snapshot/export JSON for route-package debugging.
 */

export const UXML_CL1_PACKAGE_SNAPSHOT_SCHEMA = 'uxml-cl1-package-snapshot/v1';

function clean(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (value == null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  const text = canonicalJson(value);
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `cl1snap-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sanitizeFilePart(value, fallback = 'cl1-package') {
  const text = clean(value)
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return text || fallback;
}

function pickSourceInfo(pkg) {
  return {
    sourceFile: clean(pkg?.sourceInfo?.sourceFile || pkg?.sourceInfo?.fileName || ''),
    selectedSourceType: clean(pkg?.sourceInfo?.selectedSourceType || ''),
    detectedSourceType: clean(pkg?.sourceInfo?.detectedSourceType || ''),
    profile: clean(pkg?.sourceInfo?.profile || ''),
  };
}

function makeSnapshotCore(pkg) {
  return {
    packageId: clean(pkg?.packageId),
    targetRoute: clean(pkg?.targetRoute),
    targetRouteLabel: clean(pkg?.targetRouteLabel),
    allowed: pkg?.allowed === true,
    blocked: pkg?.blocked === true,
    blockCode: clean(pkg?.blockCode),
    blockedReason: clean(pkg?.blockedReason),
    sourceInfo: pickSourceInfo(pkg),
    entityCounts: cloneJson(pkg?.entityCounts || {}),
    topologyCounts: cloneJson(pkg?.topologyCounts || {}),
    handoffSummary: cloneJson(pkg?.handoffSummary || {}),
    componentTypes: cloneJson(pkg?.componentTypes || {}),
    pipelineRefs: cloneJson(list(pkg?.pipelineRefs)),
    routeContract: cloneJson(pkg?.routeContract || {}),
    policy: cloneJson(pkg?.policy || null),
    diagnostics: cloneJson(list(pkg?.diagnostics)),
    lossContract: cloneJson(list(pkg?.lossContract)),
  };
}

export function buildUxmlCl1PackageSnapshot(
  cl1RoutePackage,
  {
    includePayload = false,
    includeDiagnostics = true,
    includeLossContract = true,
  } = {}
) {
  const pkg = cl1RoutePackage || {};
  const core = makeSnapshotCore(pkg);

  const snapshotSeed = {
    schema: UXML_CL1_PACKAGE_SNAPSHOT_SCHEMA,
    packageId: core.packageId,
    targetRoute: core.targetRoute,
    allowed: core.allowed,
    entityCounts: core.entityCounts,
    topologyCounts: core.topologyCounts,
    handoffSummary: core.handoffSummary,
    componentTypes: core.componentTypes,
    pipelineRefs: core.pipelineRefs,
    includePayload,
    includeDiagnostics,
    includeLossContract,
  };

  return {
    schema: UXML_CL1_PACKAGE_SNAPSHOT_SCHEMA,
    snapshotId: stableHash(snapshotSeed),
    deterministic: true,
    debugOnly: true,
    pcfGenerated: false,
    mastersResolved: false,
    coordinatesMutated: false,
    fixesApplied: false,
    ...core,
    diagnostics: includeDiagnostics ? core.diagnostics : [],
    lossContract: includeLossContract ? core.lossContract : [],
    payloadIncluded: includePayload === true,
    payload: includePayload ? cloneJson(pkg.payload || null) : null,
  };
}

export function serializeUxmlCl1PackageSnapshot(snapshot, { pretty = true } = {}) {
  return JSON.stringify(snapshot, null, pretty ? 2 : 0);
}

export function createUxmlCl1SnapshotFileName(snapshot, { prefix = 'uxml-cl1', extension = 'json' } = {}) {
  const source = sanitizeFilePart(snapshot?.sourceInfo?.sourceFile || snapshot?.sourceInfo?.profile || 'package');
  const route = sanitizeFilePart(snapshot?.targetRoute || 'route');
  const id = sanitizeFilePart(snapshot?.snapshotId || 'snapshot');

  return `${sanitizeFilePart(prefix)}-${source}-${route}-${id}.${sanitizeFilePart(extension, 'json')}`;
}

export function createUxmlCl1SnapshotDownload({
  cl1RoutePackage,
  includePayload = false,
  includeDiagnostics = true,
  includeLossContract = true,
} = {}) {
  const snapshot = buildUxmlCl1PackageSnapshot(cl1RoutePackage, {
    includePayload,
    includeDiagnostics,
    includeLossContract,
  });

  const text = serializeUxmlCl1PackageSnapshot(snapshot, { pretty: true });

  return {
    schema: 'uxml-cl1-snapshot-download/v1',
    snapshot,
    fileName: createUxmlCl1SnapshotFileName(snapshot),
    mimeType: 'application/json',
    text,
    byteLength: text.length,
    debugOnly: true,
    pcfGenerated: false,
    mastersResolved: false,
    coordinatesMutated: false,
    fixesApplied: false,
  };
}

export const buildUxmlCl1Snapshot = buildUxmlCl1PackageSnapshot;
