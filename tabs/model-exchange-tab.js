import { notify } from '../diagnostics/notification-center.js';
import { createModelExchangeStore } from '../interchange/state/model-exchange-store.js';
import { importFileIntoModelExchange, exportFromModelExchange, updateViewState } from '../interchange/state/model-exchange-actions.js';
import { summarizeProjectFidelity } from '../interchange/validation/FidelityEvaluator.js';
import { validateCanonicalProject } from '../interchange/validation/CanonicalValidator.js';
import { validateSupports } from '../interchange/validation/SupportValidator.js';
import { validateAnnotations } from '../interchange/validation/AnnotationValidator.js';
import { renderIcon } from '../interchange/view/interchange-icons.js';
import { getConversionConfig, subscribeConversionConfig } from '../interchange/config/conversion-config-store.js';
import { getSupportMappingConfig, loadSupportMappingConfig, subscribeSupportMappingConfig } from '../interchange/support/support-mapping-store.js';
import { ModelexhPreviewRenderer } from '../interchange/view/Modelexh_PreviewRenderer.js';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';

const store = createModelExchangeStore();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureStylesheet() {
  if (document.querySelector('link[data-model-exchange-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/model-exchange-tab.css';
  link.dataset.modelExchangeStyle = 'true';
  document.head.appendChild(link);
}

function formatLossSummary(losses = []) {
  if (!losses.length) return 'No losses reported.';
  return `${losses.length} loss contract item(s) generated.`;
}

function triggerTabSwitch(tabId) {
  window.dispatchEvent(new CustomEvent('app:switch-tab', { detail: { tabId } }));
}

function downloadExportResult(result, sourceName = 'model-exchange') {
  const extension = result.meta?.targetFormat === 'XML'
    ? '.xml'
    : result.meta?.targetFormat === 'PCF'
      ? '.pcf'
      : result.meta?.targetFormat === 'GLB'
        ? '.glb.json'
        : '.pcfx.json';
  const blob = result.blob || new Blob([result.text || ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(sourceName || 'model-exchange').replace(/\.[^.]+$/, '')}${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderLeftPanel() {
  const source = store.sourcePreview;
  const canonical = store.canonicalPreview;
  const config = store.configSnapshot || getConversionConfig();
  const supportConfig = getSupportMappingConfig();
  return `
    <div class="model-exchange-panel model-exchange-left">
      <div class="model-exchange-section-title">Source Preview</div>
      ${source ? `
        <div><strong>${escapeHtml(source.name)}</strong></div>
        <div>Format: ${escapeHtml(source.format)}</div>
        <div>Dialect: ${escapeHtml(source.dialect)}</div>
        <div>Messages: ${source.messageCount}</div>
      ` : '<div>No source loaded.</div>'}
      <hr>
      <div class="model-exchange-section-title">Canonical Preview</div>
      ${canonical ? canonical.assemblies.map((asm) => `
        <div class="mx-panel-card">
          <div><strong>${escapeHtml(asm.name)}</strong></div>
          <div>Nodes: ${asm.nodes}</div>
          <div>Segments: ${asm.segments}</div>
          <div>Supports: ${asm.supports}</div>
          <div>Annotations: ${asm.annotations}</div>
        </div>
      `).join('') : '<div>No canonical project.</div>'}
      <hr>
      <div class="model-exchange-section-title">Active Conversion Config</div>
      <div class="model-exchange-code">${escapeHtml(JSON.stringify({
        xmlProfile: config.profile?.xmlProfile,
        units: config.profile?.units,
        mergeToleranceMm: config.topology?.nodeMergeToleranceMm,
        strictMode: config.exportPolicy?.strictMode,
        precedence: config.exportPolicy?.precedence,
      }, null, 2))}</div>
      <hr>
      <div class="model-exchange-section-title">Support Mapping Summary</div>
      <div class="model-exchange-code">${escapeHtml(JSON.stringify({
        version: supportConfig?.version,
        revRules: supportConfig?.formats?.REV?.rules?.length || 0,
        jsonRules: supportConfig?.formats?.JSON?.rules?.length || 0,
        xmlRules: supportConfig?.formats?.XML?.rules?.length || 0,
      }, null, 2))}</div>
    </div>
  `;
}

function renderCenterPanel() {
  const rendered = store.renderedPreview;
  const fidelity = store.project ? summarizeProjectFidelity(store.project) : null;
  const lastExport = store.lastExportResult;
  return `
    <div class="model-exchange-panel model-exchange-center">
      <div class="model-exchange-toolbar">
        <label class="model-exchange-button model-exchange-file-button" title="Import REV, JSON, PCF, PCFX, XML, or GLB into the canonical model exchange surface">
          <span class="mx-icon">${renderIcon('import')}</span><span>Import</span>
          <input class="mx-hidden-input" type="file" data-action="import-file" accept=".rev,.REV,.json,.JSON,.pcf,.PCF,.xml,.XML,.pcfx,.glb" />
        </label>
        <button class="model-exchange-button" data-action="preview-source"><span class="mx-icon">${renderIcon('source')}</span><span>Source Preview</span></button>
        <button class="model-exchange-button" data-action="preview-canonical"><span class="mx-icon">${renderIcon('canonical')}</span><span>Canonical Preview</span></button>
        <button class="model-exchange-button" data-action="preview-rendered"><span class="mx-icon">${renderIcon('rendered')}</span><span>Rendered Preview</span></button>
        <button class="model-exchange-button" data-action="export-pcf"><span class="mx-icon">${renderIcon('export')}</span><span>Export PCF</span></button>
        <button class="model-exchange-button" data-action="export-pcfx"><span class="mx-icon">${renderIcon('export')}</span><span>Export PCFX</span></button>
        <button class="model-exchange-button" data-action="export-xml"><span class="mx-icon">${renderIcon('export')}</span><span>Export XML</span></button>
        <button class="model-exchange-button" data-action="export-glb"><span class="mx-icon">${renderIcon('export')}</span><span>Export GLB</span></button>
        <button class="model-exchange-button" data-action="open-config"><span class="mx-icon">${renderIcon('config')}</span><span>Config</span></button>
        <button class="model-exchange-button" data-action="open-support-config"><span class="mx-icon">${renderIcon('config')}</span><span>Support Settings</span></button>
        <select class="model-exchange-select" data-action="support-mode">
          <option value="SYMBOL">Support: Symbol</option>
          <option value="SIMPLIFIED_GEOMETRY">Support: Simplified Geometry</option>
          <option value="METADATA_ONLY">Support: Metadata Only</option>
        </select>
        <button class="model-exchange-button" data-action="toggle-verification"><span class="mx-icon">${renderIcon('validate')}</span><span>Verify 100%</span></button>
      </div>

      <div class="model-exchange-section-title">Modelexh Geometry Preview</div>
      <div class="model-exchange-canvas-wrap">
        <div class="model-exchange-canvas-host" data-role="modelexh-preview"></div>
      </div>

      <div class="model-exchange-section-title">Rendered Inspector</div>
      ${rendered ? `
        <div class="mx-summary-grid">
          <div class="mx-card">
            <strong>Assemblies</strong><br><span class="mx-card-value">${rendered.assemblies.length}</span>
          </div>
          <div class="mx-card">
            <strong>Nodes</strong><br><span class="mx-card-value mx-green">${rendered.nodes.length}</span>
          </div>
          <div class="mx-card">
            <strong>Supports</strong><br><span class="mx-card-value mx-amber">${rendered.supportRenderItems.length}</span>
          </div>
          <div class="mx-card">
            <strong>Annotations</strong><br><span class="mx-card-value mx-purple">${rendered.annotationRenderItems.length}</span>
          </div>
        </div>
        <div class="mx-section-spacer">
          <strong>Fidelity Summary:</strong>
          <pre class="model-exchange-code">${escapeHtml(JSON.stringify(fidelity || {}, null, 2))}</pre>
        </div>
      ` : `<div class="mx-empty">No rendered preview available for current source. Please load a project.</div>`}
      <div class="mx-section-spacer">
        <div class="model-exchange-section-title">Last Export Result</div>
        <div class="model-exchange-code">${escapeHtml(JSON.stringify(lastExport ? {
          targetFormat: lastExport.targetFormat,
          adapter: lastExport.adapter,
          warnings: lastExport.warnings?.length || 0,
          losses: lastExport.losses?.length || 0,
          summary: formatLossSummary(lastExport.losses || []),
        } : { status: 'No exports yet.' }, null, 2))}</div>
      </div>
    </div>
  `;
}

function renderRightPanel() {
  const project = store.project;
  const issues = project ? [
    ...validateCanonicalProject(project),
    ...validateSupports(project),
    ...validateAnnotations(project),
  ] : [];
  return `
    <div class="model-exchange-panel model-exchange-right">
      <div class="model-exchange-section-title">Inspector</div>
      ${project ? `
        <div><strong>${escapeHtml(project.name)}</strong></div>
        <div>Assemblies: ${project.assemblies.length}</div>
        <div>Nodes: ${(project.nodes || []).length}</div>
        <div>Segments: ${(project.segments || []).length}</div>
        <div>Supports: ${(project.supports || []).length}</div>
        <div>Annotations: ${(project.annotations || []).length}</div>
      ` : '<div>No project loaded.</div>'}
      <hr>
      <div class="model-exchange-section-title">Validation</div>
      <div class="model-exchange-code">${escapeHtml(JSON.stringify(issues, null, 2))}</div>
    </div>
  `;
}

function renderBottomPanel() {
  const messages = [
    ...(store.sourceRecord?.messages || []),
    ...(store.project?.diagnostics?.messages || []),
    ...(store.lastExportResult?.losses || []),
  ];
  return `
    <div class="model-exchange-panel model-exchange-bottom">
      <div class="model-exchange-section-title">Diagnostics / Log</div>
      <div class="model-exchange-code">${escapeHtml(JSON.stringify(messages, null, 2))}</div>
    </div>
  `;
}

function renderRoot(container, rendererRef) {
  container.innerHTML = `
    <div class="model-exchange-root">
      ${renderLeftPanel()}
      ${renderCenterPanel()}
      ${renderRightPanel()}
      ${renderBottomPanel()}
    </div>
  `;

  container.querySelector('[data-action="toggle-verification"]')?.addEventListener('click', () => {
    updateViewState(store, { verificationMode: !store.viewState.verificationMode });
  });
  container.querySelector('[data-action="support-mode"]')?.addEventListener('change', (e) => {
    updateViewState(store, { supportRenderMode: e.target.value });
  });

  container.querySelector('[data-action="import-file"]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importFileIntoModelExchange(store, file);
      notify({ level: 'success', title: 'Import Success', message: `Imported ${file.name} successfully.` });
      emit(RuntimeEvents.FILE_LOADED, { name: file.name, source: 'model-exchange-tab' });
    } catch (err) {
      notify({ level: 'error', title: 'Import Failed', message: err.message, details: err });
    } finally {
      event.target.value = '';
    }
  });

  for (const [action, targetFormat] of [['export-pcf', 'PCF'], ['export-pcfx', 'PCFX'], ['export-xml', 'XML'], ['export-glb', 'GLB']]) {
    container.querySelector(`[data-action="${action}"]`)?.addEventListener('click', () => {
      try {
        const result = exportFromModelExchange(store, targetFormat);
        downloadExportResult(result, store.sourceRecord?.name || store.project?.name || 'model-exchange');
        notify({ level: 'success', title: `${targetFormat} export`, message: `${targetFormat} export completed.` });
      } catch (error) {
        notify({ level: 'error', title: `${targetFormat} export failed`, message: error.message, details: error });
      }
    });
  }

  container.querySelector('[data-action="open-config"]')?.addEventListener('click', () => triggerTabSwitch('interchange-config'));
  container.querySelector('[data-action="open-support-config"]')?.addEventListener('click', () => triggerTabSwitch('support-mapping-config'));

  const host = container.querySelector('[data-role="modelexh-preview"]');
  if (rendererRef.current) {
    try { rendererRef.current.destroy(); } catch {}
    rendererRef.current = null;
  }
  if (host) {
    try {
      rendererRef.current = new ModelexhPreviewRenderer(host);
      rendererRef.current.Modelexh_renderProject(store.project, store.viewState);
    } catch (error) {
      const message = escapeHtml(error?.message || String(error));
      host.innerHTML = `<div class="model-exchange-canvas-fallback">Modelexh preview unavailable: ${message}</div>`;
      notify({
        level: 'warning',
        title: 'Modelexh Preview',
        message: `Modelexh renderer fallback: ${error?.message || error}`,
        details: error,
      });
    }
  }
}

export function createModelExchangeTab(container) {
  ensureStylesheet();
  const rendererRef = { current: null };

  const unsubStore = store.subscribe(() => renderRoot(container, rendererRef));
  const unsubConfig = subscribeConversionConfig(() => {
    store.patch({ configSnapshot: getConversionConfig() });
  });
  const unsubSupport = subscribeSupportMappingConfig(() => {
    store.patch({ configSnapshot: getConversionConfig() });
  });

  store.patch({ configSnapshot: getConversionConfig() });
  renderRoot(container, rendererRef);

  return {
    async importSource(payload) {
      try {
        await importFileIntoModelExchange(store, payload);
        notify({ level: 'success', title: 'Import Success', message: `Imported ${payload.name || 'model'} successfully.` });
      } catch (err) {
        notify({ level: 'error', title: 'Import Failed', message: err.message, details: err });
      }
    },
    getStore() {
      return store;
    },
    destroy() {
      try { unsubStore?.(); } catch {}
      try { unsubConfig?.(); } catch {}
      try { unsubSupport?.(); } catch {}
      try { rendererRef.current?.destroy(); } catch {}
    },
  };
}

export function renderModelExchangeTab(container) {
  const api = createModelExchangeTab(container);
  return () => api.destroy?.();
}

