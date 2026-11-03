import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  discoverVibrationStage5cEvidence,
  recoverVibrationStage5cEvidence,
  runVibrationStage5cRecovery,
} from '../scripts/recover-vibration-stage5c-via-document-evidence.mjs';
import {
  CONTROLLED_EI_SOURCE,
  VIBRATION_STAGE5C_SELECTION_SCHEMA,
} from '../scripts/vibration-stage5c-targets.mjs';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const OBSERVATION_HASH = `sha256:${'b'.repeat(64)}`;
const PASS_HASH = `sha256:${'c'.repeat(64)}`;
const DECISION_HASH = `sha256:${'d'.repeat(64)}`;
const SURFACE_HASH = `sha256:${'e'.repeat(64)}`;

function controlledSource(overrides = {}) {
  return {
    schema: 'SourceIdentity.v1',
    sourceId: 'source:controlled',
    sha256: SOURCE_HASH,
    mediaType: 'application/pdf',
    sizeBytes: CONTROLLED_EI_SOURCE.sizeBytes,
    logicalPath: CONTROLLED_EI_SOURCE.apiSourcePath,
    ...overrides,
  };
}

function evidenceDecision(state = 'accepted', diagnosticCodes = [], overrides = {}) {
  return {
    schema: 'EvidenceDecision.v1',
    decisionId: 'decision:1',
    decisionHash: DECISION_HASH,
    state,
    observationHashes: [OBSERVATION_HASH],
    ...(state === 'accepted' ? { selectedObservationHash: OBSERVATION_HASH, effectiveText: '10.0' } : {}),
    diagnosticCodes,
    ...overrides,
  };
}

function table(candidateId = 'candidate-1', decision = evidenceDecision(), overrides = {}) {
  return {
    candidate: {
      candidateId, page: 81, strategy: 'ruled', bbox: [0, 0, 10, 10],
      rowCount: 1, columnCount: 1,
    },
    observations: [{
      schema: 'Observation.v1', observationHash: OBSERVATION_HASH, sourceHash: SOURCE_HASH,
    }],
    tablePass: {
      schema: 'TablePass.v1',
      tablePassId: `pass:${candidateId}`,
      tablePassHash: PASS_HASH,
      tableCandidateId: candidateId,
      passId: 'native:ruled',
      sourceHash: SOURCE_HASH,
      surfaceId: 'surface:1',
      surfaceHash: SURFACE_HASH,
      cells: [{
        cellId: 'cell:1', rowIndex: 0, columnIndex: 0,
        geometry: { type: 'Quad', coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] },
        observationHashes: [OBSERVATION_HASH],
      }],
    },
    cellDecisions: [decision],
    ...overrides,
  };
}

function selection(candidateIds) {
  return {
    schema: VIBRATION_STAGE5C_SELECTION_SCHEMA,
    sourceHash: SOURCE_HASH,
    selections: [{
      selectionId: 'span-factors',
      masterId: 'EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1',
      pages: [81],
      sourceLocator: { locator: 'reviewed table locator', printedPage: '81' },
      ...(candidateIds === undefined ? {} : { candidateIds }),
    }],
  };
}

function extraction(tables, overrides = {}) {
  return {
    schema: 'DocumentEvidenceTableExtraction.v1',
    sourceHash: SOURCE_HASH,
    source: controlledSource(),
    pages: [81],
    tables,
    diagnostics: [],
    options: { ocr: 'never', ocrLanguage: 'eng' },
    ...overrides,
  };
}

function fetchExtraction(value) {
  return async (url, init) => {
    assert.match(url, /\/v2\/tables\/extract$/u);
    const body = JSON.parse(init.body);
    assert.equal(body.sourceHash, SOURCE_HASH);
    assert.deepEqual(body.pages, [81]);
    return new Response(JSON.stringify(value), { status: 200 });
  };
}

test('accepted extraction becomes CANDIDATE only and never publishes authority', async () => {
  const result = await recoverVibrationStage5cEvidence({
    selectionDocument: selection(['candidate-1']),
    fetchImpl: fetchExtraction(extraction([table()])),
  });
  const receipt = result.decisions[0];
  assert.equal(receipt.evidenceDecision, 'accepted');
  assert.equal(receipt.publicationState, 'CANDIDATE');
  assert.equal(receipt.masterValuesPublished, false);
  assert.deepEqual(receipt.authority, {
    engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false,
  });
  assert.equal(receipt.sourceBinding.gitBlobRuntimeRecomputed, false);
});

