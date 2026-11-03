// Frozen schema version — change only with a contract review
const SCHEMA_VERSION = 'rvm-bundle/v1';

const REQUIRED_ARTIFACT_KEYS = ['glb'];

/**
 * Validate a parsed bundle manifest object.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export function validateBundleManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, reason: 'manifest must be a non-null object' };
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `schemaVersion must be "${SCHEMA_VERSION}", got "${manifest.schemaVersion}"`,
    };
  }
  if (!manifest.bundleId || typeof manifest.bundleId !== 'string') {
    return { ok: false, reason: 'bundleId is required and must be a string' };
  }
  if (!manifest.artifacts || typeof manifest.artifacts !== 'object') {
    return { ok: false, reason: 'artifacts is required and must be an object' };
  }
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    if (!manifest.artifacts[key] || typeof manifest.artifacts[key] !== 'string') {
      return { ok: false, reason: `artifacts.${key} is required and must be a non-empty string` };
    }
  }
  if (!manifest.runtime || typeof manifest.runtime !== 'object') {
    return { ok: false, reason: 'runtime is required and must be an object' };
  }
  return { ok: true };
}

/**
 * Parse and validate a bundle manifest from a JSON string or already-parsed object.
 * Throws with an actionable message on failure.
 */
export function parseBundleManifest(raw) {
  let obj;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Bundle manifest JSON parse error: ${e.message}`);
    }
  } else {
    obj = raw;
  }

  const result = validateBundleManifest(obj);
  if (!result.ok) {
    throw new Error(`Invalid bundle manifest: ${result.reason}`);
  }

  return normalizeBundleManifest(obj);
}

/**
 * Fill in optional fields with safe defaults.
 */
export function normalizeBundleManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    bundleId: manifest.bundleId,
    source: manifest.source || { format: 'RVM', files: [] },
    converter: manifest.converter || {
      name: 'unknown',
      version: null,
      mode: 'static-preconverted',
      warnings: [],
    },
    runtime: {
      units: manifest.runtime?.units || 'mm',
      upAxis: manifest.runtime?.upAxis || 'Y',
      originOffset: manifest.runtime?.originOffset || [0, 0, 0],
      scale: manifest.runtime?.scale ?? 1,
    },
    artifacts: {
      glb: manifest.artifacts.glb,
      index: manifest.artifacts.index || null,
      tags: manifest.artifacts.tags || null,
    },
    coverage: {
      attributes: manifest.coverage?.attributes ?? false,
      tree: manifest.coverage?.tree ?? false,
      supports: manifest.coverage?.supports ?? false,
      reviewTags: manifest.coverage?.reviewTags ?? false,
    },
    modelClass: manifest.modelClass || 'single-bundle',
  };
}
