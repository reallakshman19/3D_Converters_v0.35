import {
  buildFbxBenchmarkZoneManifest,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-contract.js';
import {
  buildFbxZoneMembershipIndex,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-membership.js';
import {
  loadFbxBenchmark,
} from '../../tabs/model-converters/converters/fbx/benchmark/benchmark-loader.js';
import {
  buildComponentSubjects,
  qualifyComponents,
} from '../../tabs/model-converters/converters/fbx/benchmark/component-qualification.js';

export const benchmark = Object.freeze({
  commit: 'ecd841cd41cc7a8df1764cec502e0873f578a5dc',
  path: 'Benchmarks/fbx BM/StaggedJsonBMforFBX',
  blobSha: 'e4ce63f180d3bcc3cba0e85137ce9811cef477e9',
});

export const point = (x, y, z) => ({ x, y, z });

export function branch(name, children, options = {}) {
  return [{
    name,
    type: 'BRANCH',
    attributes: {
      NAME: name,
      REF: name,
      OWNER: options.owner ?? name.replace(/\/B\d+$/, ''),
      OWNER_SITE: options.ownerSite ?? 'SITE-LINE',
    },
    children,
  }];
}

export function fitting(type, ref, options = {}) {
  const raw = options.rawType || type;
  const start = options.apos || point(0, 0, 0);
  const end = options.lpos || point(100, 0, 0);
  return {
    name: `${type} ${ref}`,
    type,
    attributes: {
      NAME: ref,
      REF: ref,
      TYPE: raw,
      RAW_TYPE: raw,
      OWNER: options.owner || '/LINE',
      POS: options.position || start,
      APOS: start,
      LPOS: end,
      ABORE: options.abore || '100mm',
      LBORE: options.lbore || options.abore || '100mm',
      ANGL: options.angle ?? null,
      CREF: options.cref ?? null,
      SPRE: options.specification ?? '/SPEC/FAMILY',
      ORI: options.orientation ?? 'Y is N and Z is U',
      ...(options.extra || {}),
    },
  };
}

export function pipe(name, options = {}) {
  return {
    name,
    type: 'PIPE',
    attributes: {
      APOS: options.apos || point(0, 0, 0),
      LPOS: options.lpos || point(100, 0, 0),
      AUTO_GENERATED_PIPE: 'true',
      GAP_MM: options.gap ?? '100',
      ROUTE_TIER: options.routeTier || 'LEGACY',
      ROUTE_SPLIT: options.routeSplit || '',
      LBORE: options.bore || '100mm',
      BORE_SOURCE: 'inherited from adjacent fitting',
    },
  };
}

export function componentPolicy() {
  const family = (
    familyId, outerTypes, rawTypes, comparatorId, preserveRawSubtype = true,
  ) => ({
    familyId, outerTypes, rawTypes, preserveRawSubtype,
    disposition: 'QUALIFY', comparatorId, exclusionReason: null,
  });
  return {
    schema: 'FbxComponentIdentityPolicy.v1',
    policyId: 'agent-c-test-policy',
    authorityState: 'FROZEN',
    typeCatalog: [
      family('PIPE', ['PIPE'], [], 'PIPE.v1', false),
      family('ELBOW', ['ELBO'], ['ELBO', 'BEND'], 'ELBOW.v1'),
      family('TEE', ['TEE'], ['TEE'], 'TEE.v1'),
      family('REDUCER', ['REDU'], ['REDU'], 'REDUCER.v1'),
      family('FLANGE', ['FLAN'], ['FLAN', 'FBLI'], 'FLANGE.v1'),
      family('VALVE', ['VALV'], ['VALV'], 'VALVE.v1'),
      family('GASKET', ['GASK'], ['GASK'], 'GASKET.v1'),
      family('BRANCH_FITTING', ['OLET'], ['OLET'], 'BRANCH_FITTING.v1'),
      family('INSTRUMENT', ['INST'], ['INST'], 'INSTRUMENT.v1'),
    ],
    identityRules: [
      {
        ruleId: 'stable-source-identity', rank: 1, kind: 'EXACT',
        applicableFamilies: [
          'PIPE', 'ELBOW', 'TEE', 'REDUCER', 'FLANGE', 'VALVE',
          'GASKET', 'BRANCH_FITTING', 'INSTRUMENT',
        ],
        requiredFields: ['sourceIdentity'], normalizationRuleIds: ['trim'],
        scope: 'GLOBAL', uniquenessRequirement: 'EXACTLY_ONE', passing: true,
      },
      {
        ruleId: 'reference-branch-family', rank: 2, kind: 'EXACT',
        applicableFamilies: [
          'ELBOW', 'TEE', 'REDUCER', 'FLANGE', 'VALVE',
          'GASKET', 'BRANCH_FITTING', 'INSTRUMENT',
        ],
        requiredFields: ['reference', 'branchId'],
        normalizationRuleIds: ['trim', 'normalize-slashes'],
        scope: 'BRANCH', uniquenessRequirement: 'COLLISION_PRESERVING', passing: true,
      },
      {
        ruleId: 'synthetic-pipe-composite', rank: 3, kind: 'APPROVED_COMPOSITE',
        applicableFamilies: ['PIPE'],
        requiredFields: [
          'branchId', 'family', 'geometry.apos', 'geometry.lpos',
          'attributes.AUTO_GENERATED_PIPE', 'attributes.ROUTE_TIER',
        ],
        normalizationRuleIds: [], scope: 'BRANCH',
        uniquenessRequirement: 'COLLISION_PRESERVING', passing: true,
      },
      {
        ruleId: 'spatial-diagnostic', rank: 4, kind: 'DIAGNOSTIC_SPATIAL',
        applicableFamilies: [
          'PIPE', 'ELBOW', 'TEE', 'REDUCER', 'FLANGE', 'VALVE',
          'GASKET', 'BRANCH_FITTING', 'INSTRUMENT',
        ],
        requiredFields: ['branchId', 'family', 'geometry.apos'],
        normalizationRuleIds: [], scope: 'BRANCH',
        uniquenessRequirement: 'COLLISION_PRESERVING', passing: false,
      },
    ],
    collisionPolicy: {
      indexShape: 'MULTIMAP', preserveAllSubjects: true, mergeDuplicates: false,
      greedyResolutionAllowed: false, ambiguousState: 'AMBIGUOUS_MATCH',
      blockedState: 'BLOCKED_IDENTITY',
    },
    cardinalityPolicy: {
      maximumPassingCounterpartsPerReference: 1,
      maximumPassingCounterpartsPerActual: 1,
      atomicReservationRequired: true,
    },
    unknownTypePolicy: 'BLOCKED_IDENTITY',
    policyContentSha256: '8b112808ff0828299e23ba7545a20792cad1446ce95d1b6310abc0e2ec6479e4',
  };
}

export const toleranceProfile = Object.freeze({
  schema: 'FbxBenchmarkToleranceProfile.v1',
  profileId: 'agent-c-test-tolerances',
  rules: {
    coordinate: { absolute: 0.01, relative: 0 },
    endpoint: { absolute: 0.01, relative: 0 },
    bore: { absolute: 0.001, relative: 0 },
    length: { absolute: 0.01, relative: 0 },
    angle: { absolute: 0.001, relative: 0 },
  },
});

function zoneManifest(branches, zoneId = 'ZONE-LINE') {
  return buildFbxBenchmarkZoneManifest({
    schema: 'FbxBenchmarkZoneManifest.v1',
    benchmark,
    zonePolicyId: 'explicit-branch-owner-site-v1',
    sharedBoundaryPolicy: 'explicit-only',
    zones: [{
      zoneId,
      displayName: zoneId,
      ownerSites: [],
      owners: [],
      branches: branches.map((item) => item.name),
      sharedBoundaryBranches: [],
    }],
    exclusions: [],
  });
}

export function zoneIndexFor(branches, zoneId = 'ZONE-LINE') {
  return buildFbxZoneMembershipIndex(zoneManifest(branches, zoneId), branches);
}

export async function loadBranches(value) {
  if (value?.schema === 'FbxBenchmarkLoaded.v1') return value;
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return loadFbxBenchmark({ bytes });
}

export async function qualify(options) {
  const referenceSource = options.reference;
  const actualSource = options.actual;
  const referenceLoaded = await loadBranches(referenceSource);
  const actualLoaded = await loadBranches(actualSource);
  return qualifyComponents({
    ...options,
    reference: referenceLoaded,
    actual: actualLoaded,
    benchmarkIdentity: options.benchmarkIdentity ?? benchmark,
    referenceZoneIndex: options.referenceZoneIndex
      ?? zoneIndexFor(referenceLoaded.branches),
    actualZoneIndex: options.actualZoneIndex
      ?? zoneIndexFor(actualLoaded.branches),
  });
}

export async function buildSubjects(value, side = 'REFERENCE') {
  const loaded = await loadBranches(value);
  return buildComponentSubjects(loaded, componentPolicy(), side, {
    zoneIndex: zoneIndexFor(loaded.branches), benchmarkIdentity: benchmark,
  });
}
