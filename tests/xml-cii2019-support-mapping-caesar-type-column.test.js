const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

class FakeElement {
  constructor() { this._html = ''; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function caesarCellForRow(html, rowId) {
  const rowMatch = html.match(new RegExp(`<tr data-sm-tr="${rowId}"[\\s\\S]*?<\\/tr>`));
  assert(rowMatch, `row ${rowId} not found`);
  const cellMatch = rowMatch[0].match(/CAESAR II numeric restraint type code[^>]*>([^<]*)</);
  return cellMatch ? cellMatch[1] : null;
}

(async () => {
  const mod = await import(pathToFileURL(path.join(root, 'tabs/model-converters/converters/xmltocii2019_helper/support-mapping-table.js')).href);

  // Regression: a leading "+" sign (e.g. "+Y") must not be mistaken for the "+"
  // used to join multiple xmlTypes together (e.g. "GUI+LIM"). A naive split on
  // "+" would strip the sign and misresolve "+Y" as bare "Y" (code 19 instead
  // of the correct signed code 14).
  const container = new FakeElement();
  mod.renderUnifiedSupportMappingTable(container, {});

  assert.strictEqual(caesarCellForRow(container.innerHTML, 'builtin-user-rest'), '14', '+Y (REST default) must resolve to CAESAR type 14, not 19');
  assert.strictEqual(caesarCellForRow(container.innerHTML, 'builtin-user-limit'), '9', 'LIM (LINESTOP default) must resolve to CAESAR type 9');
  assert.strictEqual(caesarCellForRow(container.innerHTML, 'builtin-user-guide'), '8', 'GUI (GUIDE default) must resolve to CAESAR type 8');

  console.log('XML->CII(2019) support mapping CAESAR type column checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
