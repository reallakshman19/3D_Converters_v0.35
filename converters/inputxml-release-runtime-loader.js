/**
 * Functionality: load the InputXML browser runtime solely from the local verified manifest.
 * Parameters: a Pyodide instance and the manifest URL.
 * Outputs: verified runtime files in /repo and installed pinned Python packages.
 * Fallback: transient same-origin delivery failures are retried; missing, modified,
 * CDN-hosted, or unlisted files still block conversion.
 */
const EXPECTED_SCHEMA = 'InputXmlBrowserRuntimeManifest.v1';
const EXPECTED_PYODIDE_VERSION = '0.27.2';
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([0, 250, 750, 1500, 3000]);
const RETRYABLE_HTTP_STATUS = Object.freeze(new Set([408, 425, 429, 500, 502, 503, 504]));
const MAX_RETRY_AFTER_MS = 5000;
const MAX_ERROR_DETAIL_CHARS = 240;

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function boundedDetail(value) {
  const compact = compactText(value);
  if (!compact) return '';
  return compact.length <= MAX_ERROR_DETAIL_CHARS
    ? compact
    : `${compact.slice(0, MAX_ERROR_DETAIL_CHARS)}…`;
}

async function responseDetail(response) {
  const contentType = compactText(response.headers?.get?.('content-type')).toLowerCase();
  if (contentType.includes('text/html')) return 'HTML service response';
  try {
    return boundedDetail(await response.text());
  } catch {
    return '';
  }
}

function retryAfterMs(response) {
  const raw = compactText(response.headers?.get?.('retry-after'));
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_AFTER_MS, seconds * 1000);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()));
}

function requestFailureMessage({ resourceLabel, resolved, attempts, status = null, detail = '', cause = null }) {
  const attemptText = `${attempts} attempt${attempts === 1 ? '' : 's'}`;
  if (status !== null) {
    return `InputXML runtime ${resourceLabel} failed after ${attemptText}: ${resolved.pathname} HTTP ${status}`
      + (detail ? ` (${detail})` : '') + '.';
  }
  return `InputXML runtime ${resourceLabel} request failed after ${attemptText}: ${resolved.pathname}`
    + (cause ? ` (${boundedDetail(cause?.message || cause)})` : '') + '.';
}

/**
 * Fetch one same-origin runtime resource with bounded recovery for transient
 * transport/service failures. Integrity remains authoritative after delivery.
 */
async function fetchLocalBytes(url, baseUrl, options = {}) {
  const resolved = new URL(url, baseUrl);
  if (resolved.origin !== new URL(baseUrl).origin) {
    throw new Error(`InputXML runtime asset is not same-origin: ${resolved.href}.`);
  }

  const fetchRef = options.fetchRef ?? globalThis.fetch;
  const sleepRef = options.sleepRef ?? wait;
  const delays = Array.isArray(options.retryDelaysMs) && options.retryDelaysMs.length
    ? options.retryDelaysMs.map((value) => Math.max(0, Number(value) || 0))
    : DEFAULT_RETRY_DELAYS_MS;
  const resourceLabel = compactText(options.resourceLabel) || 'asset';
  const firstCacheMode = compactText(options.cacheMode) || 'force-cache';
  let lastCause = null;

  for (let index = 0; index < delays.length; index += 1) {
    if (index > 0) await sleepRef(delays[index]);
    let response;
    try {
      response = await fetchRef(resolved, { cache: index === 0 ? firstCacheMode : 'reload' });
    } catch (error) {
      lastCause = error;
      if (index + 1 < delays.length) continue;
      throw new Error(requestFailureMessage({
        resourceLabel,
        resolved,
        attempts: index + 1,
        cause: lastCause,
      }), { cause: lastCause });
    }

    if (response.ok) {
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        url: resolved.href,
        attempts: index + 1,
      };
    }

    const detail = await responseDetail(response);
    const retryable = RETRYABLE_HTTP_STATUS.has(response.status);
    if (!retryable || index + 1 >= delays.length) {
      throw new Error(requestFailureMessage({
        resourceLabel,
        resolved,
        attempts: index + 1,
        status: response.status,
        detail,
      }));
    }

    const requestedDelay = retryAfterMs(response);
    if (requestedDelay !== null) delays[index + 1] = Math.max(delays[index + 1], requestedDelay);
  }

  throw new Error(requestFailureMessage({
    resourceLabel,
    resolved,
    attempts: delays.length,
    cause: lastCause,
  }));
}

