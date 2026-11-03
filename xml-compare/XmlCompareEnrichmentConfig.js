export const XML_COMPARE_ENRICHMENT_CONFIG_SCHEMA = 'xml-compare-enrichment-config/v2-syntax-fix';
export const ENRICHMENT_CONFIG_SCHEMA = XML_COMPARE_ENRICHMENT_CONFIG_SCHEMA;

const COMP_TYPES = ['ATTA', 'ELBO', 'BRAN', 'OLET', 'RIGID', 'TEE', 'PIPE'];
const DEFAULT_DTXR_TYPE_MAP_TEXT = [
  'TYPE\tKIND\tDTXR_POS',
  '0\tANCHOR\tANCHOR',
  '3\tREST\tPIPE SUPPORT',
  '5\tREST\tPIPE SUPPORT',
  '7\tGUIDE\tGUIDE',
  '10\tGUIDE\tGUIDE',
  '17\tREST\tPIPE SUPPORT',
].join('\n');

const DEFAULT_RESTRAINT_TYPE_CONVERT_ROWS = Object.freeze([
  Object.freeze({ label: '+Y',  from: '17', to: '14' }),
  Object.freeze({ label: 'LIM', from: '7',  to: '8'  }),
  Object.freeze({ label: 'GUI', from: '10', to: '9'  }),
  Object.freeze({ label: 'X',   from: '1',  to: '2'  }),
  Object.freeze({ label: 'Y',   from: '2',  to: '3'  }),
  Object.freeze({ label: 'Z',   from: '3',  to: '5'  }),
  Object.freeze({ label: '',    from: '18', to: '15' }),
]);

export const DEFAULT_ENRICHMENT_CONFIG = Object.freeze({
  pipingClass: Object.freeze({ enabled: true, regex: '([0-9]{5})', group: '1', tokenPosition: '4', tokenDelimiter: '-' }),
  rating:       Object.freeze({ enabled: true, method: 'table', tableText: '', fixedValue: '' }),
  componentType: Object.freeze({ enabled: true, bendType: 'ELBO', sifType: 'BRAN', rigidType: 'ATTA', defaultType: 'ATTA' }),
  position:     Object.freeze({ enabled: false, startX: '', startY: '', startZ: '' }),
  dtxr:         Object.freeze({ enabled: true, typeMapText: DEFAULT_DTXR_TYPE_MAP_TEXT }),
  pointPropertiesBasis: Object.freeze({ enabled: true, value: 'TO' }),
  restraintTypeConvert: Object.freeze({ enabled: false, rows: DEFAULT_RESTRAINT_TYPE_CONVERT_ROWS }),
});

const ENR_TABS = Object.freeze([
  { key: 'restraint',   label: 'Restraint Types', icon: '⇄', sectionKeys: ['restraintTypeConvert'] },
  { key: 'class',       label: 'Classification',  icon: '⊞', sectionKeys: ['pipingClass', 'rating'] },
  { key: 'component',   label: 'Component',       icon: '⬡', sectionKeys: ['componentType', 'dtxr'] },
  { key: 'geometry',    label: 'Geometry',        icon: '⊕', sectionKeys: ['position', 'pointPropertiesBasis'] },
]);

