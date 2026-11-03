import {
  SUPPORT_KINDS,
  MATCH_TYPES,
} from '../../../../support/SupportKindResolver.js';

import {
  addSupportMappingRule,
  applySupportMappingRowPatch,
  migrateSupportMappingConfig,
  removeSupportMappingRule,
  supportKindToXmlTypeFromMapping,
  supportMappingRowsForTable,
  DEFAULT_STOP_KEYWORD_HELP,
} from '../../../../converters/xml-cii2019-core/support-mapping-config.js';

function text(value) {
  return String(value ?? '');
}

function esc(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function selected(actual, expected) {
  return String(actual) === String(expected) ? 'selected' : '';
}

function checked(value) {
  return value ? 'checked' : '';
}

function infoIcon(textValue) {
  return `<span title="${esc(textValue)}" style="cursor:help;color:#8bb7ff;border:1px solid #406089;border-radius:50%;padding:0 5px;font-size:11px;line-height:1.3;">i</span>`;
}

function inputCell(row, field, value, width = '96px') {
  return `<input data-sm-row="${esc(row.id)}" data-sm-field="${esc(field)}" value="${esc(value)}" style="width:${width};box-sizing:border-box;background:#101827;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px 6px;">`;
}

function selectCell(row, field, value, options, width = '110px') {
  return `
    <select data-sm-row="${esc(row.id)}" data-sm-field="${esc(field)}" style="width:${width};box-sizing:border-box;background:#101827;color:#e6edf5;border:1px solid #31455f;border-radius:4px;padding:4px 6px;">
      ${options.map((opt) => `<option value="${esc(opt)}" ${selected(value, opt)}>${esc(opt)}</option>`).join('')}
    </select>
  `;
}

function rowHtml(row) {
  const locked = row.locked ? 'title="Built-in rule; edit output profile or add a user rule for overrides."' : '';
  return `
    <tr data-sm-tr="${esc(row.id)}" ${locked}>
      <td style="text-align:center;"> <input type="checkbox" data-sm-row="${esc(row.id)}" data-sm-field="enabled" ${checked(row.enabled)}> </td>
      <td>${inputCell(row, 'priority', row.priority, '64px')}</td>
      <td>${inputCell(row, 'source', row.source || 'all', '80px')}</td>
      <td>${inputCell(row, 'field', row.field || '*', '210px')}</td>
      <td>${selectCell(row, 'match', row.match, MATCH_TYPES, '105px')}</td>
      <td>${inputCell(row, 'pattern', row.pattern || '', '190px')}</td>
      <td>${selectCell(row, 'kind', row.kind, SUPPORT_KINDS, '105px')}</td>
      <td>${inputCell(row, 'xmlTypes', row.xmlTypes || '', '100px')}</td>
      <td>${selectCell(row, 'directionMode', row.directionMode || 'none', ['none', 'fixed', 'pipe-axis', 'pipe-normal', 'from-staged', 'from-xml'], '125px')}</td>
      <td>${inputCell(row, 'dirX', row.dirX, '58px')}</td>
      <td>${inputCell(row, 'dirY', row.dirY, '58px')}</td>
      <td>${inputCell(row, 'dirZ', row.dirZ, '58px')}</td>
      <td>${inputCell(row, 'stiffness', row.stiffness || 'default', '130px')}</td>
      <td>${inputCell(row, 'gap', row.gap ?? '0', '70px')}</td>
      <td>${selectCell(row, 'frictionMode', row.frictionMode || 'default', ['default', 'sentinel', 'fixed', 'existing'], '110px')}</td>
      <td>${inputCell(row, 'fixedFriction', row.fixedFriction || '', '80px')}</td>
      <td>${selectCell(row, 'supportTagMode', row.supportTagMode || 'kind', ['kind', 'blank', 'source', 'custom'], '110px')}</td>
      <td>${inputCell(row, 'supportTagValue', row.supportTagValue || '', '120px')}</td>
      <td>${inputCell(row, 'notes', row.notes || '', '160px')}</td>
      <td style="text-align:center;">
        <button type="button" data-sm-delete="${esc(row.id)}" class="model-converters-download-btn" style="padding:2px 7px;" ${row.locked ? 'disabled title="Built-in rules cannot be deleted; disable them instead."' : ''}>×</button>
      </td>
    </tr>
  `;
}

export function renderUnifiedSupportMappingTable(container, config) {
  const supportMapping = migrateSupportMappingConfig(config);
  config.supportMapping = supportMapping;
  config.supportKindToXmlType = supportKindToXmlTypeFromMapping(supportMapping);

  const rows = supportMappingRowsForTable(config);

  container.innerHTML = `
    <div class="model-converters-workflow-detail-title">6 Support Types ${infoIcon(DEFAULT_STOP_KEYWORD_HELP)}</div>
    <div class="model-converters-workflow-detail-text">
      One table for support detection and XML/CII restraint output. Detection columns map staged/XML/RVM/ATT attributes to support kinds.
      Output columns map each kind to XML/CII type, direction cosines, stiffness, gap, friction, and support tag behavior.
    </div>

    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 12px;">
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer;color:#c9d1d9;font-size:12px;">
        <input type="checkbox" id="sm-use-json" ${checked(supportMapping.useJsonForRestraints !== false)}>
        <span>Use JSON/support mapper for restraints</span>
      </label>
      <button type="button" id="sm-add-row" class="model-converters-download-btn">+ Add support rule</button>
      <button type="button" id="sm-reset-defaults" class="model-converters-download-btn">Reset table to defaults</button>
      <span id="sm-save-status" style="font-size:12px;color:#8b9eb7;"></span>
    </div>

    <div style="overflow:auto;max-height:58vh;border:1px solid #26384f;border-radius:8px;">
      <table class="xml-cii-support-mapping-table" style="border-collapse:collapse;min-width:1900px;width:100%;font-size:12px;">
        <thead style="color:#fff;background:#111827;">
          <tr>
            <th style="color:#fff;">On</th>
            <th style="color:#fff;">Priority</th>
            <th style="color:#fff;">Source</th>
            <th style="color:#fff;">Fields</th>
            <th style="color:#fff;">Match</th>
            <th style="color:#fff;">Pattern / Keywords</th>
            <th style="color:#fff;">Kind</th>
            <th style="color:#fff;">XML/CII Type(s)</th>
            <th style="color:#fff;">Direction Mode</th>
            <th style="color:#fff;">Dir X</th>
            <th style="color:#fff;">Dir Y</th>
            <th style="color:#fff;">Dir Z</th>
            <th style="color:#fff;">Stiffness</th>
            <th style="color:#fff;">Gap</th>
            <th style="color:#fff;">Friction</th>
            <th style="color:#fff;">Fixed Fric.</th>
            <th style="color:#fff;">Tag Mode</th>
            <th style="color:#fff;">Tag Value</th>
            <th style="color:#fff;">Notes</th>
            <th style="color:#fff;"></th>
          </tr>
        </thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
    </div>

    <div class="model-converters-workflow-detail-note" style="margin-top:10px;">
      Direction Mode:
      <code>fixed</code> uses Dir X/Y/Z;
      <code>pipe-axis</code> is for line stops;
      <code>pipe-normal</code> is for guides;
      <code>from-staged</code> reads staged JSON direction attributes;
      <code>from-xml</code> preserves XML restraint direction cosines.
      Built-in rows can be disabled; add user rows for project-specific rules.
    </div>
  `;
}

export function bindUnifiedSupportMappingTable(container, config, callbacks = {}) {
  const statusEl = container.querySelector('#sm-save-status');
  const markSaved = (message = 'Saved') => {
    if (!statusEl) return;
    statusEl.textContent = message;
    setTimeout(() => {
      if (statusEl.textContent === message) statusEl.textContent = '';
    }, 1600);
  };

  const save = (rerender = false) => {
    const supportMapping = migrateSupportMappingConfig(config);
    config.supportMapping = supportMapping;
    config.supportKindToXmlType = supportKindToXmlTypeFromMapping(supportMapping);
    callbacks.onSaveConfig?.(config);
    markSaved();
    if (rerender) {
      renderUnifiedSupportMappingTable(container, config);
      bindUnifiedSupportMappingTable(container, config, callbacks);
    }
  };

  container.querySelector('#sm-use-json')?.addEventListener('change', (event) => {
    const supportMapping = migrateSupportMappingConfig(config);
    supportMapping.useJsonForRestraints = event.target.checked;
    config.supportMapping = supportMapping;
    save(false);
  });

  container.querySelector('#sm-add-row')?.addEventListener('click', () => {
    addSupportMappingRule(config);
    save(true);
  });

  container.querySelector('#sm-reset-defaults')?.addEventListener('click', () => {
    delete config.supportMapping;
    delete config.supportKindToXmlType;
    const supportMapping = migrateSupportMappingConfig(config);
    config.supportMapping = supportMapping;
    config.supportKindToXmlType = supportKindToXmlTypeFromMapping(supportMapping);
    save(true);
  });

  container.querySelectorAll('[data-sm-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      removeSupportMappingRule(config, button.getAttribute('data-sm-delete'));
      save(true);
    });
  });

  container.querySelectorAll('[data-sm-row][data-sm-field]').forEach((input) => {
    const apply = () => {
      const rowId = input.getAttribute('data-sm-row');
      const field = input.getAttribute('data-sm-field');
      const value = input.type === 'checkbox' ? input.checked : input.value;
      applySupportMappingRowPatch(config, rowId, { [field]: value });
      save(false);
    };

    input.addEventListener('change', apply);
    if (input.tagName !== 'SELECT' && input.type !== 'checkbox') input.addEventListener('blur', apply);
  });
}
