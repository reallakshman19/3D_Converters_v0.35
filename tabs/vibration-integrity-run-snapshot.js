const RUN_SNAPSHOT_SCHEMA = 'FitRunSnapshot.v1';
export const FIT_ENGINEERING_INPUT_IDENTITY_SCHEMA = 'FitEngineeringInputIdentity.v1';

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalTable(table) {
  return {
    kind: text(table?.kind),
    contract: text(table?.contract),
    header: [...(table?.header ?? [])].map(text),
    rowIds: [...(table?.rowIds ?? [])].map(text),
    rows: (table?.rows ?? []).map((row) => row.map(text)),
    sourceName: table?.sourceName ?? null,
    sourceKind: table?.sourceKind ?? null,
    authorityDowngraded: table?.authorityDowngraded === true,
  };
}

function canonicalFile(file) {
  if (!file) return null;
  return {
    name: file.name ?? null,
    format: file.format ?? null,
    kind: file.kind ?? null,
    projectionSchema: file.projectionSchema ?? null,
    projectionHash: file.projectionHash ?? null,
    fileHashSchema: file.fileHashSchema ?? null,
    fileHash: file.fileHash ?? null,
  };
}

function canonicalPayload(state) {
  return {
    schema: 'FitWorkingInputState.v1',
    allowLimitedExchange: state.allowLimitedExchange === true,
    benchmarkId: state.benchmark?.loaded?.id ?? null,
    benchmarkModified: state.benchmark?.loaded?.modified === true,
    files: {
      topology: canonicalFile(state.files?.topology),
      operating: canonicalFile(state.files?.operating),
      enrichment: canonicalFile(state.files?.enrichment),
      dataBlockers: canonicalFile(state.files?.dataBlockers),
    },
    tables: {
      topology: canonicalTable(state.tables?.topology),
      operating: canonicalTable(state.tables?.operating),
      enrichment: canonicalTable(state.tables?.enrichment),
      dataBlockers: canonicalTable(state.tables?.dataBlockers),
    },
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SHA-256 is required for vibration execution snapshots.');
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function scopeKey(row) {
  return [row.canonicalId ?? '', row.line ?? '', row.caseId ?? ''].join('\u0000');
}

function engineeringRequest(row) {
  const result = row?.centralResult;
  if (!result) return null;
  return {
    scope: {
      canonicalId: row.canonicalId ?? null,
      line: row.line ?? null,
      caseId: row.caseId ?? null,
    },
    calculationId: result.calculationId ?? row.calculationId ?? null,
    methodRevision: result.methodRevision ?? null,
    resolvedInputs: result.resolvedInputs ?? {},
  };
}

function engineeringPayload(envelope) {
  const rows = envelope?.workflow?.result?.rows ?? [];
  const requests = rows.map(engineeringRequest).filter(Boolean);
  requests.sort((left, right) => scopeKey(left.scope).localeCompare(scopeKey(right.scope)));
  return {
    schema: FIT_ENGINEERING_INPUT_IDENTITY_SCHEMA,
    qualificationMode: envelope?.qualificationMode ?? null,
    requests,
  };
}

function assertSnapshot(snapshot) {
  if (snapshot?.schema !== RUN_SNAPSHOT_SCHEMA || stableJson(snapshot.input) !== snapshot.canonicalInput) {
    throw new Error('A valid immutable FIT run snapshot is required before engineering identity binding.');
  }
}

export async function buildVibrationIntegrityRunSnapshot(state) {
  const input = canonicalPayload(state);
  const canonicalInput = stableJson(input);
  const snapshotHash = await sha256Hex(canonicalInput);
  return deepFreeze({
    schema: RUN_SNAPSHOT_SCHEMA,
    workingInputSchema: input.schema,
    snapshotHash,
    canonicalInput,
    input,
  });
}

export async function bindVibrationIntegrityEngineeringIdentity(snapshot, envelope) {
  assertSnapshot(snapshot);
  const engineeringInput = engineeringPayload(envelope);
  const engineeringCanonicalInput = stableJson(engineeringInput);
  const engineeringInputHash = await sha256Hex(engineeringCanonicalInput);
  return deepFreeze({
    ...snapshot,
    engineeringInputSchema: FIT_ENGINEERING_INPUT_IDENTITY_SCHEMA,
    engineeringInputHash,
    engineeringCanonicalInput,
    engineeringInput,
  });
}
