const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

(async () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  // Piping class master rows are out of scope here (still URL-fetched by design) — only fail on
  // an attempt to fetch the weight/material master files. Counting calls (rather than just
  // throwing for everything) catches a fetch attempt even if the code under test happens to
  // swallow the error and fall through to the same end state.
  globalThis.fetch = async (...args) => {
    const url = String(args[0] || '');
    if (/wtValveweights|PCF_MAT_MAP/i.test(url)) {
      fetchCallCount += 1;
      throw new Error(`fetch must not be called for default material/weight master rows (got: ${url})`);
    }
    return { ok: false, status: 404 };
  };

  try {
    // parseXmlCiiEnrichmentConfig applies the shared config defaults (config.js) on top of {},
    // exactly like the real app does — a blank rawConfig alone would not have caught a stray
    // default masterUrl baked into those shared defaults.
    const masterContext = await import(pathToFileURL(path.join(root, 'converters/xml-cii2019-core/master-context.js')).href);

    const diagnostics = [];
    const context = await masterContext.prepareXmlCiiMasterContext({ rawConfig: {}, diagnostics });

    assert.strictEqual(fetchCallCount, 0, 'no fetch() call should be made when no master rows/masterUrl are configured');
    assert(context.weightMasterRows.length > 0, 'weight master rows must be populated from the app default without fetching');
    for (const key of ['bore', 'rating', 'length', 'valveType', 'weight']) {
      assert.notStrictEqual(context.weightMasterRows[0][key], undefined, `default weight rows must expose normalized ${key} alias`);
    }
    assert(context.materialMapRows.length > 0, 'material map rows must be populated from the app default without fetching');
    assert(diagnostics.some((d) => d.type === 'weight-master-source' && d.source === 'app-default'), 'weight master diagnostics must report app-default source');
    assert(diagnostics.some((d) => d.type === 'material-map-source' && d.source === 'app-default'), 'material map diagnostics must report app-default source');
    assert(!diagnostics.some((d) => d.type === 'weight-master-fetch-skip'), 'no weight fetch attempt should have been made');
    assert(!diagnostics.some((d) => d.type === 'material-map-fetch-skip'), 'no material map fetch attempt should have been made');

    // Uploaded/inline rows still take priority over the embedded default.
    const overrideDiagnostics = [];
    const overrideContext = await masterContext.prepareXmlCiiMasterContext({
      rawConfig: { weight: { masterRows: [{ Type: 'CUSTOM', DN: 50 }] }, material: { mapRows: [{ code: '999', material: 'CUSTOM-STEEL' }] } },
      diagnostics: overrideDiagnostics,
    });
    assert.strictEqual(overrideContext.weightMasterRows.length, 1, 'inline/uploaded weight rows must override the app default');
    assert.strictEqual(overrideContext.materialMapRows.length, 1, 'inline/uploaded material rows must override the app default');
    assert(overrideDiagnostics.some((d) => d.type === 'weight-master-source' && d.source === 'inline-config'));
    assert(overrideDiagnostics.some((d) => d.type === 'material-map-source' && d.source === 'inline-config'));

    console.log('XML CII master-context embedded default rows checks passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
