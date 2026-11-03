/**
 * Functionality: config state with defaults, localStorage persistence,
 * and config-form rendering. Stores rating sequence, corrosion table,
 * type overrides and axis settings.
 * Parameters: explicit. Outputs: config object. No side effects on DOM.
 */

import { DEFAULT_RATING_SEQUENCE } from './sj-rating-resolver.js';
import { DEFAULT_CORROSION_TABLE } from './sj-corrosion-resolver.js';
import { DEFAULT_TYPE_OVERRIDES } from './sj-type-mapper.js';

const STORAGE_KEY = 'sj-enrichxml-config-v1';

/**
 * Default configuration object.
 * @returns {SjConfig}
 */
export function defaultConfig() {
  return {
    ratingSequence: DEFAULT_RATING_SEQUENCE.map(([p, v]) => [String(p), v]),
    corrosionOverrides: {},       // { "SS": 0, "E90B": 1.5 }
    typeOverrides: { ...DEFAULT_TYPE_OVERRIDES },
    psiWriterMode: 'canonical',
    verticalAxis: 'Y',
    defaultFriction: 0.3,
    defaultBoreMm: 100,
  };
}

/**
 * Load config from localStorage; merge with defaults.
 * @returns {SjConfig}
 */
export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const saved = JSON.parse(raw);
    return { ...defaultConfig(), ...saved };
  } catch {
    return defaultConfig();
  }
}

/**
 * Persist config to localStorage.
 * @param {SjConfig} config
 */
export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage quota — ignore
  }
}

/**
 * Render a compact config form into a container element.
 * @param {HTMLElement} container
 * @param {SjConfig} config
 * @param {Function} onChanged  — called with updated config
 */
export function renderConfigForm(container, config, onChanged) {
  container.innerHTML = '';
  container.appendChild(buildWriterSection(config, onChanged));
  container.appendChild(buildRatingSection(config, onChanged));
  container.appendChild(buildCorrosionSection(config, onChanged));
  container.appendChild(buildTypeSection(config, onChanged));
  container.appendChild(buildAxisSection(config, onChanged));
}

function buildWriterSection(config, onChanged) {
  const sec = el('div', 'sj-config-section');
  sec.appendChild(label('PSI XML Writer'));
  const hint = el('div', 'sj-config-hint');
  hint.textContent = 'Sequential preserves exact source /B# blocks and falls back to canonical unless parity is proven.';
  sec.appendChild(hint);
  const sel = document.createElement('select');
  sel.className = 'sj-select';
  [['canonical', 'Canonical owner-grouped (default)'], ['sequential', 'Sequential source-branch (parity gated)']]
    .forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if ((config.psiWriterMode || 'canonical') === value) opt.selected = true;
      sel.appendChild(opt);
    });
  sel.onchange = () => onChanged({ ...config, psiWriterMode: sel.value });
  sec.appendChild(sel);
  return sec;
}

// ─── Config sections ─────────────────────────────────────────────

function buildRatingSection(config, onChanged) {
  const sec = el('div', 'sj-config-section');
  sec.appendChild(label('Rating Prefix → CII Value'));
  const hint = el('div', 'sj-config-hint');
  hint.textContent = 'Matched against piping class (SPRE) prefix. Longest match wins.';
  sec.appendChild(hint);

  const pairs = config.ratingSequence || [];
  pairs.forEach(([prefix, value], idx) => {
    const row = el('div', 'sj-config-row');
    const pfx = input('text', String(prefix), 50);
    const val = input('number', String(value), 70);
    const del = btn('✕', 'sj-btn-del');
    del.onclick = () => {
      const next = pairs.filter((_, i) => i !== idx);
      onChanged({ ...config, ratingSequence: next });
    };
    pfx.oninput = () => {
      const next = [...pairs];
      next[idx] = [pfx.value, Number(val.value)];
      onChanged({ ...config, ratingSequence: next });
    };
    val.oninput = () => {
      const next = [...pairs];
      next[idx] = [pfx.value, Number(val.value)];
      onChanged({ ...config, ratingSequence: next });
    };
    row.append(pfx, val, del);
    sec.appendChild(row);
  });

  const addRow = el('div', 'sj-config-row');
  const newPfx = input('text', '', 50); newPfx.placeholder = 'Prefix';
  const newVal = input('number', '', 70); newVal.placeholder = 'CII #';
  const addBtn = btn('+ Add', 'sj-btn-add');
  addBtn.onclick = () => {
    if (!newPfx.value) return;
    onChanged({ ...config, ratingSequence: [...pairs, [newPfx.value, Number(newVal.value)]] });
  };
  addRow.append(newPfx, newVal, addBtn);
  sec.appendChild(addRow);
  return sec;
}

