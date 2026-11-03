/**
 * Adapter Mapping Settings Tab
 *
 * Provides a live UI for editing the adapter-mapping.json configuration
 * that controls how each source format (ATT, PSI, REV, PCF) maps its
 * native fields to canonical XML layer fields used by the 3D renderer.
 */
import { state, saveStickyState } from '../core/state.js';

const DEFAULT_MAPPING_URL = './converters/universal/settings/adapter-mapping.json';
const LS_KEY = 'pcfglb_adapter_mapping_v1';
const DEFAULT_ROUTING_METHOD = 'topology_legacy';
const ROUTING_METHOD_OPTIONS = [
  { value: 'topology_strict', label: 'Topology Strict' },
  { value: 'topology_legacy', label: 'Topology Legacy (LPOS->APOS)' },
  { value: 'topology_ray', label: 'Topology Ray (Vector)' },
];

// ── State ──────────────────────────────────────────────────────────────────

let _mapping = null;    // Live object being edited
let _original = null;   // Server-loaded copy for dirty detection
let _activeFormat = 'att';

const FORMAT_LABELS = {
  att: { label: 'ATT TXT', color: '#4a9eff', icon: '📄', desc: 'AVEVA PDMS/E3D RMSS_ATTRIBUTE.TXT attribute export' },
  psi: { label: 'PSI XML', color: '#6fcf97', icon: '🔩', desc: 'Pipe Stress Inc. XML stress model' },
  rev: { label: 'REV',     color: '#e2994a', icon: '🔁', desc: 'RVM-derived native REV text format' },
  pcf: { label: 'PCF',     color: '#bb6bd9', icon: '📐', desc: 'Piping Component File (Isogen / CADWorx)' },
};

const BORE_FIELD_HELP = {
  HBOR: 'Head/Inlet bore diameter (mm)',
  TBOR: 'Tail/Outlet bore diameter (mm)',
  ABORE: 'Arriving bore diameter (mm)',
  LBORE: 'Leaving bore diameter (mm)',
  DTXR: 'Design outer diameter (used as bore fallback)',
};

// ── Loader ─────────────────────────────────────────────────────────────────

async function _loadMapping() {
  // Prefer localStorage override (user customised)
  const stored = localStorage.getItem(LS_KEY);
  if (stored) {
    try { _original = JSON.parse(stored); _mapping = JSON.parse(stored); return; } catch {}
  }
  try {
    const res = await fetch(DEFAULT_MAPPING_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _original = JSON.parse(JSON.stringify(json));
    _mapping = JSON.parse(JSON.stringify(json));
  } catch (err) {
    console.warn('[AdapterMappingTab] Could not load mapping file, using defaults:', err);
    _original = _buildDefaultMapping();
    _mapping  = JSON.parse(JSON.stringify(_original));
  }
}

function _buildDefaultMapping() {
  return {
    att: {
      fieldMap: { DTXR: 'description', PSPE: 'spec', ABORE: 'bore', LBORE: 'boreLeaving', APOS: 'posStart', LPOS: 'posEnd', POS: 'posCenter', ANGL: 'angle', HBOR: 'boreHead', TBOR: 'boreTail', TEMP: 'temperature', PRES: 'pressure', MTXX: 'material', SPRE: 'catref', OWNER: 'ownerPath', CREF: 'branchRef', STEX: 'supportName' },
      typeMap: { ELBO: 'ELBOW', FLAN: 'FLANGE', GASK: 'GASKET', VALV: 'VALVE', INST: 'MISC', ATTA: 'MISC', REDU: 'REDU', BRAN: 'BRANCH', PIPE: 'PIPE', TUBE: 'PIPE', OLET: 'OLET', TEE: 'TEE' },
      miscPreserveOriginal: true
    },
    psi: {
      fieldMap: { ComponentType: 'type', Position: 'posCenter', BendRadius: 'bendRadius', OutsideDiameter: 'outsideDiameter', WallThickness: 'wallThickness', SIF: 'sif', NodeName: 'name', ComponentRefNo: 'ref' },
      typeMap: { RIGID: 'RIGID', BEND: 'ELBOW', REDU: 'REDU', PCOM: 'PIPE', ATTA: 'MISC', VALV: 'VALVE' },
      miscPreserveOriginal: true
    },
    rev: {
      typeKeywords: { ELBOW: 'ELBOW', TEE: 'TEE', VALVE: 'VALVE', FLANGE: 'FLANGE', GASKET: 'GASKET', INSTRUMENT: 'MISC', ATTA: 'MISC' },
      miscPreserveOriginal: true
    },
    pcf: {
      fieldMap: { 'PIPELINE-REFERENCE': 'spec', 'NOMINAL-BORE': 'bore', SKEY: 'type', GUID: 'supportName' },
      typeMap: { ELBOW: 'ELBOW', TEE: 'TEE', VALVE: 'VALVE', FLANGE: 'FLANGE', OLET: 'OLET' },
      miscPreserveOriginal: true
    },
    mergePriority: ['PSI_XML', 'PCF', 'ATT_TXT', 'REV', 'JSON']
  };
}

function _normalizeRoutingMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  const valid = ROUTING_METHOD_OPTIONS.some((opt) => opt.value === method);
  return valid ? method : DEFAULT_ROUTING_METHOD;
}

