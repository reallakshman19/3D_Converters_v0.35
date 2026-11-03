import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discoverDocumentEvidenceTables,
  extractDocumentEvidenceTables,
  normalizeExplicitPages,
} from '../scripts/vibration-stage5c-document-evidence-client.mjs';
import {
  CONTROLLED_EI_SOURCE,
  VIBRATION_STAGE5C_SELECTION_SCHEMA,
  assertControlledEiSource,
  validateStage5cSelection,
  validateStage5cSelectionDocument,
} from '../scripts/vibration-stage5c-targets.mjs';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;

function source(overrides = {}) {
  return {
    schema: 'SourceIdentity.v1',
    sourceId: 'source:fixture',
    sha256: SOURCE_HASH,
    mediaType: 'application/pdf',
    sizeBytes: 123,
    logicalPath: '/Common/controlled.pdf',
    ...overrides,
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('explicit pages are required, unique, positive and sorted', () => {
  assert.deepEqual(normalizeExplicitPages([7, 2]), [2, 7]);
  assert.throws(() => normalizeExplicitPages([]), /EXPLICIT_PAGES_REQUIRED/u);
  assert.throws(() => normalizeExplicitPages([0]), /PAGE_INVALID/u);
  assert.throws(() => normalizeExplicitPages([2, 2]), /PAGE_DUPLICATE/u);
});

test('discovery is advisory and binds SourceIdentity.v1', async () => {
  let request;
  const result = await discoverDocumentEvidenceTables({
    sourcePath: '/Common/controlled.pdf',
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return response({
        schema: 'DocumentEvidenceTableDiscovery.v1',
        sourceHash: SOURCE_HASH,
        source: source(),
        candidates: [{ candidateId: 'c1', page: 2 }],
        diagnostics: [],
      });
    },
  });
  assert.equal(request.url, 'http://127.0.0.1:8765/v2/tables/discover');
  assert.deepEqual(request.body, { sourcePath: '/Common/controlled.pdf' });
  assert.equal(result.source.sha256, SOURCE_HASH);
  assert.equal(result.candidates[0].page, 2);
});

test('extraction sends exact source hash and explicit sorted pages', async () => {
  let request;
  const result = await extractDocumentEvidenceTables({
    sourcePath: '/Common/controlled.pdf',
    sourceHash: SOURCE_HASH,
    pages: [7, 2],
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return response({
        schema: 'DocumentEvidenceTableExtraction.v1',
        sourceHash: SOURCE_HASH,
        source: source(),
        pages: [2, 7],
        tables: [],
        diagnostics: [],
        options: { ocr: 'never', ocrLanguage: 'eng' },
      });
    },
  });
  assert.equal(request.url, 'http://127.0.0.1:8765/v2/tables/extract');
  assert.equal(request.body.sourceHash, SOURCE_HASH);
  assert.deepEqual(request.body.pages, [2, 7]);
  assert.deepEqual(result.pages, [2, 7]);
});

test('source or page drift fails closed', async () => {
  await assert.rejects(
    extractDocumentEvidenceTables({
      sourcePath: '/Common/controlled.pdf', sourceHash: SOURCE_HASH, pages: [2],
      fetchImpl: async () => response({
        schema: 'DocumentEvidenceTableExtraction.v1',
        sourceHash: `sha256:${'b'.repeat(64)}`,
        source: source(), pages: [2], tables: [], diagnostics: [],
        options: { ocr: 'never', ocrLanguage: 'eng' },
      }),
    }),
    /SOURCE_SHA256_MISMATCH/u,
  );
  await assert.rejects(
    extractDocumentEvidenceTables({
      sourcePath: '/Common/controlled.pdf', sourceHash: SOURCE_HASH, pages: [2],
      fetchImpl: async () => response({
        schema: 'DocumentEvidenceTableExtraction.v1',
        sourceHash: SOURCE_HASH, source: source(), pages: [3], tables: [], diagnostics: [],
        options: { ocr: 'never', ocrLanguage: 'eng' },
      }),
    }),
    /PAGE_MISMATCH/u,
  );
});

