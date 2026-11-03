/**
 * Registers CAESAR Ver. 14 <-> 11 exclusively in the registry instance consumed
 * by legacy-adapter.js to build the 3D Model Converters > Converter dropdown.
 *
 * Do not register this converter into alternate registry module instances: that
 * creates ambiguous ownership and can surface the same action outside the
 * primary Converter selector.
 */
import { CONVERTERS as DROPDOWN_CONVERTERS } from './converter-registry.js?v=20260617-basic-glb-3';
import { run as runCiiV11V14 } from './converters/cii-v11-v14.js?v=20260816-cii-v11-v14-import-rca-1';

const CONVERTER_ID = 'cii_v11_v14';
const VERSION = '20260816-cii-v11-v14-dropdown-release-4';

function definition() {
  return {
    id: CONVERTER_ID,
    label: 'CAESAR Ver. 14 ↔ 11',
    group: 'CAESAR II',
    disabled: false,
    allowSecondaryOnly: false,
    inputs: [
      { role: 'primary', label: 'CII v11 / v14 Input', accept: '.cii,.CII', required: true },
    ],
    options: [
      { key: 'targetVersion', label: 'Target Version', type: 'select', options: ['Auto (opposite)', '11', '14'] },
      { key: 'allowLossy', label: 'Allow loss of v14-only extension fields', type: 'checkbox' },
    ],
    defaults: {
      targetVersion: 'Auto (opposite)',
      allowLossy: false,
    },
    description: 'Convert CAESAR II neutral files between v14 and v11 fixed-format dialects with target-structure validation. Legacy SIF/TEE items are preserved; v14-only extensions remain explicit opt-in losses.',
    workflow: null,
    run: runCiiV11V14,
    integrationVersion: VERSION,
  };
}

function installIntoDropdown(registry) {
  if (!Array.isArray(registry)) return false;
  const existing = registry.find((entry) => entry?.id === CONVERTER_ID);
  if (existing) {
    Object.assign(existing, definition());
    return true;
  }

  const item = definition();
  const anchor = registry.findIndex((entry) => entry?.id === 'cii_syntax_check_2019');
  if (anchor >= 0) registry.splice(anchor, 0, item);
  else registry.push(item);
  return registry.some((entry) => entry?.id === CONVERTER_ID);
}

export function installCiiV11V14Addon() {
  return installIntoDropdown(DROPDOWN_CONVERTERS);
}

export const __CII_V11_V14_ADDON_VERSION__ = VERSION;