export function createEnrichmentConfig(overrides = {}) {
  return {
    open: false,
    activeEnrTab: overrides.activeEnrTab || 'restraint',
    pipingClass:          { ...DEFAULT_ENRICHMENT_CONFIG.pipingClass,          ...(overrides.pipingClass          || {}) },
    rating:               { ...DEFAULT_ENRICHMENT_CONFIG.rating,               ...(overrides.rating               || {}) },
    componentType:        { ...DEFAULT_ENRICHMENT_CONFIG.componentType,        ...(overrides.componentType        || {}) },
    position:             { ...DEFAULT_ENRICHMENT_CONFIG.position,             ...(overrides.position             || {}) },
    dtxr:                 { ...DEFAULT_ENRICHMENT_CONFIG.dtxr,                 ...(overrides.dtxr                 || {}) },
    pointPropertiesBasis: { ...DEFAULT_ENRICHMENT_CONFIG.pointPropertiesBasis, ...(overrides.pointPropertiesBasis || {}) },
    restraintTypeConvert: {
      ...DEFAULT_ENRICHMENT_CONFIG.restraintTypeConvert,
      ...(overrides.restraintTypeConvert || {}),
      rows: Array.isArray(overrides.restraintTypeConvert?.rows)
        ? overrides.restraintTypeConvert.rows.map(r => ({ ...r }))
        : DEFAULT_RESTRAINT_TYPE_CONVERT_ROWS.map(r => ({ ...r })),
    },
  };
}

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function enrField(id, label, value, type = 'text', placeholder = '', extra = '') {
  return `<label class="enr-field"><span>${esc(label)}</span><input type="${type}" data-enr-field="${esc(id)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${extra}></label>`;
}

function enrSelect(id, label, value, options) {
  const opts = options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const lbl = label ? `<span>${esc(label)}</span>` : '';
  return `<label class="enr-field">${lbl}<select data-enr-field="${esc(id)}">${opts}</select></label>`;
}

