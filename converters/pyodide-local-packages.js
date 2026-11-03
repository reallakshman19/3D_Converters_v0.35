/**
 * Functionality: resolves local Python wheel URLs used by offline converter workers.
 * Parameters: exported functions expect the vendor/pyodide directory URL as a string or URL.
 * Outputs: absolute wheel URL strings for pyodide.loadPackage().
 * Fallback: none; missing wheel files must fail visibly instead of reaching a package index.
 */
const LOCAL_PYODIDE_WHEEL_FILES = Object.freeze({
  pypdf: 'pypdf-6.14.2-py3-none-any.whl',
});

export function buildLocalPyodideWheelUrls(vendorBaseUrl) {
  const baseUrl = normalizeVendorBaseUrl(vendorBaseUrl);
  return Object.freeze({
    pypdf: new URL(LOCAL_PYODIDE_WHEEL_FILES.pypdf, baseUrl).href,
  });
}

export function getConverterPackageWheelUrls(vendorBaseUrl) {
  const wheelUrls = buildLocalPyodideWheelUrls(vendorBaseUrl);
  return Object.freeze([wheelUrls.pypdf]);
}

function normalizeVendorBaseUrl(vendorBaseUrl) {
  if (vendorBaseUrl instanceof URL) return vendorBaseUrl.href;
  if (typeof vendorBaseUrl !== 'string') {
    throw new TypeError('Pyodide vendor base URL must be a string or URL.');
  }
  const trimmed = vendorBaseUrl.trim();
  if (!trimmed) throw new TypeError('Pyodide vendor base URL is required.');
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}
