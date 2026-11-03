import { arrayBufferToBase64, decodeTextUtf8 } from '../core/output-utils.js';

const NATIVE_RVM_ENDPOINT_CANDIDATES = Object.freeze([
  'http://localhost:3000/api/native/rvm-to-rev',
  'http://localhost:3001/api/native/rvm-to-rev',
  'http://localhost:3200/api/native/rvm-to-rev',
  'http://127.0.0.1:3000/api/native/rvm-to-rev',
  'http://127.0.0.1:3001/api/native/rvm-to-rev',
  'http://127.0.0.1:3200/api/native/rvm-to-rev',
]);

function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function extractSidecarError(payload, response) {
  const detail = toText(payload?.error || `${response.status} ${response.statusText}`);
  const stderrLines = Array.isArray(payload?.logs?.stderr) ? payload.logs.stderr : [];
  const stderrText = stderrLines.map((line) => toText(line)).join('\n');
  const combined = `${detail}\n${stderrText}`;
  return combined;
}

function isRecoverableSidecarParseError(errorText) {
  const text = toText(errorText).toLowerCase();
  if (!text) return false;
  return text.includes('more end-tags and than new-tags') || text.includes('failed to parse');
}

export async function tryNativeRvmTextMode(primaryFile, primaryBytes, secondaryFile, secondaryBytes, mode, expectedSuffix) {
  const sourceName = toText(primaryFile?.name).toLowerCase();
  if (!sourceName.endsWith('.rvm')) {
    throw new Error(`Unsupported input "${primaryFile?.name || ''}". Native RVM bridge accepts only .rvm files.`);
  }
  const requestBody = {
    inputName: primaryFile.name,
    inputBase64: arrayBufferToBase64(primaryBytes),
    mode: mode,
  };
  if (secondaryFile && secondaryBytes) {
    requestBody.attributesName = secondaryFile.name;
    requestBody.attributesBase64 = arrayBufferToBase64(secondaryBytes);
  }

  let lastDetailedError = '';
  for (const endpoint of NATIVE_RVM_ENDPOINT_CANDIDATES) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch {
      continue;
    }

    if (response.status === 404 || response.status === 405) {
      continue;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail = extractSidecarError(payload, response);
      lastDetailedError = `Native RVM bridge failed (${endpoint}): ${detail}`;
      if (secondaryFile && secondaryBytes && isRecoverableSidecarParseError(detail)) {
        const retryBody = {
          inputName: primaryFile.name,
          inputBase64: arrayBufferToBase64(primaryBytes),
          mode: mode,
        };
        try {
          const retryResponse = await fetch(endpoint, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(retryBody),
          });
          let retryPayload = null;
          try {
            retryPayload = await retryResponse.json();
          } catch {
            retryPayload = null;
          }
          if (retryResponse.ok && retryPayload?.ok && typeof retryPayload.outputText === 'string') {
            const retryStdout = Array.isArray(retryPayload.logs?.stdout) ? retryPayload.logs.stdout : [];
            const retryStderr = Array.isArray(retryPayload.logs?.stderr) ? retryPayload.logs.stderr : [];
            retryStderr.unshift('Recovered from sidecar parse failure by retrying without sidecar file.');
            return {
              outputs: [{
                name: toText(retryPayload.outputName || `${primaryFile.name.replace(/\.[^.]+$/, '')}${expectedSuffix}`),
                text: retryPayload.outputText,
                mime: mode === 'rvm_to_json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
              }],
              logs: {
                stdout: retryStdout,
                stderr: retryStderr,
                argv: Array.isArray(retryPayload.logs?.argv) ? retryPayload.logs.argv : [],
              },
              nativeBridge: true,
              endpoint: endpoint,
            };
          }
        } catch {
          // Continue normal endpoint probing.
        }
      }
      continue;
    }

    if (!payload?.ok || typeof payload.outputText !== 'string') {
      lastDetailedError = `Native RVM bridge returned invalid payload (${endpoint}).`;
      continue;
    }

    return {
      outputs: [{
        name: toText(payload.outputName || `${primaryFile.name.replace(/\.[^.]+$/, '')}${expectedSuffix}`),
        text: payload.outputText,
        mime: mode === 'rvm_to_json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
      }],
      logs: {
        stdout: Array.isArray(payload.logs?.stdout) ? payload.logs.stdout : [],
        stderr: Array.isArray(payload.logs?.stderr) ? payload.logs.stderr : [],
        argv: Array.isArray(payload.logs?.argv) ? payload.logs.argv : [],
      },
      nativeBridge: true,
      endpoint: endpoint,
    };
  }

  if (lastDetailedError) {
    throw new Error(lastDetailedError);
  }
  return null;
}

export async function run(context) {
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) {
    throw new Error('RVM input is required for RVM -> REV conversion.');
  }
  const secondary = context.inputFiles.find(f => f.role === 'secondary');
  const secondaryBytes = secondary ? secondary.bytes : null;

  const response = await tryNativeRvmTextMode(primary, primary.bytes, secondary, secondaryBytes, 'rvm_to_rev', '_rvm_to_rev.rev');
  if (!response) {
    throw new Error(
      'Native RVM bridge is not reachable. Start local server (node test_server.js) so /api/native/rvm-to-rev can run rvmparser-windows-bin.exe.'
    );
  }
  return response;
}