function enrTextarea(id, label, value, placeholder) {
  return `<label class="enr-textarea-label"><span>${esc(label)}</span><textarea data-enr-field="${esc(id)}" spellcheck="false" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
}

function enrSection(toggleKey, title, enabled, body) {
  return `<section class="enr-section ${enabled ? 'is-enabled' : 'is-disabled'}">
    <label class="enr-section-toggle"><input type="checkbox" data-enr-toggle="${esc(toggleKey)}" ${enabled ? 'checked' : ''}><span>${esc(title)}</span></label>
    <div class="enr-section-content">${body}</div>
  </section>`;
}

function renderRestraintTypeConvertSection(rtc) {
  const rows = Array.isArray(rtc.rows) ? rtc.rows : DEFAULT_RESTRAINT_TYPE_CONVERT_ROWS.map(r => ({ ...r }));
  const tableRows = rows.map((row, i) => `<tr>
      <td><input class="enr-rtc-label" type="text" data-enr-rtc-row="${i}" data-enr-rtc-col="label" value="${esc(row.label || '')}" placeholder="label"></td>
      <td><input class="enr-rtc-num" type="number" data-enr-rtc-row="${i}" data-enr-rtc-col="from" value="${esc(row.from || '')}" placeholder="e.g. 17" min="0" step="1"></td>
      <td class="enr-rtc-arrow">→</td>
      <td><input class="enr-rtc-num" type="number" data-enr-rtc-row="${i}" data-enr-rtc-col="to" value="${esc(row.to || '')}" placeholder="e.g. 14" min="0" step="1"></td>
      <td><button type="button" data-xml-compare-action="delete-restraint-type-row" data-row-index="${i}">Delete</button></td>
    </tr>`).join('');
  return enrSection('restraintTypeConvert', 'Restraint Type Conversion', rtc.enabled, `<p class="enr-help">Convert CAESAR restraint TYPE values before enrichment and analysis.</p><table class="enr-rtc-table"><thead><tr><th>Label</th><th>From TYPE</th><th></th><th>To TYPE</th><th></th></tr></thead><tbody>${tableRows}</tbody></table><button type="button" data-xml-compare-action="add-restraint-type-row">Add row</button>`);
}

function tabButton(tab, active) {
  return `<button type="button" class="enr-tab ${active ? 'is-active' : ''}" data-xml-compare-action="enr-switch-tab" data-enr-tab-key="${esc(tab.key)}"><span>${esc(tab.icon)}</span>${esc(tab.label)}</button>`;
}

function sectionFor(key, cfg) {
  if (key === 'restraintTypeConvert') return renderRestraintTypeConvertSection(cfg.restraintTypeConvert || {});
  if (key === 'pipingClass') return enrSection('pipingClass', 'PipingClass', cfg.pipingClass?.enabled, `${enrField('pipingClass.regex','Regex',cfg.pipingClass?.regex || '')}${enrField('pipingClass.group','Group',cfg.pipingClass?.group || '1','number')}${enrField('pipingClass.tokenPosition','Token position',cfg.pipingClass?.tokenPosition || '4','number')}${enrField('pipingClass.tokenDelimiter','Token delimiter',cfg.pipingClass?.tokenDelimiter || '-')}`);
  if (key === 'rating') return enrSection('rating', 'Rating', cfg.rating?.enabled, `${enrSelect('rating.method','Method',cfg.rating?.method || 'table',['fixed','table'])}${enrField('rating.fixedValue','Fixed value',cfg.rating?.fixedValue || '')}${enrTextarea('rating.tableText','Class→rating table',cfg.rating?.tableText || '', 'PIPINGCLASS\tRATING')}`);
  if (key === 'componentType') return enrSection('componentType', 'ComponentType', cfg.componentType?.enabled, `${enrSelect('componentType.bendType','Bend',cfg.componentType?.bendType || 'ELBO',COMP_TYPES)}${enrSelect('componentType.sifType','SIF',cfg.componentType?.sifType || 'BRAN',COMP_TYPES)}${enrSelect('componentType.rigidType','Rigid',cfg.componentType?.rigidType || 'ATTA',COMP_TYPES)}${enrSelect('componentType.defaultType','Default',cfg.componentType?.defaultType || 'ATTA',COMP_TYPES)}`);
  if (key === 'dtxr') return enrSection('dtxr', 'DTXR', cfg.dtxr?.enabled, `${enrTextarea('dtxr.typeMapText','TYPE map',cfg.dtxr?.typeMapText || '', 'TYPE\tKIND\tDTXR_POS')}`);
  if (key === 'position') return enrSection('position', 'Position', cfg.position?.enabled, `${enrField('position.startX','Start X',cfg.position?.startX || '0','number')}${enrField('position.startY','Start Y',cfg.position?.startY || '0','number')}${enrField('position.startZ','Start Z',cfg.position?.startZ || '0','number')}`);
  if (key === 'pointPropertiesBasis') return enrSection('pointPropertiesBasis', 'Point basis', cfg.pointPropertiesBasis?.enabled, `${enrSelect('pointPropertiesBasis.value','Value',cfg.pointPropertiesBasis?.value || 'TO',['FROM','TO'])}`);
  return '';
}

export function renderXmlCompareEnrichmentConfigPopupHtml(config = createEnrichmentConfig()) {
  if (!config.open) return '';
  const activeKey = config.activeEnrTab || 'restraint';
  const activeTab = ENR_TABS.find(t => t.key === activeKey) || ENR_TABS[0];
  return `<div class="xml-compare-sideload-backdrop" data-xml-compare-enrichment-popup="true">
    <section class="xml-compare-sideload-dialog enr-dialog">
      <header><div><h3>Enrichment Config</h3><p>Configure enrichment before applying sideload XML.</p></div><button type="button" data-xml-compare-action="close-enrichment">Close</button></header>
      <div class="enr-tabs">${ENR_TABS.map(t => tabButton(t, t.key === activeTab.key)).join('')}</div>
      <div class="enr-tab-panel">${activeTab.sectionKeys.map(key => sectionFor(key, config)).join('')}</div>
      <footer><button type="button" data-xml-compare-action="save-enrichment">Save</button><small>${esc(activeTab.label)} settings</small></footer>
    </section>
  </div>`;
}

export function saveEnrichmentToStorage(config) { try { localStorage.setItem('xmlCompare.enrichmentConfig.v1', JSON.stringify(config)); } catch {} }
export function loadEnrichmentFromStorage() { try { const raw = localStorage.getItem('xmlCompare.enrichmentConfig.v1'); return raw ? createEnrichmentConfig(JSON.parse(raw)) : createEnrichmentConfig(); } catch { return createEnrichmentConfig(); } }

export const _test = Object.freeze({ esc, enrField, enrSelect, enrTextarea, sectionFor, DEFAULT_DTXR_TYPE_MAP_TEXT });
