/**
 * ConverterSelector — facade for converter selection state.
 *
 * During Phase 1 this re-exports the converter registry and provides a few
 * lightweight helpers so callers do not need to import from converter-registry
 * directly.  Phase 3+ will extract full selection logic from legacy-adapter.js
 * into this module.
 */

import { CONVERTERS, getConverterById } from './converter-registry.js?v=20260617-basic-glb-2';

export { CONVERTERS, getConverterById };

/**
 * Return the default converter ID from an ordered list of converter definitions.
 * Falls back to 'rvm_to_rev' if the list is empty.
 *
 * @param {Array<{id: string, disabled?: boolean}>} converterDefs
 * @returns {string}
 */
export function getDefaultConverterId(converterDefs) {
  const enabled = Array.isArray(converterDefs)
    ? converterDefs.filter((def) => def.disabled !== true)
    : [];
  return enabled[0]?.id ?? 'rvm_to_rev';
}

/**
 * Check whether a converter ID corresponds to an enabled converter.
 *
 * @param {string} id
 * @param {Array<{id: string, disabled?: boolean}>} converterDefs
 * @returns {boolean}
 */
export function isValidConverterId(id, converterDefs) {
  const enabled = new Set(
    (Array.isArray(converterDefs) ? converterDefs : [])
      .filter((def) => def.disabled !== true)
      .map((def) => def.id),
  );
  return enabled.has(id);
}