function _getRoutingSettingsState() {
  const routing = state?.rvm?.routing || {};
  return {
    topologyMethod: _normalizeRoutingMethod(routing.topologyMethod),
    routeThroughInstEnabled: routing.routeThroughInstEnabled === true,
  };
}

function _persistRoutingSettings(container) {
  const methodEl = container.querySelector('#amp-routing-method');
  const instEl = container.querySelector('#amp-route-inst');
  if (!methodEl || !instEl || !state?.rvm) return;
  state.rvm.routing = {
    topologyMethod: _normalizeRoutingMethod(methodEl.value),
    routeThroughInstEnabled: instEl.checked === true,
  };
  saveStickyState();
}

// ── HTML builders ──────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// All known canonical fields (fixed vocabulary)
const CANONICAL_FIELDS = [
  '', // blank = unset
  'type', 'name', 'description', 'spec', 'ref',
  'bore', 'boreLeaving', 'boreHead', 'boreTail',
  'posStart', 'posEnd', 'posCenter',
  'angle', 'bendRadius', 'outsideDiameter', 'wallThickness',
  'temperature', 'pressure', 'material', 'catref',
  'ownerPath', 'branchRef',
  'supportName', 'supportType', 'supportSubType',
  'sif', 'rigidity', 'nodeId',
  'guid', 'tag', 'weight', 'nps',
];

function _canonicalSelect(selected) {
  const opts = CANONICAL_FIELDS.map(f =>
    `<option value="${_esc(f)}" ${f === selected ? 'selected' : ''}>${_esc(f) || '— unset —'}</option>`
  ).join('');
  return `<select class="amp-input amp-select" data-role="fm-val">${opts}</select>`;
}

const CANONICAL_TYPES = [
  'PIPE', 'ELBOW', 'TEE', 'FLANGE', 'GASKET', 'VALVE', 'REDU', 'OLET', 'BRANCH', 'RIGID', 'MISC', 'INSTRUMENT', 'SUPPORT', 'WELD'
];

function _canonicalTypeSelect(selected, role) {
  let opts = CANONICAL_TYPES.map(t =>
    `<option value="${_esc(t)}" ${t === selected ? 'selected' : ''}>${_esc(t)}</option>`
  ).join('');
  // Allow fallback to empty/custom if needed, but select will enforce list in UI
  if (selected && !CANONICAL_TYPES.includes(selected)) {
    opts += `<option value="${_esc(selected)}" selected>${_esc(selected)} (Custom)</option>`;
  }
  return `<select class="amp-input amp-select" data-role="${role}">${opts}</select>`;
}

function _buildFormatSidebar() {
  return Object.entries(FORMAT_LABELS).map(([key, meta]) => `
    <button class="amp-format-btn ${_activeFormat === key ? 'is-active' : ''}" data-format="${key}"
            style="border-left: 4px solid ${meta.color};">
      <span class="amp-format-icon">${meta.icon}</span>
      <span class="amp-format-label">${meta.label}</span>
    </button>
  `).join('');
}

