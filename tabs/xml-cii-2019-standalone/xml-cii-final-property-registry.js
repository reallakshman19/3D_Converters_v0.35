/** Trusted CII field schema registry; production enables only RIGID.weight. */
import { assert, layouts, numericalValue, encodeField } from './xml-cii-final-property-validation.js';
export class CiiPropertyRegistry {
  constructor() { this.entries = new Map(); }
  register(definition) {
    const d = { ...definition, widths: Array.isArray(definition?.widths) ? [...definition.widths] : null };
    assert(/^[A-Za-z][\w.]*$/.test(d.id || ''), 'invalid property identifier');
    assert(!this.entries.has(d.id), 'duplicate property ' + d.id);
    assert(Object.hasOwn(layouts, d.section), 'unsupported section');
    assert(Number.isInteger(d.lineIndex) && d.lineIndex >= 0 && d.lineIndex < layouts[d.section], 'invalid record line');
    assert(Array.isArray(d.widths) && d.widths.length > 0 &&
      d.widths.every((width) => Number.isSafeInteger(width) && width > 0 && width <= 256), 'invalid field widths');
    assert(Number.isInteger(d.fieldIndex) && d.fieldIndex >= 0 && d.fieldIndex < d.widths.length, 'unsupported field position');
    assert(d.type === 'decimal', 'unsupported property data type');
    assert(typeof d.unit === 'string' && d.unit.length > 0, 'missing unit definition');
    assert(['editable', 'read-only', 'unsupported'].includes(d.access), 'invalid property access');
    assert(typeof d.validate === 'function', 'missing property-specific validator');
    assert(typeof d.reviewAuthority === 'string' && d.reviewAuthority, 'missing review authority');
    assert(d.parser === undefined || typeof d.parser === 'function', 'invalid property parser');
    assert(d.serializer === undefined || typeof d.serializer === 'function', 'invalid property serializer');
    assert(d.readBack === undefined || typeof d.readBack === 'function', 'invalid property read-back verifier');
    assert(d.dependencies === undefined || Array.isArray(d.dependencies), 'invalid engineering dependencies');
    assert(d.zeroPolicy === undefined || ['confirm', 'allow', 'reject'].includes(d.zeroPolicy), 'invalid zero policy');
    const descriptor = Object.freeze({
      nullPolicy: 'reject',
      zeroPolicy: 'confirm',
      unitConversion: 'none: require exact pinned CII output unit',
      precisionPolicy: 'exact decimal equivalence within fixed field width',
      parser: numericalValue, serializer: encodeField,
      ...d, dependencies: Object.freeze([...(d.dependencies || [])]),
      widths: Object.freeze(d.widths),
    });
    this.entries.set(d.id, descriptor);
    return this;
  }
  get(id) { const entry = this.entries.get(id); assert(entry, 'unknown property ' + id); return entry; }
}

export const productionCiiProperties = new CiiPropertyRegistry().register({
  id: 'RIGID.weight', section: 'RIGID', lineIndex: 0, fieldIndex: 0,
  widths: [15, 13], type: 'decimal', unit: 'CII_OUTPUT_WEIGHT',
  access: 'editable', min: 0, allowNegative: false,
  reviewAuthority: 'explicit-user-confirmation',
  displayPrecision: 'original-or-exact-decimal',
  nullPolicy: 'reject', zeroPolicy: 'confirm',
  unitConversion: 'identity only; no implicit kg/N conversion',
  precisionPolicy: 'exact-decimal-equivalence',
  dependencies: [],
  readBack: (inventory, pointer, value) => inventory.rows[pointer - 1]?.weight === value,
  validate: (value) => Number.isFinite(value) && value >= 0,
});

