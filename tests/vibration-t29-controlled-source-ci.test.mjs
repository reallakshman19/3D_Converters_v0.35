import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertExpectedControlledPdf,
  buildVibrationMasterSourceExtractionManifest,
  extractPdfText,
} from '../scripts/extract-vibration-master-source.mjs';
import { locateT29ControlledSource } from '../scripts/locate-vibration-t29-controlled-source.mjs';

const RUN_IN_CI = process.env.GITHUB_ACTIONS === 'true';
const SOURCE = Object.freeze({
  repository: 'reallaksh19/Common',
  commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
  path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
  gitBlobSha1: 'sha1:9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
  sizeBytes: 10348594,
});
const RAW_URL = `https://raw.githubusercontent.com/${SOURCE.repository}/${SOURCE.commit}/${encodeURIComponent(SOURCE.path).replaceAll('%2F', '/')}`;
const REQUEST_PATH = resolve('ValidationRecords/VibrationMasters/t29-pf01-source-extraction-request-v1.json');
const REGISTER_PATH = resolve('docs/Masters/Vibration/source-register.json');

function assertPdftotext() {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') throw new Error('T29_PDFTOTEXT_ENVIRONMENT_BLOCKED');
  if (probe.status !== 0) throw new Error(`T29_PDFTOTEXT_UNAVAILABLE: ${probe.stderr || probe.stdout}`);
}

function publicLocatorEvidence(locator, requestedPages) {
  const selected = new Set(requestedPages);
  return locator.navigationCandidates
    .filter((candidate) => selected.has(candidate.pdfPageNumber))
    .map((candidate) => ({
      pdfPageNumber: candidate.pdfPageNumber,
      textSha256: candidate.textSha256,
      utf8Bytes: candidate.utf8Bytes,
      lineCount: candidate.lineCount,
      tokenCounts: candidate.tokenCounts,
      selectionReason: candidate.selectionReason,
      score: candidate.score,
    }));
}

test('T2.9 exact controlled source can be located and provisionally extracted in trusted CI', {
  skip: !RUN_IN_CI,
  timeout: 120_000,
}, async () => {
  assertPdftotext();
  const response = await fetch(RAW_URL, { redirect: 'follow' });
  assert.equal(response.ok, true, `controlled source download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const identity = assertExpectedControlledPdf(bytes, SOURCE);
  assert.equal(identity.gitBlobSha1, SOURCE.gitBlobSha1);
  assert.equal(identity.sizeBytes, SOURCE.sizeBytes);

  const temp = mkdtempSync(join(tmpdir(), 't29-controlled-source-'));
  try {
    const pdf = join(temp, 'ei-aviff-2e.pdf');
    writeFileSync(pdf, bytes);
    const locator = locateT29ControlledSource(pdf, REGISTER_PATH);
    assert.equal(locator.schema, 'T29ControlledSourceLocator.v1');
    assert.equal(locator.source.gitBlobSha1, SOURCE.gitBlobSha1);
    assert.equal(locator.rankingPolicy.genericPressureRecoveryAloneIsCandidate, false);
    assert.ok(locator.navigationCandidates.length > 0);

    const request = JSON.parse(readFileSync(REQUEST_PATH, 'utf8'));
    const selectedEvidence = publicLocatorEvidence(locator, request.pdfPages);
    assert.equal(selectedEvidence.length, request.pdfPages.length,
      'provisional reviewer page selection is not a ranked T2.9 navigation candidate');
    console.log(`T29_CONTROLLED_LOCATOR_EVIDENCE=${JSON.stringify({
      source: {
        gitBlobSha1: locator.source.gitBlobSha1,
        sizeBytes: locator.source.sizeBytes,
      },
      extraction: locator.extraction,
      selectedEvidence,
      exactMethodSemanticsAuthorized: locator.exactMethodSemanticsAuthorized,
      authority: locator.authority,
    })}`);

    const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));
    const extraction = extractPdfText(pdf);
    const manifest = buildVibrationMasterSourceExtractionManifest(bytes, register, request, extraction);
    assert.equal(manifest.schema, 'VibrationMasterSourceExtraction.v1');
    assert.equal(manifest.masterId, 'EI_AVIFF.T2.9.VALVE_RECOVERY_FACTORS.v1');
    assert.equal(manifest.source.gitBlobSha1, SOURCE.gitBlobSha1);
    assert.deepEqual(manifest.locator.pdfPages, request.pdfPages);
    assert.equal(manifest.authority.masterValuesPublished, false);
    assert.equal(manifest.authority.screeningAuthority, 'NOT_AUTHORIZED');
    console.log(`T29_CONTROLLED_EXTRACTION=${JSON.stringify(manifest)}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