function _buildFieldMapTable(formatKey) {
  const fmt = _mapping[formatKey] || {};
  const fieldMap = fmt.fieldMap || {};
  const isRev = formatKey === 'rev';

  if (isRev) {
    // REV uses typeKeywords instead
    const tk = fmt.typeKeywords || {};
    return `
      <div class="amp-section-head">Type Keyword Detection</div>
      <p class="amp-hint">REV format detects component type by scanning the component name for these keywords.</p>
      <table class="amp-table">
        <thead><tr><th>Keyword in name</th><th>→ Canonical Type</th><th></th></tr></thead>
        <tbody id="amp-typekw-body">
          ${Object.entries(tk).map(([k,v]) => `
            <tr data-key="${_esc(k)}">
              <td><input class="amp-input" data-role="kw-key" value="${_esc(k)}"></td>
              <td>${_canonicalTypeSelect(v, 'kw-val')}</td>
              <td><button class="amp-del-btn" data-action="del-kw" data-key="${_esc(k)}" title="Remove">✕</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <button class="amp-add-btn" data-action="add-kw">+ Add Keyword</button>
    `;
  }

  return `
    <div class="amp-section-head">Field Map
      <span class="amp-hint-inline">(source field → canonical name)</span>
    </div>
    <table class="amp-table">
      <thead><tr><th>Source Field</th><th>→ Canonical Field</th><th>ℹ</th><th></th></tr></thead>
      <tbody id="amp-fieldmap-body">
        ${Object.entries(fieldMap).map(([k,v]) => `
          <tr data-key="${_esc(k)}">
            <td><input class="amp-input" data-role="fm-key" value="${_esc(k)}"></td>
            <td>${_canonicalSelect(v)}</td>
            <td class="amp-hint-cell">${_esc(BORE_FIELD_HELP[k] || '')}</td>
            <td><button class="amp-del-btn" data-action="del-fm" data-key="${_esc(k)}" title="Remove">✕</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
    <button class="amp-add-btn" data-action="add-fm">+ Add Field Mapping</button>
  `;
}

function _buildTypeMapTable(formatKey) {
  const fmt = _mapping[formatKey] || {};
  if (formatKey === 'rev') return '';  // rev uses typeKeywords panel
  const typeMap = fmt.typeMap || {};
  return `
    <div class="amp-section-head">Type Map
      <span class="amp-hint-inline">(source type code → canonical component class)</span>
    </div>
    <table class="amp-table">
      <thead><tr><th>Source Type</th><th>→ Canonical Type</th><th></th></tr></thead>
      <tbody id="amp-typemap-body">
        ${Object.entries(typeMap).map(([k,v]) => `
          <tr data-key="${_esc(k)}">
            <td><input class="amp-input" data-role="tm-key" value="${_esc(k)}"></td>
            <td>${_canonicalTypeSelect(v, 'tm-val')}</td>
            <td><button class="amp-del-btn" data-action="del-tm" data-key="${_esc(k)}" title="Remove">✕</button></td>
          </tr>`).join('')}      </tbody>
    </table>
    <button class="amp-add-btn" data-action="add-tm">+ Add Type Mapping</button>
  `;
}

function _buildBoreHelp() {
  return `
    <div class="amp-section-head">Bore Field Reference</div>
    <table class="amp-table amp-bore-table">
      <thead><tr><th>Field</th><th>Description</th><th>Priority</th></tr></thead>
      <tbody>
        ${Object.entries(BORE_FIELD_HELP).map(([k, desc], i) => `
          <tr><td><code>${_esc(k)}</code></td><td>${_esc(desc)}</td><td>${i + 1}</td></tr>
        `).join('')}
      </tbody>
    </table>
    <p class="amp-hint">The 3D renderer will try these fields in priority order to determine the pipe radius. 
    Auto-generated PIPE segments inherit bore from the nearest fitting or parent branch.</p>
  `;
}

function _buildMergePriority() {
  const mp = Array.isArray(_mapping.mergePriority) ? _mapping.mergePriority : [];
  return `
    <div class="amp-section-head">Merge Priority
      <span class="amp-hint-inline">(highest first wins conflicting fields)</span>
    </div>
    <div class="amp-priority-list" id="amp-priority-list">
      ${mp.map((item, i) => `
        <div class="amp-priority-item" data-index="${i}">
          <span class="amp-priority-rank">${i + 1}</span>
          <span class="amp-priority-name">${_esc(item)}</span>
          <div class="amp-priority-arrows">
            ${i > 0 ? `<button class="amp-arr-btn" data-action="priority-up" data-index="${i}" title="Move up">▲</button>` : '<span></span>'}
            ${i < mp.length - 1 ? `<button class="amp-arr-btn" data-action="priority-down" data-index="${i}" title="Move down">▼</button>` : '<span></span>'}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _buildRoutingSettings() {
  const routing = _getRoutingSettingsState();
  const methodOptions = ROUTING_METHOD_OPTIONS.map((option) => (
    `<option value="${_esc(option.value)}" ${option.value === routing.topologyMethod ? 'selected' : ''}>${_esc(option.label)}</option>`
  )).join('');
  return `
    <div class="amp-section-head">RVM Auto-Pipe Routing</div>
    <div class="amp-routing-panel">
      <label class="amp-routing-label" for="amp-routing-method">Topology method</label>
      <select id="amp-routing-method" class="amp-input amp-select">
        ${methodOptions}
      </select>
      <label class="amp-routing-check">
        <input type="checkbox" id="amp-route-inst" ${routing.routeThroughInstEnabled ? 'checked' : ''}>
        Include INST in routing (requires valid APOS + LPOS + inline metadata)
      </label>
      <div class="amp-hint">No fallback chain is applied. The selected method is the only method used.</div>
    </div>
  `;
}

function _buildTabContent() {
  const meta = FORMAT_LABELS[_activeFormat];
  const fmt = _mapping[_activeFormat] || {};
  const dirty = JSON.stringify(_mapping) !== JSON.stringify(_original);
  return `
    <div class="amp-content-header" style="border-left: 4px solid ${meta.color};">
      <span class="amp-content-icon">${meta.icon}</span>
      <div>
        <div class="amp-content-title">${meta.label} Adapter</div>
        <div class="amp-content-desc">${meta.desc}</div>
      </div>
    </div>
    ${_buildFieldMapTable(_activeFormat)}
    ${_buildTypeMapTable(_activeFormat)}
    ${_buildBoreHelp()}
    <div class="amp-misc-row">
      <label><input type="checkbox" id="amp-misc-preserve" ${fmt.miscPreserveOriginal ? 'checked' : ''}> Preserve original type on MISC fallback</label>
    </div>
  `;
}

function _buildFullHTML() {
  const dirty = JSON.stringify(_mapping) !== JSON.stringify(_original);
  return `
<div class="amp-root">
  <div class="amp-sidebar">
    <div class="amp-sidebar-title">Adapter Mapping</div>
    <div class="amp-sidebar-desc">Configure per-format field and type mapping used when converting source files to the canonical XML layer.</div>
    <div class="amp-format-list">${_buildFormatSidebar()}</div>
    <div class="amp-global-section">
      ${_buildRoutingSettings()}
      ${_buildMergePriority()}
    </div>
  </div>
  <div class="amp-main">
    <div class="amp-toolbar">
      <button class="amp-toolbar-btn amp-btn-save" data-action="save" ${!dirty ? 'disabled' : ''}>
        💾 Save Changes ${dirty ? '<span class="amp-dirty-dot">●</span>' : ''}
      </button>
      <button class="amp-toolbar-btn" data-action="reset-format">↺ Reset Format</button>
      <button class="amp-toolbar-btn" data-action="export">⬇ Export JSON</button>
      <label class="amp-toolbar-btn">⬆ Import JSON
        <input type="file" accept=".json" data-action="import" style="display:none">
      </label>
      <span class="amp-toolbar-status">${dirty ? '<span style="color:#e2994a">Unsaved changes</span>' : '<span style="color:#6fcf97">Saved</span>'}</span>
    </div>
    <div class="amp-panel" id="amp-panel">
      ${_buildTabContent()}
    </div>
  </div>
</div>`;
}

// ── Event handling ─────────────────────────────────────────────────────────

function _readCurrentFormatFromUI(container) {
  const fmt = _mapping[_activeFormat] || {};
  const isRev = _activeFormat === 'rev';

  if (isRev) {
    const tk = {};
    container.querySelectorAll('#amp-typekw-body tr').forEach(row => {
      const k = row.querySelector('[data-role="kw-key"]')?.value?.trim();
      const v = row.querySelector('[data-role="kw-val"]')?.value?.trim();
      if (k) tk[k] = v || '';
    });
    fmt.typeKeywords = tk;
  } else {
    const fm = {};
    container.querySelectorAll('#amp-fieldmap-body tr').forEach(row => {
      const k = row.querySelector('[data-role="fm-key"]')?.value?.trim();
      const v = row.querySelector('[data-role="fm-val"]')?.value?.trim();
      if (k) fm[k] = v || '';
    });
    fmt.fieldMap = fm;

    const tm = {};
    container.querySelectorAll('#amp-typemap-body tr').forEach(row => {
      const k = row.querySelector('[data-role="tm-key"]')?.value?.trim();
      const v = row.querySelector('[data-role="tm-val"]')?.value?.trim();
      if (k) tm[k] = v || '';
    });
    fmt.typeMap = tm;
  }

  const miscChk = container.querySelector('#amp-misc-preserve');
  if (miscChk) fmt.miscPreserveOriginal = miscChk.checked;

  _mapping[_activeFormat] = fmt;
}

function _rerender(container) {
  container.innerHTML = _buildFullHTML();
  _bindEvents(container);
}

function _bindEvents(container) {
  const routingMethodEl = container.querySelector('#amp-routing-method');
  const routeInstEl = container.querySelector('#amp-route-inst');
  routingMethodEl?.addEventListener('change', () => _persistRoutingSettings(container));
  routeInstEl?.addEventListener('change', () => _persistRoutingSettings(container));

  // Format tabs
  container.querySelectorAll('.amp-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _readCurrentFormatFromUI(container);
      _activeFormat = btn.dataset.format;
      _rerender(container);
    });
  });

  // Save
  container.querySelector('[data-action="save"]')?.addEventListener('click', () => {
    _readCurrentFormatFromUI(container);
    _persistRoutingSettings(container);
    localStorage.setItem(LS_KEY, JSON.stringify(_mapping));
    _original = JSON.parse(JSON.stringify(_mapping));
    _rerender(container);
    console.log('[AdapterMappingTab] Mapping saved to localStorage:', _mapping);
  });

  // Reset this format
  container.querySelector('[data-action="reset-format"]')?.addEventListener('click', () => {
    _readCurrentFormatFromUI(container);
    const defaults = _buildDefaultMapping();
    if (defaults[_activeFormat]) {
      _mapping[_activeFormat] = JSON.parse(JSON.stringify(defaults[_activeFormat]));
    }
    _rerender(container);
  });

  // Export
  container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    _readCurrentFormatFromUI(container);
    const blob = new Blob([JSON.stringify(_mapping, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'adapter-mapping.json';
    a.click();
  });

  // Import
  container.querySelector('[data-action="import"]')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      _mapping = json;
      _original = JSON.parse(JSON.stringify(json));
      localStorage.setItem(LS_KEY, JSON.stringify(json));
      _activeFormat = Object.keys(FORMAT_LABELS)[0];
      _rerender(container);
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  });

  // Add / delete fieldmap rows
  container.querySelector('[data-action="add-fm"]')?.addEventListener('click', () => {
    _readCurrentFormatFromUI(container);
    const fmt = _mapping[_activeFormat] || {};
    fmt.fieldMap = { ...(fmt.fieldMap||{}), '': '' };
    _mapping[_activeFormat] = fmt;
    _rerender(container);
  });
  container.querySelectorAll('[data-action="del-fm"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _readCurrentFormatFromUI(container);
      const key = btn.dataset.key;
      delete (_mapping[_activeFormat]?.fieldMap || {})[key];
      _rerender(container);
    });
  });

  // Add / delete typemap rows
  container.querySelector('[data-action="add-tm"]')?.addEventListener('click', () => {
    _readCurrentFormatFromUI(container);
    const fmt = _mapping[_activeFormat] || {};
    fmt.typeMap = { ...(fmt.typeMap||{}), '': '' };
    _mapping[_activeFormat] = fmt;
    _rerender(container);
  });
  container.querySelectorAll('[data-action="del-tm"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _readCurrentFormatFromUI(container);
      const key = btn.dataset.key;
      delete (_mapping[_activeFormat]?.typeMap || {})[key];
      _rerender(container);
    });
  });

  // Add / delete REV keywords
  container.querySelector('[data-action="add-kw"]')?.addEventListener('click', () => {
    _readCurrentFormatFromUI(container);
    const fmt = _mapping[_activeFormat] || {};
    fmt.typeKeywords = { ...(fmt.typeKeywords||{}), '': '' };
    _mapping[_activeFormat] = fmt;
    _rerender(container);
  });
  container.querySelectorAll('[data-action="del-kw"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _readCurrentFormatFromUI(container);
      const key = btn.dataset.key;
      delete (_mapping[_activeFormat]?.typeKeywords || {})[key];
      _rerender(container);
    });
  });

  // Merge priority arrows
  container.querySelectorAll('[data-action="priority-up"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _readCurrentFormatFromUI(container);
      const i = parseInt(btn.dataset.index);
      const mp = _mapping.mergePriority || [];
      [mp[i - 1], mp[i]] = [mp[i], mp[i - 1]];
      _mapping.mergePriority = mp;
      _rerender(container);
    });
  });
  container.querySelectorAll('[data-action="priority-down"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _readCurrentFormatFromUI(container);
      const i = parseInt(btn.dataset.index);
      const mp = _mapping.mergePriority || [];
      [mp[i], mp[i + 1]] = [mp[i + 1], mp[i]];
      _mapping.mergePriority = mp;
      _rerender(container);
    });
  });

  // Live read on input change (for dirty detection only — no full rerender)
  container.querySelectorAll('.amp-input').forEach(input => {
    input.addEventListener('input', () => _readCurrentFormatFromUI(container));
  });
}

