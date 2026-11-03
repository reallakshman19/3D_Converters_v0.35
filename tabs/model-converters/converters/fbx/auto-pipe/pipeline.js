import { canonicalJson } from '../canonical-json.js';
import { buildInternalPipeMapping } from './artifact.js';
import { classifySelectedPipes } from './classify.js?v=20260729-fbx2-direct-pipe-1';
import { executeInternalPipeMapping } from './executor.js';

function classificationCounts(classifications) {
  const admittedPipes = classifications.filter((item) => item.admitted).length;
  return Object.freeze({ classifiedOccurrences: classifications.length,
    admittedPipes, rejectedOccurrences: classifications.length - admittedPipes });
}
function blocked(status, classifications, error = null) {
  return Object.freeze({
    status,
    classificationDispositions: classifications,
    internalPipeMapping: null,
    internalPipeMappingJson: null,
    stagedJson: null,
    stagedJsonText: null,
    counts: classificationCounts(classifications),
    error: error ? String(error?.message || error) : null,
  });
}

function failureStatus(error) {
  const text = String(error?.message || error || '');
  const statuses = [
    'BLOCKED_AUTO_PIPE_BINDING',
    'BLOCKED_AUTO_PIPE_SCOPE',
    'BLOCKED_AUTO_PIPE_CLASSIFICATION',
    'BLOCKED_AUTO_PIPE_ROLE_ASSIGNMENT',
    'BLOCKED_AUTO_PIPE_CONNECTIVITY',
    'BLOCKED_AUTO_PIPE_RESOURCE',
    'BLOCKED_AUTO_PIPE_CANCELLED',
  ];
  return statuses.find((status) => text.startsWith(status)) || 'BLOCKED_AUTO_PIPE_EXECUTION';
}

export async function runFbxAutoPipe(input) {
  const classifications = classifySelectedPipes(input);
  const admitted = classifications.filter((item) => item.admitted);
  if (!classifications.length || !admitted.length) {
    return blocked('BLOCKED_AUTO_PIPE_CLASSIFICATION', classifications);
  }
  try {
    const internalPipeMapping = await buildInternalPipeMapping({
      zoneGeometryEvidence: input.zoneGeometryEvidence,
      derivedPortEvidence: input.derivedPortEvidence,
      classifications,
      classificationProfile: input.classificationProfile,
      connectivityProfile: input.connectivityProfile,
    });
    const execution = executeInternalPipeMapping(internalPipeMapping);
    return Object.freeze({
      status: 'STAGEDJSON_PASS',
      classificationStatus: classifications.length === admitted.length
        ? 'PIPE_INFERENCE_PASS' : 'PIPE_INFERENCE_PARTIAL_PASS',
      connectivityStatus: 'PIPE_CONNECTIVITY_PASS',
      classificationDispositions: classifications,
      internalPipeMapping,
      internalPipeMappingJson: canonicalJson(internalPipeMapping),
      stagedJson: execution.stagedJson,
      stagedJsonText: canonicalJson(execution.stagedJson),
      counts: Object.freeze({
        ...classificationCounts(classifications),
        links: internalPipeMapping.links.length,
        branches: execution.stagedJson.length,
      }),
      error: null,
    });
  } catch (error) {
    return blocked(failureStatus(error), classifications, error);
  }
}
