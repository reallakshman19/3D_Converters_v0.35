(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HpAuthorityPackageCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'hp-piping-class-authority-package/v1';
  const LIFECYCLES = new Set(['draft', 'for-review', 'approved-record']);
  const USER_FATIGUE_POLICY = Object.freeze({
    calculationMode: 'USER_CALCULATED_KD3',
    requiredSeqMode: 'manual',
    requiredNiMode: 'manual',
    nativeCoreKd3Qualified: false,
    canUseForDesignAuthority: false,
    codeCompliance: false,
    reason: 'CONTROLLED_KD320_FORMULATION_AND_CUSTODY_NOT_ESTABLISHED',
  });
  const SOURCES = Object.freeze({
    b31: Object.freeze({
      edition: '2024',
      commit: '00f47512e96780ebab10416dcc9354f719346457',
      blob: '3395ececce7731053dd0f6317008b4cd77446b78',
    }),
    kd2: Object.freeze({
      commit: '4dd651abbc86310077eaace6caa8b6788c1a6697',
      blob: '8f20cd0dab683d28359e02207f6f65b834144ec9',
    }),
    kd3: Object.freeze({
      commit: 'f4d49f2a47d970ae0abf913b537193e324556177',
      blob: 'e6abaddb7833eb0a61c9460ae39201e2252dc596',
      size: 1179548,
    }),
  });

  function plainClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function same(actual, expected) {
    return String(actual ?? '') === String(expected ?? '');
  }

  function normalizedIdentity(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function sourceErrors(sources) {
    const errors = [];
    if (!sources || typeof sources !== 'object') return ['Source manifest is missing.'];

    for (const field of ['edition', 'commit', 'blob']) {
      if (!same(sources.b31?.[field], SOURCES.b31[field])) {
        errors.push(`B31.3 source ${field} does not match this tool.`);
      }
    }
    for (const field of ['commit', 'blob']) {
      if (!same(sources.kd2?.[field], SOURCES.kd2[field])) {
        errors.push(`KD-2 source ${field} does not match this tool.`);
      }
    }
    for (const field of ['commit', 'blob', 'size']) {
      if (!same(sources.kd3?.[field], SOURCES.kd3[field])) {
        errors.push(`KD-3 source ${field} does not match this tool.`);
      }
    }
    return errors;
  }

  function metadataErrors(metadata) {
    const errors = [];
    if (!metadata || typeof metadata !== 'object') return ['Package metadata is missing.'];
    if (!String(metadata.packageId || '').trim()) errors.push('Package ID is required.');
    if (!String(metadata.revision || '').trim()) errors.push('Package revision is required.');
    if (!String(metadata.preparedBy || '').trim()) errors.push('Prepared by is required.');
    if (!LIFECYCLES.has(metadata.lifecycle)) errors.push('Package lifecycle is invalid.');
    if (metadata.lifecycle === 'approved-record' && !String(metadata.checkedBy || '').trim()) {
      errors.push('Checked by is required for an approved record.');
    }
    if (normalizedIdentity(metadata.checkedBy)
      && normalizedIdentity(metadata.checkedBy) === normalizedIdentity(metadata.preparedBy)) {
      errors.push('Prepared by and checked by must be independent identities.');
    }
    return errors;
  }

  function cycleErrors(cycles) {
    const errors = [];
    if (!Array.isArray(cycles) || !cycles.length) return ['At least one cycle block is required.'];
    const ids = new Set();
    cycles.forEach((cycle, index) => {
      const id = String(cycle?.id || '').trim();
      if (!id) errors.push(`Cycle ${index + 1} has no ID.`);
      else if (ids.has(id)) errors.push(`Duplicate cycle ID ${id}.`);
      else ids.add(id);
    });
    return errors;
  }

  function authorityErrors(authority) {
    const errors = [];
    if (!authority || typeof authority !== 'object') return ['Authority inputs are missing.'];
    const seqMode = String(authority.seqMode || '').trim();
    const niMode = String(authority.fatigueCurveMode || '').trim();
    if (seqMode !== USER_FATIGUE_POLICY.requiredSeqMode) {
      errors.push('Native/automatic KD-3 Seq is not qualified. Use USER_CALCULATED_KD3 with externally supplied Seq.');
    }
    if (niMode !== USER_FATIGUE_POLICY.requiredNiMode) {
      errors.push('CORE fatigue-curve Ni evaluation is not authorized for this product path. Supply permissible cycles N externally.');
    }
    if (authority.seqRouteApproved && !String(authority.seqRouteSourceRef || '').trim()) {
      errors.push('External KD-3 calculation/source reference is required when the Seq route is marked reviewed.');
    }
    for (const field of ['seqBeta', 'seqReferenceCycles', 'seqMeanTermLimit']) {
      if (authority[field] !== null && authority[field] !== undefined && String(authority[field]).trim() !== '') {
        errors.push(`${field} is legacy native-KD3 input and is not accepted while CORE KD-3 is unqualified.`);
      }
    }
    if (String(authority.fatigueCurveData || '').trim()) {
      errors.push('Embedded fatigue-curve data are not accepted on the USER_CALCULATED_KD3 product path.');
    }
    return errors;
  }

  function canonicalKd3EvidenceErrors(items, lifecycle = 'draft') {
    const errors = [];
    if (items == null) return errors;
    if (!Array.isArray(items)) return ['userCalculatedKd3Evidence must be an array.'];
    const keys = new Set();
    items.forEach((item, index) => {
      const key = String(item?.key || '').trim();
      const label = key || `item ${index + 1}`;
      if (!key) errors.push(`userCalculatedKd3Evidence item ${index + 1} has no key.`);
      else if (keys.has(key)) errors.push(`Duplicate userCalculatedKd3Evidence key ${key}.`);
      else keys.add(key);

      for (const field of ['userAlternatingStressIntensityMpa', 'equivalentAlternatingStressMpa', 'permissibleCycles']) {
        const value = item?.[field];
        if (value !== null && value !== undefined && !finite(value)) {
          errors.push(`${label} ${field} must be finite or null.`);
        }
      }

      const userSalt = item?.userAlternatingStressIntensityMpa;
      const seq = item?.equivalentAlternatingStressMpa;
      const N = item?.permissibleCycles;
      if (finite(userSalt) && userSalt < 0) errors.push(`${label} userAlternatingStressIntensityMpa must be >= 0.`);
      if (finite(seq) && seq < 0) errors.push(`${label} equivalentAlternatingStressMpa must be >= 0.`);
      if (finite(N) && !(N > 0)) errors.push(`${label} permissibleCycles must be > 0 when supplied.`);
      if (seq === 0 && N !== null && N !== undefined) errors.push(`${label} Seq=0 zero-damage custody requires N to be null/N/A.`);

      const basis = item?.calculationBasis;
      if (basis != null && (typeof basis !== 'object' || Array.isArray(basis))) {
        errors.push(`${label} calculationBasis must be an object.`);
      }
      const checkedBy = String(basis?.checkedBy || '').trim();
      const checkedAt = String(basis?.checkedAt || '').trim();
      if (Boolean(checkedBy) !== Boolean(checkedAt)) {
        errors.push(`${label} checkedBy and checkedAt must be supplied together.`);
      }
      if (normalizedIdentity(checkedBy)
        && normalizedIdentity(checkedBy) === normalizedIdentity(basis?.calculatedBy)) {
        errors.push(`${label} checker must differ from calculatedBy.`);
      }

      if (lifecycle === 'approved-record') {
        if (!(finite(seq) && seq >= 0)) errors.push(`${label} approved record requires finite Seq >= 0.`);
        if (seq > 0 && !(finite(N) && N > 0)) errors.push(`${label} positive Seq requires finite N > 0.`);
        for (const field of ['code', 'edition', 'methodRef', 'calculationRef', 'calculatedBy']) {
          if (!String(basis?.[field] || '').trim()) errors.push(`${label} approved record requires calculationBasis.${field}.`);
        }
        if (!checkedBy || !checkedAt) errors.push(`${label} approved record requires checkedBy and checkedAt.`);
      }
    });
    return errors;
  }

  function canonicalEvidenceMap(items) {
    return new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.key || '').trim(), item]));
  }

  function rowEvidenceErrors(rowEvidence, canonicalEvidence = []) {
    const errors = [];
    if (rowEvidence == null) return errors;
    if (!Array.isArray(rowEvidence)) return ['rowEvidence must be an array.'];
    const keys = new Set();
    const canonical = canonicalEvidenceMap(canonicalEvidence);
    rowEvidence.forEach((item, index) => {
      const key = String(item?.key || '').trim();
      if (!key) errors.push(`rowEvidence item ${index + 1} has no key.`);
      else if (keys.has(key)) errors.push(`Duplicate rowEvidence key ${key}.`);
      else keys.add(key);
      if (item?.approved) {
        const canonicalItem = canonical.get(key);
        const canonicalZeroDamage = canonicalItem?.equivalentAlternatingStressMpa === 0
          && (canonicalItem?.permissibleCycles === null || canonicalItem?.permissibleCycles === undefined);
        if (!canonicalZeroDamage && !(typeof item.seq === 'number' && Number.isFinite(item.seq) && item.seq > 0)) {
          errors.push(`Approved rowEvidence ${key || index + 1} requires a finite Seq > 0 unless canonical USER_CALCULATED_KD3 evidence records explicit zero damage.`);
        }
        if (!canonicalZeroDamage && !(typeof item.ni === 'number' && Number.isFinite(item.ni) && item.ni > 0)) {
          errors.push(`Approved rowEvidence ${key || index + 1} requires a finite permissible cycle count N > 0 unless canonical USER_CALCULATED_KD3 evidence records explicit zero damage.`);
        }
        if (!String(item.source || '').trim()) {
          errors.push(`Approved rowEvidence ${key || index + 1} requires an external KD-3 calculation/source reference.`);
        }
      }
    });
    return errors;
  }

  function validatePackage(pkg) {
    const errors = [];
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
      return { ok: false, errors: ['Package must be a JSON object.'] };
    }
    if (pkg.schema !== SCHEMA) errors.push(`Unsupported package schema: ${pkg.schema || '(missing)'}.`);
    errors.push(...sourceErrors(pkg.sources));
    errors.push(...metadataErrors(pkg.metadata));
    if (!pkg.inputs || typeof pkg.inputs !== 'object') {
      errors.push('Package inputs are missing.');
    } else {
      if (!pkg.inputs.design || typeof pkg.inputs.design !== 'object') errors.push('Design inputs are missing.');
      else if (!same(pkg.inputs.design.b31Edition, SOURCES.b31.edition)) errors.push('Design B31.3 edition does not match this tool.');
      errors.push(...authorityErrors(pkg.inputs.authority));
      errors.push(...cycleErrors(pkg.inputs.cycles));
    }
    errors.push(...canonicalKd3EvidenceErrors(pkg.userCalculatedKd3Evidence, pkg.metadata?.lifecycle));
    errors.push(...rowEvidenceErrors(pkg.rowEvidence, pkg.userCalculatedKd3Evidence));
    return { ok: errors.length === 0, errors };
  }

  function importPayload(pkg) {
    const validation = validatePackage(pkg);
    if (!validation.ok) return { ok: false, errors: validation.errors, payload: null };
    return {
      ok: true,
      errors: [],
      payload: {
        metadata: plainClone(pkg.metadata),
        inputs: plainClone(pkg.inputs),
        rowEvidence: plainClone(pkg.rowEvidence || []),
        userCalculatedKd3Evidence: plainClone(pkg.userCalculatedKd3Evidence || []),
      },
    };
  }

  function matchRowEvidence(rowEvidence, availableKeys) {
    const available = new Set((availableKeys || []).map((key) => String(key || '')));
    const matched = [];
    const missing = [];
    (rowEvidence || []).forEach((item) => {
      if (available.has(String(item?.key || ''))) matched.push(plainClone(item));
      else missing.push(String(item?.key || ''));
    });
    return { matched, missing };
  }

  function createPackage({
    metadata,
    inputs,
    rowEvidence = [],
    userCalculatedKd3Evidence = [],
    snapshot = {},
    generatedAt,
  } = {}) {
    return {
      schema: SCHEMA,
      generatedAt: generatedAt || new Date().toISOString(),
      generator: {
        repository: 'reallaksh19/3D_Converters',
        path: 'engineering/hp-class-standardization/authority-package.html',
      },
      sources: plainClone(SOURCES),
      metadata: plainClone(metadata || {}),
      inputs: plainClone(inputs || {}),
      rowEvidence: plainClone(rowEvidence || []),
      userCalculatedKd3Evidence: plainClone(userCalculatedKd3Evidence || []),
      snapshot: plainClone(snapshot || {}),
      fatigueAuthority: plainClone(USER_FATIGUE_POLICY),
      authorityNote: 'Package lifecycle is document custody only. USER_CALCULATED_KD3 remains review-only; native CORE KD-3, Code compliance and design authority are not established.',
    };
  }

  function rowKey(wall, cycleId) {
    const numericWall = Number(wall);
    if (!Number.isFinite(numericWall)) return '';
    return `${numericWall.toFixed(4)}-${String(cycleId || '').trim()}`;
  }

  function safeFilename(packageId, revision) {
    const raw = `${packageId || 'hp-class'}-${revision || 'draft'}`.trim();
    const safe = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return `${safe || 'hp-class-authority-package'}.json`;
  }

  return Object.freeze({
    SCHEMA,
    SOURCES,
    USER_FATIGUE_POLICY,
    createPackage,
    validatePackage,
    importPayload,
    matchRowEvidence,
    sourceErrors,
    authorityErrors,
    canonicalKd3EvidenceErrors,
    rowKey,
    safeFilename,
  });
});