// ── CSS injection ──────────────────────────────────────────────────────────

function _ensureStyles() {
  if (document.querySelector('#amp-style')) return;
  const style = document.createElement('style');
  style.id = 'amp-style';
  style.textContent = `
    .amp-root { display:flex; height:100%; overflow:hidden; background:#15171d; color:#d4d4d4; font-family:Inter,system-ui,sans-serif; font-size:13px; }
    .amp-sidebar { width:240px; min-width:200px; background:#1a1c24; border-right:1px solid #333; display:flex; flex-direction:column; gap:0; overflow-y:auto; flex-shrink:0; }
    .amp-sidebar-title { padding:14px 16px 4px; font-size:15px; font-weight:700; color:#e0e6ff; }
    .amp-sidebar-desc { padding:0 16px 12px; font-size:11px; color:#888; border-bottom:1px solid #2a2d35; }
    .amp-format-list { display:flex; flex-direction:column; gap:2px; padding:8px; }
    .amp-format-btn { display:flex; align-items:center; gap:10px; padding:10px 12px; background:none; border:1px solid transparent; border-radius:6px; color:#ccc; cursor:pointer; text-align:left; transition:background .12s; }
    .amp-format-btn:hover { background:#2a2d3a; }
    .amp-format-btn.is-active { background:#22283a; color:#fff; border-color:#444; }
    .amp-format-icon { font-size:18px; }
    .amp-format-label { font-size:13px; font-weight:600; }
    .amp-global-section { padding:12px 12px 8px; border-top:1px solid #2a2d35; flex:1; }
    .amp-routing-panel { padding:8px; margin-bottom:10px; background:#1e2028; border:1px solid #2a2d35; border-radius:6px; display:flex; flex-direction:column; gap:6px; }
    .amp-routing-label { font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:.04em; }
    .amp-routing-check { display:flex; gap:6px; align-items:flex-start; font-size:12px; color:#c9d1d9; line-height:1.35; }
    .amp-routing-check input { margin-top:2px; accent-color:#4a9eff; }
    .amp-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .amp-toolbar { display:flex; align-items:center; gap:6px; padding:8px 12px; background:#1e2028; border-bottom:1px solid #333; flex-wrap:wrap; }
    .amp-toolbar-btn { display:inline-flex; align-items:center; gap:4px; padding:6px 12px; font-size:12px; background:#2d3140; border:1px solid #444; border-radius:5px; color:#ccc; cursor:pointer; transition:background .1s; }
    .amp-toolbar-btn:hover:not(:disabled) { background:#3a3f55; }
    .amp-toolbar-btn:disabled { opacity:.4; cursor:default; }
    .amp-btn-save { background:#1a3a5c; border-color:#4a9eff; color:#4a9eff; font-weight:600; }
    .amp-btn-save:hover:not(:disabled) { background:#1f4a72; }
    .amp-dirty-dot { color:#e2994a; margin-left:4px; }
    .amp-toolbar-status { margin-left:auto; font-size:11px; }
    .amp-panel { flex:1; overflow-y:auto; padding:16px 20px; }
    .amp-content-header { display:flex; align-items:flex-start; gap:12px; padding:10px 14px; background:#1e2028; border-radius:6px; margin-bottom:16px; }
    .amp-content-icon { font-size:24px; }
    .amp-content-title { font-size:16px; font-weight:700; color:#e0e6ff; }
    .amp-content-desc { font-size:11px; color:#888; margin-top:2px; }
    .amp-section-head { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#888; margin:16px 0 6px; padding-bottom:4px; border-bottom:1px solid #2a2d35; }
    .amp-hint-inline { font-size:10px; color:#666; text-transform:none; letter-spacing:0; font-weight:400; margin-left:6px; }
    .amp-hint { font-size:11px; color:#666; margin:4px 0 8px; }
    .amp-table { width:100%; border-collapse:collapse; font-size:12px; }
    .amp-table thead tr { background:#1e2028; }
    .amp-table th { padding:6px 8px; color:#888; text-align:left; font-weight:600; font-size:10px; text-transform:uppercase; border-bottom:1px solid #2a2d35; }
    .amp-table td { padding:4px 6px; border-bottom:1px solid #23262f; }
    .amp-table tr:hover td { background:#1f2330; }
    .amp-input { width:100%; background:#131722; border:1px solid #333; border-radius:4px; color:#d4d4d4; padding:4px 6px; font-size:12px; }
    .amp-input:focus { outline:none; border-color:#4a9eff; }
    .amp-select { appearance:none; -webkit-appearance:none; background:#131722 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23667'/%3E%3C/svg%3E") no-repeat right 6px center; padding-right:22px; cursor:pointer; }
    .amp-del-btn { background:none; border:none; color:#666; cursor:pointer; font-size:14px; padding:2px 6px; border-radius:3px; }
    .amp-del-btn:hover { color:#e74c3c; background:#2a1010; }
    .amp-add-btn { margin-top:6px; padding:5px 12px; background:#1a2030; border:1px dashed #445; border-radius:5px; color:#888; cursor:pointer; font-size:11px; }
    .amp-add-btn:hover { background:#1e2840; color:#aaa; }
    .amp-hint-cell { font-size:10px; color:#666; }
    .amp-bore-table code { background:#1a2030; padding:2px 5px; border-radius:3px; font-size:11px; color:#6fcf97; }
    .amp-misc-row { margin-top:12px; font-size:12px; color:#aaa; }
    .amp-misc-row input { margin-right:6px; accent-color:#4a9eff; }
    .amp-priority-list { display:flex; flex-direction:column; gap:4px; }
    .amp-priority-item { display:flex; align-items:center; gap:8px; padding:6px 8px; background:#1e2028; border-radius:5px; border:1px solid #2a2d35; }
    .amp-priority-rank { font-size:11px; color:#666; width:16px; text-align:center; }
    .amp-priority-name { flex:1; font-size:12px; font-weight:600; color:#c8d8ff; }
    .amp-priority-arrows { display:flex; flex-direction:column; gap:1px; }
    .amp-arr-btn { background:none; border:none; color:#666; cursor:pointer; font-size:11px; padding:0 3px; line-height:1.3; }
    .amp-arr-btn:hover { color:#4a9eff; }
  `;
  document.head.appendChild(style);
}

// ── Public render function ─────────────────────────────────────────────────

export async function renderAdapterMappingTab(container) {
  _ensureStyles();
  container.innerHTML = '<div style="padding:30px;color:#888;text-align:center;">Loading adapter mapping...</div>';
  await _loadMapping();
  _activeFormat = 'att';
  _rerender(container);
}
