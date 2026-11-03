import { state, updateRvmPcfExtractState } from '../core/state.js';
import { rvmPcfLegacyDataManager as dataManager } from '../pcf-legacy/services/rvm-pcf-legacy-data-manager.js';
import { masterTableService } from '../pcf-legacy/services/master-table-service.js';
import { renderMasterMatchDiagnostics } from '../pcf-legacy/ui/master-match-diagnostics-panel.js';

const MASTER_TABS = [
  { id: 'linelist', label: 'Line List' },
  { id: 'weights', label: 'Weights / Valve CA8' },
  { id: 'pipingclass', label: 'Piping Class' },
  { id: 'materialmap', label: 'Material Map' },
  { id: 'support', label: 'Support Mapping' },
  { id: 'branch', label: 'TEE/OLET BRLEN' },
  { id: 'diagnostics', label: 'Master Diagnostics' },
];

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[ch]));
}

function rowsFor(tabId) {
  if (tabId === 'linelist') return dataManager.getLinelist();
  if (tabId === 'weights') return dataManager.getWeights();
  if (tabId === 'pipingclass') return dataManager.getPipingClassMaster();
  if (tabId === 'materialmap') return dataManager.getMaterialMap();
  if (tabId === 'support') return state.rvmPcfExtract?.masters?.supportMapping?.blocks || [];
  if (tabId === 'branch') {
    const tables = masterTableService.getTables();
    return [
      ...(tables.table1EqualTee || []).map(r => ({ table: 'Equal TEE', ...r })),
      ...(tables.table2ReducingTee || []).map(r => ({ table: 'Reducing TEE', ...r })),
      ...(tables.table3Weldolet || []).map(r => ({ table: 'Weldolet', ...r })),
    ];
  }
  return [];
}

function renderTable(rows = []) {
  if (!rows.length) {
    return `<div class="rvm-master-empty">No rows loaded.</div>`;
  }

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row || {})))).slice(0, 40);

  return `
    <div class="rvm-master-table-wrap">
      <table class="rvm-master-table">
        <thead>
          <tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.slice(0, 500).map(row => `
            <tr>${headers.map(h => `<td>${esc(row?.[h])}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
      ${rows.length > 500 ? `<div class="rvm-master-note">Showing first 500 of ${rows.length} rows.</div>` : ''}
    </div>
  `;
}

function renderTabContent(tabId) {
  if (tabId === 'diagnostics') {
    setTimeout(() => renderMasterMatchDiagnostics(), 0);
    return `
      <div id="panel-masterdata" class="rvm-master-diagnostics-host">
        <button type="button" class="rvm-master-btn" id="rvm-master-run-diagnostics">Run Master Match Diagnostics</button>
      </div>
    `;
  }

  const rows = rowsFor(tabId);

  return `
    <div class="rvm-master-toolbar">
      <label class="rvm-master-btn">
        Import JSON
        <input hidden type="file" accept=".json,application/json" data-master-import-json="${esc(tabId)}">
      </label>
      <button type="button" class="rvm-master-btn" data-master-export="${esc(tabId)}">Export JSON</button>
      <button type="button" class="rvm-master-btn" data-master-convert-bore="${esc(tabId)}">Convert Bores</button>
      <span class="rvm-master-count">${rows.length} row(s)</span>
    </div>
    ${renderTable(rows)}
  `;
}

export function renderRvmPcfMasterTabs(container) {
  let active = 'linelist';

  const draw = () => {
    container.innerHTML = `
      <div class="rvm-master-root">
        <div class="rvm-master-tabbar">
          ${MASTER_TABS.map(t => `
            <button type="button" class="rvm-master-tab ${t.id === active ? 'is-active' : ''}" data-master-tab="${t.id}">
              ${esc(t.label)}
            </button>
          `).join('')}
        </div>
        <div class="rvm-master-content">
          ${renderTabContent(active)}
        </div>
      </div>
    `;

    bind(container);
  };

  const bind = (host) => {
    host.querySelectorAll('[data-master-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        active = btn.dataset.masterTab;
        draw();
      });
    });

    host.querySelectorAll('[data-master-import-json]').forEach(input => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        const tabId = input.dataset.masterImportJson;
        const rows = JSON.parse(await file.text());

        if (tabId === 'linelist') dataManager.setLinelist(rows);
        if (tabId === 'weights') dataManager.setWeights(rows);
        if (tabId === 'pipingclass') dataManager.setPipingClassMaster(rows);
        if (tabId === 'materialmap') dataManager.setMaterialMap(rows);

        draw();
      });
    });

    host.querySelectorAll('[data-master-export]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.masterExport;
        const rows = rowsFor(tabId);
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rvm-pcf-master-${tabId}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    });

    host.querySelectorAll('[data-master-convert-bore]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.masterConvertBore;
        if (tabId === 'linelist') dataManager.convertMasterBores('linelist', dataManager.getConvertedBoreSource('linelist'));
        if (tabId === 'weights') dataManager.convertMasterBores('weights', dataManager.getConvertedBoreSource('weights'));
        if (tabId === 'pipingclass') dataManager.convertMasterBores('pipingclass', dataManager.getConvertedBoreSource('pipingclass'));
        draw();
      });
    });

    host.querySelector('#rvm-master-run-diagnostics')?.addEventListener('click', () => {
      renderMasterMatchDiagnostics();
    });
  };

  draw();
}
