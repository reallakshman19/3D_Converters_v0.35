import assert from 'node:assert/strict';
import test from 'node:test';

function configInput(config) {
  return {
    value: JSON.stringify(config, null, 2),
    dispatchEvent() {},
  };
}

function installBrowserStubs(input, fetchImpl) {
  const original = {
    document: globalThis.document,
    location: globalThis.location,
    fetch: globalThis.fetch,
    window: globalThis.window,
    DOMParser: globalThis.DOMParser,
  };
  delete globalThis.window;
  delete globalThis.DOMParser;
  globalThis.location = {
    pathname: '/3D_Viewer/',
    hostname: 'localhost',
    origin: 'http://localhost',
  };
  globalThis.document = {
    querySelector(selector) {
      if (selector === '[data-option-key="supportConfigJson"]') return input;
      if (selector === '#model-converters-primary-input') return { files: [] };
      return null;
    },
    addEventListener() {},
  };
  globalThis.fetch = fetchImpl;
  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

test('hydrates an exact missing class and caches an unmatched class attempt', async () => {
  const input = configInput({
    rating: { pipingClassTokenIndex: 5, tokenDelimiter: '-' },
    linelist: {
      masterRows: [{ lineKey: 'S8810105', pipingClass: '13421' }],
    },
    pipingClass: {
      masterRows: [{ pipingClass: '13421', convertedBore: '100', rating: '150' }],
    },
    overrides: {
      pipingClass: {
        '13421': '93834',
        UNKNOWN: '99999',
      },
    },
  });

  const calls = [];
  const restore = installBrowserStubs(input, async (url) => {
    calls.push(String(url));
    if (String(url).includes('index.json')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            classes: {
              '93834': { file: '93834.json', matchTokens: ['93834'] },
            },
          });
        },
      };
    }
    if (String(url).includes('93834.json')) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([
            {
              'Piping Class': '93834',
              'Converted Bore': '100',
              Rating: '900',
              'Wall thickness': '6.0198',
            },
          ]);
        },
      };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  });

  try {
    const module = await import(`../tabs/xml-cii-effective-class-shard-hydrator.js?test=${Date.now()}`);
    const xmlText = '<Model><Branch><Branchname>/AREA-SERVICE-X-S8810105-13421-TAIL/B1</Branchname></Branch></Model>';
    const first = await module.hydrateXmlCiiEffectivePipingClassShards({ input, xmlText });
    assert.deepEqual(first.loadedClasses, ['93834']);
    assert.deepEqual(first.unmatched.map((item) => item.normalized), ['99999']);

    const saved = JSON.parse(input.value);
    assert.deepEqual(
      [...new Set(saved.pipingClass.masterRows.map((row) => row.pipingClass))].sort(),
      ['13421', '93834'],
    );
    assert.deepEqual(saved.pipingClass._unmatchedEffectiveClasses, ['99999']);
    assert.ok(saved.pipingClass._effectiveHydrationAttemptSignature);

    const callCount = calls.length;
    const second = await module.hydrateXmlCiiEffectivePipingClassShards({ input, xmlText });
    assert.equal(second.reason, 'attempt-already-recorded');
    assert.equal(calls.length, callCount);
  } finally {
    restore();
  }
});

test('preserves the on-demand placeholder when no exact shard exists', async () => {
  const placeholder = { _smartMasterPlaceholder: true, pipingClass: '__ON_DEMAND__' };
  const input = configInput({
    pipingClass: { masterRows: [placeholder] },
    overrides: { pipingClass: { UNKNOWN: '99999' } },
  });

  const restore = installBrowserStubs(input, async (url) => {
    if (String(url).includes('index.json')) {
      return { ok: true, async text() { return JSON.stringify({ classes: {} }); } };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  });

  try {
    const module = await import(`../tabs/xml-cii-effective-class-shard-hydrator.js?placeholder=${Date.now()}`);
    await module.hydrateXmlCiiEffectivePipingClassShards({ input, xmlText: '' });
    const saved = JSON.parse(input.value);
    assert.equal(saved.pipingClass.masterRows.length, 1);
    assert.equal(saved.pipingClass.masterRows[0]._smartMasterPlaceholder, true);
    assert.deepEqual(saved.pipingClass._unmatchedEffectiveClasses, ['99999']);
  } finally {
    restore();
  }
});
