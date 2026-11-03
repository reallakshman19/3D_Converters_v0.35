const EPS = 1e-9;
const READY_STATES = new Set(['INDEPENDENTLY_CHECKED', 'QUALIFIED', 'VERIFIED']);
const LINEAR_POLICY = 'LINEAR_NO_EXTRAPOLATION';

function failure(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    details,
    resolverState: 'SOURCE_PENDING',
    canUseForDesignAuthority: false,
  };
}

function text(value) {
  return String(value ?? '').trim();
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validHash(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(text(value));
}

function sourceFor(row, sources) {
  const matches = sources.filter((source) => text(source?.sourceId) === text(row?.sourceId));
  if (matches.length !== 1) {
    return failure(
      matches.length ? 'MASTER_RECORD_AMBIGUOUS' : 'MASTER_RECORD_NOT_FOUND',
      `Allowable-stress source ${row?.sourceId ?? '(missing)'} must resolve to exactly one source record.`,
      { sourceId: row?.sourceId ?? null, matches: matches.length },
    );
  }
  return { ok: true, source: matches[0] };
}

function sourceContractError(source, edition) {
  if (text(source.role) !== 'B313_ALLOWABLE_STRESS') {
    return 'Source role must be B313_ALLOWABLE_STRESS.';
  }
  if (text(source.standard) !== 'ASME B31.3') {
    return 'Allowable-stress source standard must be ASME B31.3.';
  }
  if (text(source.edition) !== text(edition)) {
    return `Allowable-stress source edition must equal B31.3 edition ${edition}.`;
  }
  if (!validHash(source.documentHash)) {
    return 'Allowable-stress source requires an exact sha256 document hash.';
  }
  return null;
}

function evidenceIssues(row, source) {
  const issues = [];
  if (!READY_STATES.has(text(row.qualificationState))) {
    issues.push('ALLOWABLE_ROW_NOT_INDEPENDENTLY_CHECKED');
  }
  if (!READY_STATES.has(text(source.qualificationState))) {
    issues.push('ALLOWABLE_SOURCE_NOT_INDEPENDENTLY_CHECKED');
  }
  if (!text(source.verifiedBy) || !text(source.independentCheckBy)
      || text(source.verifiedBy) === text(source.independentCheckBy)) {
    issues.push('ALLOWABLE_SOURCE_CUSTODY_INCOMPLETE');
  }
  if (!text(source.verifiedAt) || !text(source.independentCheckedAt)) {
    issues.push('ALLOWABLE_SOURCE_TIMESTAMPS_INCOMPLETE');
  }
  return issues;
}

function validateRow(row, query, sources) {
  if (text(row.materialId) !== text(query.materialId)) {
    return failure('MASTER_RECORD_NOT_FOUND', 'Allowable-stress row material does not match the requested material.');
  }
  if (text(row.b313Edition) !== text(query.b313Edition)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Allowable-stress row B31.3 edition does not match the requested edition.');
  }
  if (!finite(row.temperatureC) || !finite(row.allowableStressMpa) || !(row.allowableStressMpa > 0)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Allowable-stress row must contain finite temperature and positive allowable stress.');
  }
  if (!text(row.sourceId) || !text(row.sourceLocator)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Allowable-stress row requires sourceId and sourceLocator.');
  }
  const resolvedSource = sourceFor(row, sources);
  if (!resolvedSource.ok) return resolvedSource;
  const contractError = sourceContractError(resolvedSource.source, query.b313Edition);
  if (contractError) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', contractError, { sourceId: row.sourceId });
  }
  return {
    ok: true,
    row,
    source: resolvedSource.source,
    issues: evidenceIssues(row, resolvedSource.source),
  };
}

function candidateRows(query, rows) {
  return rows
    .filter((row) => text(row?.materialId) === text(query.materialId)
      && text(row?.b313Edition) === text(query.b313Edition))
    .sort((a, b) => a.temperatureC - b.temperatureC);
}

