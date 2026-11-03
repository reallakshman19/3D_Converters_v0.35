export function downloadOutput(output) {
  let blob;
  if (typeof output.base64 === 'string' && output.base64.length > 0) {
    const binary = atob(output.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: output.mime || 'application/octet-stream' });
  } else {
    // Use octet-stream for non-.txt/.csv extensions (e.g. .pcf, .cii, .xml)
    // so Chrome honours the exact filename in anchor.download without renaming it.
    const ext = String(output.name || '').split('.').pop().toLowerCase();
    const inferredMime = (ext === 'txt' || ext === 'csv')
      ? 'text/plain;charset=utf-8'
      : 'application/octet-stream';
    blob = new Blob([output.text], { type: output.mime || inferredMime });
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = output.name || 'conversion-output.txt';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function baseNameWithoutExtension(name) {
  const normalized = (name === null || name === undefined ? '' : String(name)).trim();
  if (!normalized) return 'converted';
  return normalized.replace(/\.[^.]+$/, '');
}

export function isRvmFileName(name) {
  const normalized = (name === null || name === undefined ? '' : String(name));
  return normalized.toLowerCase().endsWith('.rvm');
}

export function isAttOrTxtFileName(name) {
  const normalized = (name === null || name === undefined ? '' : String(name)).toLowerCase();
  return normalized.endsWith('.att') || normalized.endsWith('.txt');
}

export function encodeTextUtf8(text) {
  const normalized = (text === null || text === undefined ? '' : String(text));
  return new TextEncoder().encode(normalized).buffer;
}

export function decodeTextUtf8(bytes) {
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

export function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}
