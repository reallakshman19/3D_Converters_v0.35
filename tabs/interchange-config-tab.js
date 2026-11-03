import {
  getConversionConfig,
  getConversionConfigMeta,
  loadConversionConfig,
  replaceConversionConfig,
  resetConversionConfig,
  subscribeConversionConfig,
} from '../interchange/config/conversion-config-store.js';
import { validateConversionConfig } from '../interchange/config/conversion-config.js';
import { downloadConversionConfig, readConversionConfigFile } from '../interchange/config/conversion-config-io.js';
import { notify } from '../diagnostics/notification-center.js';
import { renderIcon } from '../interchange/view/interchange-icons.js';

function ensureStylesheet() {
  if (document.querySelector('link[data-interchange-config-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/interchange-config-tab.css';
  link.dataset.interchangeConfigStyle = 'true';
  document.head.appendChild(link);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toCsv(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function readCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFormHtml(config, meta, validation, dirty) {
  return `
    <div class="interchange-config-root">
      <div class="interchange-config-sidebar">
        <div class="interchange-config-card">
          <div class="interchange-config-title">Conversion Config</div>
          <div class="interchange-config-subtitle">Dedicated runtime defaults for import, canonical mapping, export, and diagnostics.</div>
        </div>
        <div class="interchange-config-card">
          <div class="interchange-config-section-label">Status</div>
          <div>Source: <strong>${esc(meta?.source || 'default')}</strong></div>
          <div>Version: <strong>${esc(meta?.version || config.profile?.schemaVersion || '')}</strong></div>
          <div>Dirty: <strong>${dirty ? 'Yes' : 'No'}</strong></div>
          <div>Loaded from storage: <strong>${meta?.loadedFromStorage ? 'Yes' : 'No'}</strong></div>
        </div>
        <div class="interchange-config-card">
          <div class="interchange-config-section-label">Validation</div>
          <div class="${validation.ok ? 'ok' : 'bad'}">${validation.ok ? 'Ready to apply' : 'Fix validation errors before apply'}</div>
          <pre class="interchange-config-pre">${esc(JSON.stringify(validation, null, 2))}</pre>
        </div>
      </div>

      <div class="interchange-config-main">
        <div class="interchange-config-toolbar">
          <button class="interchange-config-btn" data-action="apply"><span class="ic-icon">${renderIcon('config')}</span><span>Apply</span></button>
          <button class="interchange-config-btn" data-action="reset"><span class="ic-icon">${renderIcon('validate')}</span><span>Reset Defaults</span></button>
          <button class="interchange-config-btn" data-action="export-json"><span class="ic-icon">${renderIcon('export')}</span><span>Export JSON</span></button>
          <label class="interchange-config-btn">
            <span class="ic-icon">${renderIcon('import')}</span><span>Import JSON</span>
            <input class="ic-hidden" type="file" data-action="import-json" accept=".json" />
          </label>
        </div>

        <div class="interchange-config-grid">
          <section class="interchange-config-card">
            <div class="interchange-config-section-label">Profile</div>
            <label>Authoritative Core <input data-field="profile.authoritativeCore" value="${esc(config.profile.authoritativeCore)}" /></label>
            <label>XML Profile <input data-field="profile.xmlProfile" value="${esc(config.profile.xmlProfile)}" /></label>
            <label>Units <input data-field="profile.units" value="${esc(config.profile.units)}" /></label>
          </section>

          <section class="interchange-config-card">
            <div class="interchange-config-section-label">Topology</div>
            <label>Node Merge Tolerance (mm) <input type="number" step="0.01" data-field="topology.nodeMergeToleranceMm" value="${esc(config.topology.nodeMergeToleranceMm)}" /></label>
            <label>Support Anchor Tolerance (mm) <input type="number" step="0.01" data-field="topology.supportAnchorToleranceMm" value="${esc(config.topology.supportAnchorToleranceMm)}" /></label>
            <label>Branch Attach Tolerance (mm) <input type="number" step="0.01" data-field="topology.branchAttachToleranceMm" value="${esc(config.topology.branchAttachToleranceMm)}" /></label>
            <label>Position Conflict Warning (mm) <input type="number" step="0.01" data-field="topology.positionConflictWarnMm" value="${esc(config.topology.positionConflictWarnMm)}" /></label>
          </section>

          <section class="interchange-config-card">
            <div class="interchange-config-section-label">ID Generation</div>
            <label>Ref Prefix <input data-field="idGeneration.refPrefix" value="${esc(config.idGeneration.refPrefix)}" /></label>
            <label>Sequence Start <input type="number" data-field="idGeneration.seqStart" value="${esc(config.idGeneration.seqStart)}" /></label>
            <label>Sequence Step <input type="number" data-field="idGeneration.seqStep" value="${esc(config.idGeneration.seqStep)}" /></label>
            <label class="checkbox"><input type="checkbox" data-field="idGeneration.requireRefSeq" ${config.idGeneration.requireRefSeq ? 'checked' : ''} /> Require Ref / Seq</label>
          </section>

          <section class="interchange-config-card">
            <div class="interchange-config-section-label">Field Mapping</div>
            <label>CA97 <input data-field="fieldMapping.caMap.CA97" value="${esc(config.fieldMapping.caMap.CA97)}" /></label>
            <label>CA98 <input data-field="fieldMapping.caMap.CA98" value="${esc(config.fieldMapping.caMap.CA98)}" /></label>
            <label>SKEY Key <input data-field="fieldMapping.skeyKey" value="${esc(config.fieldMapping.skeyKey)}" /></label>
            <label>Pipeline Ref Keys <input data-field="fieldMapping.pipelineRefKeys" value="${esc(toCsv(config.fieldMapping.pipelineRefKeys))}" /></label>
            <label>Line No Keys <input data-field="fieldMapping.lineNoKeys" value="${esc(toCsv(config.fieldMapping.lineNoKeys))}" /></label>
          </section>

          <section class="interchange-config-card">
            <div class="interchange-config-section-label">Derivation</div>
            <label class="checkbox"><input type="checkbox" data-field="derivation.computeDxDyDz" ${config.derivation.computeDxDyDz ? 'checked' : ''} /> Compute dx / dy / dz</label>
            <label class="checkbox"><input type="checkbox" data-field="derivation.computeLength" ${config.derivation.computeLength ? 'checked' : ''} /> Compute length</label>
            <label class="checkbox"><input type="checkbox" data-field="derivation.computeBendCp" ${config.derivation.computeBendCp ? 'checked' : ''} /> Compute bend CP</label>
            <label class="checkbox"><input type="checkbox" data-field="derivation.computeTeeCp" ${config.derivation.computeTeeCp ? 'checked' : ''} /> Compute tee CP</label>
            <label class="checkbox"><input type="checkbox" data-field="derivation.computeBranchLength" ${config.derivation.computeBranchLength ? 'checked' : ''} /> Compute branch length</label>
            <label class="checkbox"><input type="checkbox" data-field="derivation.computeAxisDirection" ${config.derivation.computeAxisDirection ? 'checked' : ''} /> Compute axis direction</label>
            <label>CP Strategy <input data-field="derivation.cpStrategy" value="${esc(toCsv(config.derivation.cpStrategy))}" /></label>
            <label>Provenance Version <input data-field="derivation.provenanceVersion" value="${esc(config.derivation.provenanceVersion)}" /></label>
          </section>

          <section class="interchange-config-card">
            <div class="interchange-config-section-label">Export Policy</div>
            <label>Mode <select data-field="exportPolicy.mode">
              <option value="normalized" ${config.exportPolicy.mode === 'normalized' ? 'selected' : ''}>normalized</option>
              <option value="roundtrip" ${config.exportPolicy.mode === 'roundtrip' ? 'selected' : ''}>roundtrip</option>
            </select></label>
            <label>Precedence <input data-field="exportPolicy.precedence" value="${esc(toCsv(config.exportPolicy.precedence))}" /></label>
            <label class="checkbox"><input type="checkbox" data-field="exportPolicy.emitLossContracts" ${config.exportPolicy.emitLossContracts ? 'checked' : ''} /> Emit loss contracts</label>
            <label class="checkbox"><input type="checkbox" data-field="exportPolicy.strictMode" ${config.exportPolicy.strictMode ? 'checked' : ''} /> Strict mode</label>
          </section>

          <section class="interchange-config-card">
            <div class="interchange-config-section-label">Annotation + Diagnostics</div>
            <label class="checkbox"><input type="checkbox" data-field="annotation.emitMessageCircleHelpers" ${config.annotation.emitMessageCircleHelpers ? 'checked' : ''} /> Emit MESSAGE-CIRCLE helpers</label>
            <label class="checkbox"><input type="checkbox" data-field="annotation.emitMessageSquareHelpers" ${config.annotation.emitMessageSquareHelpers ? 'checked' : ''} /> Emit MESSAGE-SQUARE helpers</label>
            <label class="checkbox"><input type="checkbox" data-field="diagnostics.warnOnFallback" ${config.diagnostics.warnOnFallback ? 'checked' : ''} /> Warn on fallback</label>
            <label class="checkbox"><input type="checkbox" data-field="diagnostics.warnOnMissingCp" ${config.diagnostics.warnOnMissingCp ? 'checked' : ''} /> Warn on missing CP</label>
            <label class="checkbox"><input type="checkbox" data-field="diagnostics.warnOnDroppedFields" ${config.diagnostics.warnOnDroppedFields ? 'checked' : ''} /> Warn on dropped fields</label>
          </section>
        </div>
      </div>
    </div>
  `;
}

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  while (parts.length > 1) {
    const part = parts.shift();
    cursor[part] = cursor[part] && typeof cursor[part] === 'object' ? cursor[part] : {};
    cursor = cursor[part];
  }
  cursor[parts[0]] = value;
}

function readFormDraft(container, baseline) {
  const draft = JSON.parse(JSON.stringify(baseline));
  for (const input of container.querySelectorAll('[data-field]')) {
    const path = input.dataset.field;
    let value;
    if (input.type === 'checkbox') value = !!input.checked;
    else if (input.type === 'number') value = Number(input.value);
    else value = input.value;

    if (path.endsWith('pipelineRefKeys') || path.endsWith('lineNoKeys') || path.endsWith('precedence') || path.endsWith('cpStrategy')) {
      value = readCsv(value);
    }
    setByPath(draft, path, value);
  }
  return draft;
}

export function renderInterchangeConfigTab(container) {
  ensureStylesheet();
  let baseline = getConversionConfig();
  let meta = getConversionConfigMeta();
  let draft = JSON.parse(JSON.stringify(baseline));

  function render() {
    const validation = validateConversionConfig(draft);
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
    container.innerHTML = buildFormHtml(draft, meta, validation, dirty);

    container.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        draft = readFormDraft(container, draft);
        render();
      });
      input.addEventListener('change', () => {
        draft = readFormDraft(container, draft);
        render();
      });
    });

    container.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
      try {
        const latest = readFormDraft(container, draft);
        const result = replaceConversionConfig(latest, 'interchange-config-tab');
        baseline = result.config;
        draft = JSON.parse(JSON.stringify(result.config));
        meta = getConversionConfigMeta();
        notify({ level: 'success', title: 'Conversion config', message: 'Conversion config applied.' });
        render();
      } catch (error) {
        notify({ level: 'error', title: 'Conversion config', message: error.message, details: error });
      }
    });

    container.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      const result = resetConversionConfig();
      baseline = result.config;
      draft = JSON.parse(JSON.stringify(result.config));
      meta = getConversionConfigMeta();
      notify({ level: 'info', title: 'Conversion config', message: 'Defaults restored.' });
      render();
    });

    container.querySelector('[data-action="export-json"]')?.addEventListener('click', () => {
      downloadConversionConfig(draft);
      notify({ level: 'success', title: 'Conversion config', message: 'Config JSON exported.' });
    });

    container.querySelector('[data-action="import-json"]')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = await readConversionConfigFile(file);
        draft = JSON.parse(JSON.stringify(parsed.config));
        notify({ level: 'success', title: 'Conversion config', message: `Imported ${file.name}.` });
        render();
      } catch (error) {
        notify({ level: 'error', title: 'Conversion config', message: `Failed to import ${file.name}: ${error.message}`, details: error });
      } finally {
        event.target.value = '';
      }
    });
  }

  loadConversionConfig();
  baseline = getConversionConfig();
  meta = getConversionConfigMeta();
  draft = JSON.parse(JSON.stringify(baseline));
  const unsubscribe = subscribeConversionConfig(() => {
    baseline = getConversionConfig();
    meta = getConversionConfigMeta();
    draft = JSON.parse(JSON.stringify(baseline));
    render();
  });
  render();
  return () => unsubscribe?.();
}