function exactResult(query, checked) {
  const { row, source, issues } = checked;
  return {
    ok: true,
    resolverState: issues.length ? 'SOURCE_PENDING' : 'RESOLVED_NOT_AUTHORIZED',
    canUseForDesignAuthority: false,
    materialId: text(query.materialId),
    b313Edition: text(query.b313Edition),
    temperatureC: query.temperatureC,
    allowableStressMpa: row.allowableStressMpa,
    interpolation: { type: 'EXACT_TABLE_POINT', lowerTemperatureC: row.temperatureC, upperTemperatureC: row.temperatureC },
    provenance: { sourceId: row.sourceId, sourceLocator: row.sourceLocator, documentHash: source.documentHash },
    issues,
  };
}

function interpolationResult(query, lower, upper) {
  if (text(lower.row.interpolationPolicy) !== LINEAR_POLICY
      || text(upper.row.interpolationPolicy) !== LINEAR_POLICY) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', `Interpolation requires explicit ${LINEAR_POLICY} policy on both bracketing rows.`);
  }
  if (text(lower.row.sourceId) !== text(upper.row.sourceId)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Interpolation cannot cross allowable-stress source identities.');
  }
  const fraction = (query.temperatureC - lower.row.temperatureC)
    / (upper.row.temperatureC - lower.row.temperatureC);
  const allowableStressMpa = lower.row.allowableStressMpa
    + fraction * (upper.row.allowableStressMpa - lower.row.allowableStressMpa);
  const issues = [...new Set([...lower.issues, ...upper.issues])];
  return {
    ok: true,
    resolverState: issues.length ? 'SOURCE_PENDING' : 'RESOLVED_NOT_AUTHORIZED',
    canUseForDesignAuthority: false,
    materialId: text(query.materialId),
    b313Edition: text(query.b313Edition),
    temperatureC: query.temperatureC,
    allowableStressMpa,
    interpolation: {
      type: 'LINEAR_NO_EXTRAPOLATION',
      lowerTemperatureC: lower.row.temperatureC,
      upperTemperatureC: upper.row.temperatureC,
      fraction,
    },
    provenance: {
      sourceId: lower.row.sourceId,
      sourceLocator: [lower.row.sourceLocator, upper.row.sourceLocator],
      documentHash: lower.source.documentHash,
    },
    issues,
  };
}

export function resolveChapterIxAllowableStress({ query = {}, rows = [], sources = [] } = {}) {
  if (!text(query.materialId) || !text(query.b313Edition) || !finite(query.temperatureC)) {
    return failure('INPUT_INVALID', 'materialId, b313Edition and finite temperatureC are required.');
  }
  const selected = candidateRows(query, rows);
  if (!selected.length) {
    return failure('MASTER_RECORD_NOT_FOUND', 'No allowable-stress rows match the requested material and B31.3 edition.');
  }
  const minTemperature = selected[0].temperatureC;
  const maxTemperature = selected[selected.length - 1].temperatureC;
  if (query.temperatureC < minTemperature - EPS || query.temperatureC > maxTemperature + EPS) {
    return failure('INPUT_OUTSIDE_APPLICABILITY', 'Requested material temperature is outside the controlled allowable-stress range; extrapolation is prohibited.', {
      minTemperatureC: minTemperature,
      maxTemperatureC: maxTemperature,
    });
  }
  const exact = selected.find((row) => Math.abs(row.temperatureC - query.temperatureC) <= EPS);
  if (exact) {
    const checked = validateRow(exact, query, sources);
    return checked.ok ? exactResult(query, checked) : checked;
  }
  for (let index = 0; index < selected.length - 1; index += 1) {
    const lowerRow = selected[index];
    const upperRow = selected[index + 1];
    if (lowerRow.temperatureC < query.temperatureC && query.temperatureC < upperRow.temperatureC) {
      const lower = validateRow(lowerRow, query, sources);
      if (!lower.ok) return lower;
      const upper = validateRow(upperRow, query, sources);
      if (!upper.ok) return upper;
      return interpolationResult(query, lower, upper);
    }
  }
  return failure('MASTER_RECORD_NOT_FOUND', 'No valid bracketing allowable-stress rows were found.');
}
