import { AIV_EIT_VERSION, assertAivEitV5Document } from './aiv-eit-contract.js';
import { buildAivEitPipe } from './aiv-eit-geometry.js';
import { buildAivEitSourceDetail } from './aiv-eit-source-detail.js';
import { buildAivEitStream } from './aiv-eit-stream-record.js';

const skey = (sourceId, caseId) => `${sourceId}\u0000${caseId}`;
const rkey = (sourceId, assessmentId, caseId) => `${sourceId}\u0000${assessmentId}\u0000${caseId}`;

function maps(screeningPackage) {
  const result = screeningPackage.result;
  const sources = new Map((screeningPackage.inputs?.sources ?? []).map((x) => [skey(x.sourceCanonicalId, x.caseId), x]));
  const assessments = new Map((screeningPackage.inputs?.assessments ?? []).map((x) => [x.assessmentCanonicalId, x]));
  const relationships = new Map((screeningPackage.inputs?.relationships ?? []).map((x) => [rkey(x.sourceCanonicalId, x.assessmentCanonicalId, x.caseId), x]));
  const sourceResults = new Map((result.sourceResults ?? []).map((x) => [skey(x.sourceCanonicalId, x.caseId), x]));
  const paths = new Map((screeningPackage.flareNetworkEvidence?.pathEvidence ?? []).map((x) => [rkey(x.sourceCanonicalId, x.assessmentCanonicalId, x.caseId), x]));
  const importedDetails = new Map((screeningPackage.eitImportEvidence?.detailEvidence ?? []).map((x) => [x.key, x]));
  return { result, sources, assessments, relationships, sourceResults, paths, importedDetails };
}

function lineRecord(assessmentResult, index, refs) {
  const sourceIds = [...assessmentResult.contributingSourceCanonicalIds].sort();
  const details = sourceIds.map((sourceId) => {
    const sourceKey = skey(sourceId, assessmentResult.caseId);
    const relationshipKey = rkey(sourceId, assessmentResult.assessmentCanonicalId, assessmentResult.caseId);
    const source = refs.sources.get(sourceKey);
    const sourceResult = refs.sourceResults.get(sourceKey);
    if (!source || !sourceResult) throw new Error(`AIV_EIT_SOURCE_RESULT_MISSING: ${sourceKey}`);
    return buildAivEitSourceDetail({
      source,
      sourceResult,
      assessmentResult,
      relationship: refs.relationships.get(relationshipKey),
      pathEvidence: refs.paths.get(relationshipKey),
      importedDetail: refs.importedDetails.get(relationshipKey)?.originalDetail ?? null,
    });
  });
  const trace = (refs.result.lineCaseSummaries ?? []).find((x) => x.caseId === assessmentResult.caseId && x.assessmentCanonicalIds?.includes(assessmentResult.assessmentCanonicalId));
  const importedEvidence = [...refs.importedDetails.values()].find((item) => item.assessmentCanonicalId === assessmentResult.assessmentCanonicalId);
  const importedLine = importedEvidence ? refs.importedOriginal?.lines?.[importedEvidence.lineIndex] : null;
  const pwls = sourceIds.map((id) => refs.sourceResults.get(skey(id, assessmentResult.caseId))?.effectiveSourcePwlDb).filter(Number.isFinite);
  const lof = Number(assessmentResult.lof);
  return {
    rid: String(index + 1), pnid: assessmentResult.caseId,
    lref: assessmentResult.line || assessmentResult.assessmentCanonicalId,
    ldesc: `AIV assessment ${assessmentResult.assessmentCanonicalId}`,
    pi: refs.pipeIds.get(assessmentResult.assessmentCanonicalId),
    si: refs.streamIds.get(skey(sourceIds[0], assessmentResult.caseId)),
    modules: 'aiv', aiv: String(lof), pwl: pwls.length ? String(Math.max(...pwls)) : '',
    aiv_data: JSON.stringify(details), maxLof: String(lof), aivAuthorityScope: 'ASSESSMENT',
    aivAssessmentCanonicalId: assessmentResult.assessmentCanonicalId,
    aivConfiguredLineCaseTraceLof: trace?.lof ?? importedLine?.aivConfiguredLineCaseTraceLof ?? null,
    aivConfiguredLineCaseTraceAuthoritative: false,
  };
}

