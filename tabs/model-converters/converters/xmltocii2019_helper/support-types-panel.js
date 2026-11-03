import {
  getAllRules,
} from '../../../../rvm-viewer/RvmSupportMapper.js';

import {
  migrateSupportMappingConfig,
  supportKindToXmlTypeFromMapping,
} from '../../../../converters/xml-cii2019-core/support-mapping-config.js';

import {
  bindUnifiedSupportMappingTable,
  renderUnifiedSupportMappingTable,
} from './support-mapping-table.js';

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function esc(value) {
  return toText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function findSupportConfigInput() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('[data-option-key="supportConfigJson"]') ||
    document.querySelector('textarea[name="supportConfigJson"]') ||
    document.querySelector('textarea#supportConfigJson');
}

function readConfigFromInput() {
  const input = findSupportConfigInput();
  if (!input) return {};
  try {
    const parsed = JSON.parse(input.value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveConfigToInput(config) {
  const input = findSupportConfigInput();
  if (!input) return false;
  input.value = JSON.stringify(config, null, 2);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}



export function xmlCiiRenderSupportMapperPhase() {
  return `
    <div id="mc-support-mapper-host" style="overflow:auto;">
      <div class="model-converters-workflow-detail-note" style="padding:16px;text-align:center;">
        Loading unified support mapping table...
      </div>
    </div>`;
}

export function bindXmlCiiSupportMapperPhase(detailEl, options = {}) {
  const host = detailEl?.querySelector('#mc-support-mapper-host');
  if (!host) return;



  const config = options.config || readConfigFromInput();

  try {
    const legacyRules = typeof getAllRules === 'function' ? getAllRules() : [];
    config.supportMapping = migrateSupportMappingConfig(config, legacyRules);
    config.supportKindToXmlType = supportKindToXmlTypeFromMapping(config.supportMapping);

    const onSaveConfig = (nextConfig) => {
      if (typeof options.onSaveConfig === 'function') {
        options.onSaveConfig(nextConfig);
      } else {
        saveConfigToInput(nextConfig);
      }
    };

    renderUnifiedSupportMappingTable(host, config);
    bindUnifiedSupportMappingTable(host, config, { onSaveConfig });
  } catch (error) {
    host.innerHTML = `
      <div class="model-converters-workflow-detail-note">
        Support mapping unavailable: ${esc(error?.message || String(error))}
      </div>`;
  }
}