test('numeric disagreement remains review_required and is not confidence-resolved', async () => {
  const decision = evidenceDecision('review_required', ['OCR_NUMERIC_DISAGREEMENT']);
  const result = await recoverVibrationStage5cEvidence({
    selectionDocument: selection(['candidate-1']),
    fetchImpl: fetchExtraction(extraction([table('candidate-1', decision)])),
  });
  const receipt = result.decisions[0];
  assert.equal(receipt.evidenceDecision, 'review_required');
  assert.equal(receipt.publicationState, 'BLOCKED');
  assert.deepEqual(receipt.diagnosticCodes, ['OCR_NUMERIC_DISAGREEMENT']);
  assert.equal(Object.hasOwn(receipt, 'effectiveNumericValue'), false);
});

test('missing or ambiguous table candidate fails closed', async () => {
  const missing = await recoverVibrationStage5cEvidence({
    selectionDocument: selection(['missing']),
    fetchImpl: fetchExtraction(extraction([table()])),
  });
  assert.equal(missing.decisions[0].evidenceDecision, 'blocked');
  assert.deepEqual(missing.decisions[0].missingCandidateIds, ['missing']);

  const ambiguous = await recoverVibrationStage5cEvidence({
    selectionDocument: selection(),
    fetchImpl: fetchExtraction(extraction([table('a'), table('b')])),
  });
  assert.equal(ambiguous.decisions[0].evidenceDecision, 'review_required');
  assert.match(ambiguous.decisions[0].diagnosticCodes[0], /MULTIPLE_TABLE_CANDIDATES/u);
});

test('invalid decision semantics are blocked rather than promoted', async () => {
  const invalid = evidenceDecision('accepted', [], { selectedObservationHash: undefined });
  const result = await recoverVibrationStage5cEvidence({
    selectionDocument: selection(['candidate-1']),
    fetchImpl: fetchExtraction(extraction([table('candidate-1', invalid)])),
  });
  assert.equal(result.decisions[0].evidenceDecision, 'blocked');
  assert.ok(result.decisions[0].diagnosticCodes.includes('EVIDENCE_DECISION_SELECTION_REQUIRED'));
});

test('malformed table lineage and effective option drift are hard failures', async () => {
  await assert.rejects(
    recoverVibrationStage5cEvidence({
      selectionDocument: selection(['candidate-1']),
      fetchImpl: fetchExtraction(extraction([table('candidate-1', evidenceDecision(), { tablePass: {} })])),
    }),
    /TABLE_PASS_INVALID/u,
  );
  await assert.rejects(
    recoverVibrationStage5cEvidence({
      selectionDocument: selection(['candidate-1']),
      fetchImpl: fetchExtraction(extraction([table()], { options: { ocr: 'always', ocrLanguage: 'eng' } })),
    }),
    /EXTRACTION_OPTIONS_MISMATCH/u,
  );
});

test('discovery wrapper exposes candidates but does not select pages or publish values', async () => {
  const result = await discoverVibrationStage5cEvidence({
    fetchImpl: async () => new Response(JSON.stringify({
      schema: 'DocumentEvidenceTableDiscovery.v1',
      sourceHash: SOURCE_HASH,
      source: controlledSource(),
      candidates: [{ candidateId: 'candidate-1', page: 81 }],
      diagnostics: [],
    }), { status: 200 }),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.selectionAuthority, 'EXPLICIT_REVIEWER_PAGE_AND_LOCATOR_SELECTION_REQUIRED');
  assert.equal(result.masterValuesPublished, false);
});

test('CLI runner performs real localhost HTTP discovery and writes review JSON', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stage5c-cli-'));
  const output = join(directory, 'discovery.json');
  const server = createServer((request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v2/tables/discover');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      schema: 'DocumentEvidenceTableDiscovery.v1',
      sourceHash: SOURCE_HASH,
      source: controlledSource(),
      candidates: [], diagnostics: [],
    }));
  });
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  const { port } = server.address();
  try {
    await runVibrationStage5cRecovery([
      'discover', '--api', `http://127.0.0.1:${port}`, '--out', output,
    ]);
    const written = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(written.schema, 'VibrationStage5cEvidenceDiscovery.v1');
    assert.equal(written.masterValuesPublished, false);
  } finally {
    await new Promise((resolveClosed) => server.close(resolveClosed));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI extract requires a selection file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stage5c-cli-'));
  const output = join(directory, 'out.json');
  try {
    await assert.rejects(
      runVibrationStage5cRecovery(['extract', '--out', output]),
      /SELECTION_FILE_REQUIRED/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
