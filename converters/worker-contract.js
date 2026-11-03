function _isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function buildConverterWorkerRequest(jobId, converterId, inputFiles, options) {
  return {
    type: 'run',
    jobId,
    converterId,
    inputFiles,
    options,
  };
}

export function buildConverterWorkerResponse(jobId, ok, outputs, logs, error) {
  const payload = { jobId, ok: !!ok };
  if (ok) {
    payload.outputs = Array.isArray(outputs) ? outputs : [];
    payload.logs = _isPlainObject(logs) ? logs : {};
  } else {
    payload.error = String(error || 'Unknown converter worker error.');
  }
  return payload;
}

export function validateConverterWorkerRequest(payload) {
  if (!_isPlainObject(payload)) {
    return { ok: false, error: 'Request payload must be an object.' };
  }
  if (payload.type !== 'run') {
    return { ok: false, error: 'Request payload type must be "run".' };
  }
  if (!String(payload.converterId || '').trim()) {
    return { ok: false, error: 'Request converterId is required.' };
  }
  if (!Array.isArray(payload.inputFiles)) {
    return { ok: false, error: 'Request inputFiles must be an array.' };
  }
  const primary = payload.inputFiles.find((entry) => entry?.role === 'primary');
  if (!primary) {
    return { ok: false, error: 'Request must include a primary input file.' };
  }
  if (!String(primary.name || '').trim()) {
    return { ok: false, error: 'Primary input file name is required.' };
  }
  if (!(primary.bytes instanceof ArrayBuffer)) {
    return { ok: false, error: 'Primary input file bytes must be an ArrayBuffer.' };
  }
  return { ok: true };
}

export function validateConverterWorkerResponse(payload) {
  if (!_isPlainObject(payload)) {
    return { ok: false, error: 'Response payload must be an object.' };
  }
  if (typeof payload.ok !== 'boolean') {
    return { ok: false, error: 'Response "ok" flag must be boolean.' };
  }
  if (payload.ok) {
    if (!Array.isArray(payload.outputs)) {
      return { ok: false, error: 'Successful response outputs must be an array.' };
    }
    for (const output of payload.outputs) {
      if (!_isPlainObject(output)) {
        return { ok: false, error: 'Output entries must be objects.' };
      }
      if (!String(output.name || '').trim()) {
        return { ok: false, error: 'Output name is required.' };
      }
      if (typeof output.text !== 'string') {
        return { ok: false, error: 'Output text must be a string.' };
      }
    }
  } else if (!String(payload.error || '').trim()) {
    return { ok: false, error: 'Failed response must include an error message.' };
  }
  return { ok: true };
}