function buildCorrosionSection(config, onChanged) {
  const sec = el('div', 'sj-config-section');
  sec.appendChild(label('Piping Class → Corrosion (mm)'));
  const overrides = config.corrosionOverrides || {};
  Object.entries(overrides).forEach(([key, val]) => {
    const row = el('div', 'sj-config-row');
    const kEl = el('span', 'sj-config-key'); kEl.textContent = key;
    const vEl = input('number', String(val), 70);
    vEl.oninput = () => onChanged({ ...config, corrosionOverrides: { ...overrides, [key]: Number(vEl.value) } });
    const del = btn('✕', 'sj-btn-del');
    del.onclick = () => {
      const next = { ...overrides }; delete next[key];
      onChanged({ ...config, corrosionOverrides: next });
    };
    row.append(kEl, vEl, del);
    sec.appendChild(row);
  });
  const addRow = el('div', 'sj-config-row');
  const newKey = input('text', '', 80); newKey.placeholder = 'Class prefix';
  const newVal = input('number', '1.5', 60);
  const addBtn = btn('+ Add', 'sj-btn-add');
  addBtn.onclick = () => {
    if (!newKey.value) return;
    onChanged({ ...config, corrosionOverrides: { ...overrides, [newKey.value]: Number(newVal.value) } });
  };
  addRow.append(newKey, newVal, addBtn);
  sec.appendChild(addRow);
  return sec;
}

function buildTypeSection(config, onChanged) {
  const sec = el('div', 'sj-config-section');
  sec.appendChild(label('Type Overrides (RAW_TYPE → ComponentType)'));
  const overrides = config.typeOverrides || {};
  Object.entries(overrides).forEach(([from, to]) => {
    const row = el('div', 'sj-config-row');
    const kEl = el('span', 'sj-config-key'); kEl.textContent = from;
    const vEl = input('text', to, 70);
    vEl.oninput = () => onChanged({ ...config, typeOverrides: { ...overrides, [from]: vEl.value.toUpperCase() } });
    row.append(kEl, el('span', '', ' → '), vEl);
    sec.appendChild(row);
  });
  return sec;
}

function buildAxisSection(config, onChanged) {
  const sec = el('div', 'sj-config-section');
  sec.appendChild(label('Vertical Axis'));
  const sel = document.createElement('select');
  sel.className = 'sj-select';
  ['Y', 'Z'].forEach(axis => {
    const opt = document.createElement('option');
    opt.value = axis; opt.textContent = axis;
    if (config.verticalAxis === axis) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => onChanged({ ...config, verticalAxis: sel.value });
  sec.appendChild(sel);
  return sec;
}

// ─── DOM helpers ─────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function label(text) { return el('div', 'sj-config-label', text); }

function input(type, value, width) {
  const inp = document.createElement('input');
  inp.type = type; inp.value = value;
  inp.style.width = width + 'px';
  inp.className = 'sj-input';
  return inp;
}

function btn(text, cls) {
  const b = document.createElement('button');
  b.textContent = text; b.className = cls; b.type = 'button';
  return b;
}