async function validateManifest(manifest) {
  if (manifest?.schema !== EXPECTED_SCHEMA) throw new Error(`Unsupported InputXML runtime schema ${manifest?.schema || 'missing'}.`);
  if (manifest.pyodideVersion !== EXPECTED_PYODIDE_VERSION) throw new Error(`InputXML runtime requires Pyodide ${EXPECTED_PYODIDE_VERSION}.`);
  if (!Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('InputXML runtime manifest has no assets.');
  const copy = { ...manifest };
  const expected = copy.manifestHashSha256;
  delete copy.manifestHashSha256;
  const observed = await sha256Hex(new TextEncoder().encode(stableJson(copy)));
  if (observed !== expected) throw new Error('InputXML runtime manifest hash is invalid.');
}

function writeRuntimeFile(pyodide, target, bytes) {
  const parent = target.slice(0, target.lastIndexOf('/'));
  pyodide.FS.mkdirTree(parent);
  pyodide.FS.writeFile(target, bytes);
}

async function verifiedAssetBytes(asset, manifestUrl) {
  let loaded = await fetchLocalBytes(asset.url, manifestUrl, { cacheMode: 'force-cache' });
  let observed = await sha256Hex(loaded.bytes);
  if (observed !== asset.sha256 || loaded.bytes.length !== asset.bytes) {
    loaded = await fetchLocalBytes(asset.url, manifestUrl, { cacheMode: 'reload' });
    observed = await sha256Hex(loaded.bytes);
  }
  if (observed !== asset.sha256 || loaded.bytes.length !== asset.bytes) {
    throw new Error(`InputXML runtime asset verification failed for ${asset.url}.`);
  }
  return loaded;
}

async function loadAsset(pyodide, asset, manifestUrl) {
  if (!asset?.url || !asset?.sha256 || !asset?.kind) throw new Error('InputXML runtime asset record is incomplete.');
  const loaded = await verifiedAssetBytes(asset, manifestUrl);
  if (asset.kind !== 'python-package') writeRuntimeFile(pyodide, asset.target, loaded.bytes);
  return { ...asset, resolvedUrl: loaded.url, deliveryAttempts: loaded.attempts };
}

function installImportPaths(pyodide) {
  pyodide.runPython(`
import sys
for inputxml_path in ["/repo/converters/scripts", "/repo/scripts", "/repo"]:
    if inputxml_path not in sys.path:
        sys.path.insert(0, inputxml_path)
`);
}

export async function loadVerifiedInputXmlRuntime(pyodide, manifestUrl) {
  const manifestBytes = await fetchLocalBytes(manifestUrl, manifestUrl, {
    cacheMode: 'no-cache',
    resourceLabel: 'manifest',
  });
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes.bytes));
  } catch (error) {
    throw new Error('InputXML runtime manifest is not valid JSON.', { cause: error });
  }
  await validateManifest(manifest);
  const loaded = [];
  for (const asset of manifest.assets) loaded.push(await loadAsset(pyodide, asset, manifestUrl));
  const packages = loaded.filter((asset) => asset.kind === 'python-package');
  await pyodide.loadPackage(packages.map((asset) => asset.resolvedUrl));
  installImportPaths(pyodide);
  return Object.freeze({
    manifest,
    packageCount: packages.length,
    assetCount: loaded.length,
    deliveryAttempts: loaded.reduce((sum, asset) => sum + Number(asset.deliveryAttempts || 1), manifestBytes.attempts),
  });
}

export const _test = Object.freeze({
  DEFAULT_RETRY_DELAYS_MS,
  RETRYABLE_HTTP_STATUS,
  boundedDetail,
  fetchLocalBytes,
  responseDetail,
  retryAfterMs,
});
