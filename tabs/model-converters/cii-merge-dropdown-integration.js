import { installCiiMergeAutoOffset } from './cii-merge-auto-offset.js?v=20260816-cii-auto-offset-1';

const INTEGRATION_VERSION = '20260816-cii-merge-dropdown-2';

const TOOL_DEFS = Object.freeze([
  Object.freeze({
    id: 'cii_ver11_merge_tool',
    label: 'CII Ver 11 Merge Tool',
    launcherSelector: '[data-cii-v11-merge-launcher]',
    buttonSelector: '[data-cii-v11-open]',
  }),
  Object.freeze({
    id: 'cii_ver14_merge_tool',
    label: 'CII Ver 14 Merge Tool',
    launcherSelector: '[data-cii-v14-merge-launcher]',
    buttonSelector: '[data-cii-v14-open]',
  }),
]);

function isMergeToolOption(option) {
  return option?.dataset?.ciiMergeTool === 'true';
}

function firstNormalOption(select) {
  return Array.from(select?.options || []).find((option) => !option.disabled && !isMergeToolOption(option)) || null;
}

function validFallback(select, value) {
  if (!value) return '';
  const option = Array.from(select.options || []).find((candidate) => candidate.value === value);
  return option && !option.disabled && !isMergeToolOption(option) ? option.value : '';
}

export function installCiiMergeDropdownIntegration(container) {
  if (!container) return false;
  const select = container.querySelector('#model-converters-select');
  if (!select) return false;
  if (select.dataset.ciiMergeDropdownIntegration === INTEGRATION_VERSION) return true;

  const launchers = new Map();
  for (const tool of TOOL_DEFS) {
    const host = container.querySelector(tool.launcherSelector);
    const button = host?.querySelector(tool.buttonSelector) || null;
    if (!host || !button) return false;
    launchers.set(tool.id, button);
  }

  // The old add-ons own the already-qualified modal/runtime behavior. Retain the
  // detached buttons as launch callbacks, but remove their standalone cards so
  // the Converter dropdown becomes the only visible entry point.
  for (const tool of TOOL_DEFS) {
    container.querySelector(tool.launcherSelector)?.remove();
    if (!select.querySelector(`option[value="${tool.id}"]`)) {
      const option = document.createElement('option');
      option.value = tool.id;
      option.textContent = tool.label;
      option.dataset.ciiMergeTool = 'true';
      select.appendChild(option);
    }
  }

  const selectedOption = select.options[select.selectedIndex];
  const initialFallback = !isMergeToolOption(selectedOption)
    ? select.value
    : (firstNormalOption(select)?.value || '');
  select.dataset.ciiMergeFallbackValue = initialFallback;
  select.dataset.ciiMergeDropdownIntegration = INTEGRATION_VERSION;

  // Auto-offset is deliberately attached to the dropdown-owned merge modals.
  // It does not create another launcher/card or bypass the Python merge engines.
  installCiiMergeAutoOffset();

  select.addEventListener('change', (event) => {
    const selected = select.options[select.selectedIndex];
    if (!isMergeToolOption(selected)) {
      select.dataset.ciiMergeFallbackValue = select.value;
      return;
    }

    // Intercept before legacy-adapter.js sees an ID it does not own.
    event.preventDefault();
    event.stopImmediatePropagation();

    const toolId = select.value;
    const fallback = validFallback(select, select.dataset.ciiMergeFallbackValue)
      || firstNormalOption(select)?.value
      || '';
    if (fallback) select.value = fallback;

    const launchButton = launchers.get(toolId);
    if (!launchButton) {
      console.warn(`[CII Merge Dropdown] Missing launcher for ${toolId}.`);
      return;
    }
    launchButton.click();
  }, true);

  return true;
}

export const __CII_MERGE_DROPDOWN_INTEGRATION_VERSION__ = INTEGRATION_VERSION;
