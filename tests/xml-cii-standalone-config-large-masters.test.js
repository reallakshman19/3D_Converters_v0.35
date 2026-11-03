const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const { installMiniDom } = require('./helpers/mini-dom.js');
installMiniDom();

function bigRows(n, prefix) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, value: i }));
}

(async () => {
  const ui = await import(pathToFileURL(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-config.js')).href);

  const config = {
    useFrictionSentinelForNonYSupports: true,
    weight: { masterUrl: '', masterRows: bigRows(1595, 'w') },
    material: { masterUrl: '', mapRows: bigRows(383, 'm') },
  };
  const state = { supportConfigJson: JSON.stringify(config) };
  const stateRef = { current: state };
  const card = new (require('./helpers/mini-dom.js').MiniElement)('section');

  ui.renderAdaptedConfigPanel(card, stateRef, () => {});

  const textarea = card.querySelector('textarea');
  assert(textarea, 'raw JSON editor textarea must be present');
  assert(textarea.value.length < 5000, `raw JSON editor textarea must summarize large master row arrays, not inline ${textarea.value.length} chars of them`);
  assert(textarea.value.includes('"__rowsOmittedFromEditor": 1595'), 'textarea must show an omitted-rows placeholder for the weight master rows');
  assert(textarea.value.includes('"__rowsOmittedFromEditor": 383'), 'textarea must show an omitted-rows placeholder for the material map rows');

  // Saving must not lose the omitted rows — the full data must round-trip into state.
  globalThis.alert = () => {};
  const saveBtn = [...card.querySelectorAll('button')].find((b) => b.textContent.includes('Save Config'));
  assert(saveBtn, 'Save Config button must be present');
  saveBtn.click();

  const savedConfig = JSON.parse(stateRef.current.supportConfigJson);
  assert.strictEqual(savedConfig.weight.masterRows.length, 1595, 'saved config must retain all weight master rows, not the placeholder');
  assert.strictEqual(savedConfig.material.mapRows.length, 383, 'saved config must retain all material map rows, not the placeholder');

  console.log('XML CII standalone Config panel large-masters checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