function moduleSet(line) {
  return String(line?.modules ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sorted(values) {
  return [...values].sort();
}

function sameStrings(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function assertImportedIdentityLock(refs) {
  if (!refs.importedOriginal) return;
  const importedAssessments = new Set([...refs.importedDetails.values()].map((item) => item.assessmentCanonicalId));
  const currentAssessments = new Set((refs.result.assessmentResults ?? []).map((item) => item.assessmentCanonicalId));
  if (!sameStrings(importedAssessments, currentAssessments)) {
    throw new Error('AIV_EIT_ROUND_TRIP_IDENTITY_CHANGED: imported Assessment identities no longer match the current screening result set.');
  }
  for (const assessment of refs.result.assessmentResults ?? []) {
    const importedKeys = [...refs.importedDetails.values()]
      .filter((item) => item.assessmentCanonicalId === assessment.assessmentCanonicalId)
      .map((item) => skey(item.sourceCanonicalId, item.caseId));
    const currentKeys = (assessment.contributingSourceCanonicalIds ?? []).map((sourceId) => skey(sourceId, assessment.caseId));
    if (!sameStrings(importedKeys, currentKeys)) {
      throw new Error(`AIV_EIT_ROUND_TRIP_IDENTITY_CHANGED: imported Source/Case identities changed for ${assessment.assessmentCanonicalId}.`);
    }
  }
}

function evidenceByAssessment(refs) {
  const map = new Map();
  for (const item of refs.importedDetails.values()) {
    if (!map.has(item.assessmentCanonicalId)) map.set(item.assessmentCanonicalId, item);
  }
  return map;
}

function evidenceBySource(refs) {
  return new Map([...refs.importedDetails.values()].map((item) => [skey(item.sourceCanonicalId, item.caseId), item]));
}

function mergePipes(original, freshPipes, refs) {
  const evidence = evidenceByAssessment(refs);
  for (const current of freshPipes) {
    let index = original.findIndex((item) => item.assessmentCanonicalId === current.assessmentCanonicalId);
    if (index < 0) {
      const trace = evidence.get(current.assessmentCanonicalId);
      const originalPi = trace == null ? null : refs.importedOriginal.lines?.[trace.lineIndex]?.pi;
      if (originalPi != null) index = original.findIndex((item) => String(item.pi) === String(originalPi));
    }
    if (index < 0) {
      original.push(current);
      continue;
    }
    const prior = original[index];
    original[index] = { ...prior, ...current, pi: prior.pi ?? current.pi };
  }
}

function mergeStreams(original, freshStreams, refs) {
  const evidence = evidenceBySource(refs);
  for (const current of freshStreams) {
    let index = original.findIndex((item) => item.sourceCanonicalId === current.sourceCanonicalId && item.caseId === current.caseId);
    if (index < 0) {
      const trace = evidence.get(skey(current.sourceCanonicalId, current.caseId));
      const originalSi = trace == null ? null : refs.importedOriginal.lines?.[trace.lineIndex]?.si;
      const lineDetailCount = trace == null
        ? 0
        : [...refs.importedDetails.values()].filter((item) => item.lineIndex === trace.lineIndex).length;
      if (originalSi != null && lineDetailCount === 1) index = original.findIndex((item) => String(item.si) === String(originalSi));
    }
    if (index < 0) {
      original.push(current);
      continue;
    }
    const prior = original[index];
    original[index] = { ...prior, ...current, si: prior.si ?? current.si };
  }
}

function mergeLines(original, freshLines, refs) {
  const byAssessment = evidenceByAssessment(refs);
  for (const current of freshLines) {
    const trace = byAssessment.get(current.aivAssessmentCanonicalId);
    const prior = trace == null ? null : original[trace.lineIndex];
    if (!prior) throw new Error(`AIV_EIT_ROUND_TRIP_IDENTITY_CHANGED: no imported line maps to ${current.aivAssessmentCanonicalId}.`);
    const priorModules = moduleSet(prior);
    const mixedModuleLine = priorModules.some((module) => module !== 'aiv');
    const modules = priorModules.includes('aiv') ? priorModules.join(',') : [...priorModules, 'aiv'].join(',');
    original[trace.lineIndex] = {
      ...prior,
      ...current,
      rid: prior.rid ?? current.rid,
      pnid: prior.pnid ?? current.pnid,
      lref: prior.lref ?? current.lref,
      ldesc: prior.ldesc ?? current.ldesc,
      pi: prior.pi ?? current.pi,
      si: prior.si ?? current.si,
      modules,
      maxLof: mixedModuleLine ? prior.maxLof : current.maxLof,
      ...(mixedModuleLine ? { aivMaxAuthoritativeAssessmentLof: current.aiv } : {}),
    };
  }
}

function mergeIntoImportedDocument(fresh, refs, title) {
  const original = clone(refs.importedOriginal);
  original.options = {
    ...(original.options ?? {}),
    ...fresh.options,
    title: String(title || original.options?.title || ''),
    version: AIV_EIT_VERSION,
  };
  original.lines = Array.isArray(original.lines) ? original.lines : [];
  original.pipes = Array.isArray(original.pipes) ? original.pipes : [];
  original.streams = Array.isArray(original.streams) ? original.streams : [];
  original.mats = Array.isArray(original.mats) ? original.mats : [];
  mergePipes(original.pipes, fresh.pipes, refs);
  mergeStreams(original.streams, fresh.streams, refs);
  mergeLines(original.lines, fresh.lines, refs);
  return assertAivEitV5Document(original);
}

function exportOptions(refs, title, options) {
  const imported = refs.importedOriginal?.options ?? {};
  return {
    title: String(title || imported.title || ''),
    version: AIV_EIT_VERSION,
    id: Number(options.id ?? imported.id ?? 0),
    project: Number(options.project ?? imported.project ?? 0),
    advancedFip: String(options.advancedFip ?? imported.advancedFip ?? '0'),
    debug: String(options.debug ?? imported.debug ?? '0'),
    'ignore-vib': Number(options['ignore-vib'] ?? imported['ignore-vib'] ?? 0),
  };
}

export function buildAivEitV5Document(screeningPackage, title, options = {}) {
  const refs = maps(screeningPackage);
  refs.importedOriginal = screeningPackage.eitImportEvidence?.originalDocument ?? null;
  assertImportedIdentityLock(refs);
  const assessmentIds = [...new Set((refs.result.assessmentResults ?? []).map((x) => x.assessmentCanonicalId))].sort();
  refs.pipeIds = new Map(assessmentIds.map((id, i) => [id, i + 1]));
  const pipes = assessmentIds.map((id) => buildAivEitPipe(refs.assessments.get(id), refs.pipeIds.get(id)));
  const sourceKeys = [...new Set((refs.result.assessmentResults ?? []).flatMap((a) => a.contributingSourceCanonicalIds.map((id) => skey(id, a.caseId))))].sort();
  refs.streamIds = new Map(sourceKeys.map((key, i) => [key, i + 1]));
  const streams = sourceKeys.map((key) => buildAivEitStream(refs.sources.get(key), refs.streamIds.get(key)));
  const lines = (refs.result.assessmentResults ?? []).map((a, i) => lineRecord(a, i, refs));
  const document = {
    options: exportOptions(refs, title, options),
    lines, pipes, streams, mats: [],
  };
  const fresh = assertAivEitV5Document(document);
  return refs.importedOriginal ? mergeIntoImportedDocument(fresh, refs, title) : fresh;
}