test('generic evidence authority leakage is rejected', async () => {
  await assert.rejects(
    discoverDocumentEvidenceTables({
      sourcePath: '/Common/controlled.pdf',
      fetchImpl: async () => response({
        schema: 'DocumentEvidenceTableDiscovery.v1',
        sourceHash: SOURCE_HASH, source: source(), candidates: [], diagnostics: [],
        engineeringAuthority: 'SCREENING',
      }),
    }),
    /GENERIC_AUTHORITY_FIELD_FORBIDDEN/u,
  );
});

test('Stage 5C table selection requires semantic target, explicit pages and reviewer locator', () => {
  const selection = validateStage5cSelection({
    masterId: 'EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1',
    pages: [81],
    sourceLocator: { locator: 'reviewed table locator', printedPage: '81' },
    candidateIds: ['candidate-1'],
  });
  assert.equal(selection.masterId, 'EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1');
  assert.deepEqual(selection.pages, [81]);
  assert.equal(selection.sourceLocator.selectionBasis, 'EXPLICIT_REVIEWER_SELECTION');
  assert.throws(
    () => validateStage5cSelection({
      masterId: selection.masterId, pages: [81], sourceLocator: {},
    }),
    /SOURCE_LOCATOR_REQUIRED/u,
  );
});

test('curve and non-table rule targets cannot enter the table evidence path', () => {
  assert.throws(
    () => validateStage5cSelection({
      masterId: 'EI_AVIFF.T3.SBC.FIGURE_T3_1.v1', pages: [82],
      sourceLocator: { locator: 'Figure T3-1' },
    }),
    /CURVE_TARGET_OUT_OF_SCOPE/u,
  );
  assert.throws(
    () => validateStage5cSelection({
      masterId: 'EI_AVIFF.T3.SBC.GEOMETRY_SCORES.v1', pages: [75],
      sourceLocator: { locator: 'Geometry methodology' },
    }),
    /REQUIRES_NON_TABLE_EVIDENCE/u,
  );
});

test('selection document binds source hash and rejects duplicate selection IDs', () => {
  const raw = {
    schema: VIBRATION_STAGE5C_SELECTION_SCHEMA,
    sourceHash: SOURCE_HASH,
    selections: [{
      selectionId: 'span-factor',
      masterId: 'EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1',
      pages: [81], sourceLocator: { locator: 'reviewed table locator' },
    }],
  };
  assert.equal(validateStage5cSelectionDocument(raw).sourceHash, SOURCE_HASH);
  assert.throws(
    () => validateStage5cSelectionDocument({ ...raw, selections: [raw.selections[0], raw.selections[0]] }),
    /SELECTION_DUPLICATE/u,
  );
});

test('controlled EI source path, byte size and reported Git identity are domain-gated', () => {
  const controlled = source({
    logicalPath: CONTROLLED_EI_SOURCE.apiSourcePath,
    sizeBytes: CONTROLLED_EI_SOURCE.sizeBytes,
  });
  assert.equal(assertControlledEiSource(controlled).sizeBytes, 10_348_594);
  assert.throws(
    () => assertControlledEiSource({ ...controlled, sizeBytes: controlled.sizeBytes - 1 }),
    /CONTROLLED_SOURCE_IDENTITY_MISMATCH/u,
  );
  assert.throws(
    () => assertControlledEiSource({
      ...controlled,
      git: {
        repository: CONTROLLED_EI_SOURCE.repository,
        commit: CONTROLLED_EI_SOURCE.commit,
        blobSha1: 'sha1:0000000000000000000000000000000000000000',
      },
    }),
    /CONTROLLED_SOURCE_IDENTITY_MISMATCH/u,
  );
});
