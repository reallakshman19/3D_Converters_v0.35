function clockNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

function workerMode() {
  return typeof process !== 'undefined' && process.versions?.node ? 'node-worker' : 'browser-worker';
}

function graphCounts(graph) {
  return {
    sourceObjectCount: graph?.sourceObjects?.length || 0,
    occurrenceCount: graph?.occurrences?.length || 0,
    geometryCount: graph?.geometries?.length || 0,
    warningCount: graph?.warnings?.length || 0,
    unsupportedRecordCount: graph?.unsupportedRecords?.length || 0,
  };
}

export function createWorkerDiagnostics(inputByteLength, now = clockNow) {
  const progressStages = [];
  const stageTimingsMs = {};
  let activeStage = null;
  let activeStartedAt = now();

  function closeActive() {
    if (!activeStage) return;
    const elapsed = Math.max(0, now() - activeStartedAt);
    stageTimingsMs[activeStage] = Math.round(elapsed * 1000) / 1000;
  }

  function markStage(stage) {
    closeActive();
    activeStage = stage;
    activeStartedAt = now();
    progressStages.push(stage);
  }

  function snapshot(terminalCode, graph = null) {
    closeActive();
    activeStage = null;
    return Object.freeze({
      workerMode: workerMode(),
      inputByteLength,
      progressStages: Object.freeze([...progressStages]),
      stageTimingsMs: Object.freeze({ ...stageTimingsMs }),
      workerCreated: true,
      terminalCode,
      ...graphCounts(graph),
    });
  }

  return Object.freeze({ markStage, snapshot });
}
