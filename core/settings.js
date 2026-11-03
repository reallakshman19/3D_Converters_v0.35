const DEFAULT_PCF_MAPPING = {
  'T1': 'COMPONENT-ATTRIBUTE2',
  'T2': '',
  'T3': '',
  'T4': '',
  'T5': '',
  'T6': '',
  'T7': '',
  'T8': '',
  'T9': '',
  'P1': 'COMPONENT-ATTRIBUTE1',
  'P2': '',
  'P3': '',
  'P4': '',
  'P5': '',
  'P6': '',
  'P7': '',
  'P8': '',
  'P9': '',
  'PHYDRO': 'COMPONENT-ATTRIBUTE10',
  'MATERIAL': 'COMPONENT-ATTRIBUTE3',
  'WALLTHK': 'COMPONENT-ATTRIBUTE4',
  'INSULTHK': 'COMPONENT-ATTRIBUTE5',
  'INSULDENS': 'COMPONENT-ATTRIBUTE6',
  'CORRALLW': 'COMPONENT-ATTRIBUTE7',
  'WEIGHT': 'COMPONENT-ATTRIBUTE8',
  'FLUIDDENS': 'COMPONENT-ATTRIBUTE9',
  'LINENUM': 'PIPELINE-REFERENCE',
  'CLADTHK': '',
  'CLADDENS': '',
  'REFRTHK': '',
  'REFRDENS': ''
};

function getStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJsonSetting(key, fallback) {
  const storage = getStorage();
  const saved = storage?.getItem?.(key);
  if (saved) {
    try { return JSON.parse(saved); } catch {}
  }
  return { ...fallback };
}

function writeJsonSetting(key, value) {
  const storage = getStorage();
  if (!storage?.setItem) return;
  storage.setItem(key, JSON.stringify(value));
}

function readTextSetting(key, fallback = '') {
  const storage = getStorage();
  return storage?.getItem?.(key) || fallback;
}

function writeTextSetting(key, value) {
  const storage = getStorage();
  if (!storage?.setItem) return;
  storage.setItem(key, value);
}

export function getPcfMapping() {
  return readJsonSetting('pcfMapping', DEFAULT_PCF_MAPPING);
}

export function savePcfMapping(mapping) {
  writeJsonSetting('pcfMapping', mapping);
}

export function getCaesarMatchAttribute() {
  return readTextSetting('caesarMatchAttribute', 'lineNo');
}

export function saveCaesarMatchAttribute(attr) {
  writeTextSetting('caesarMatchAttribute', attr);
}

// ─── Support Kind Map ─────────────────────────────────────────────────────────
// Maps SKEY values (PCF support catalog codes) → kind: REST | GUIDE | ANCHOR | SPRING
// Used as Tier 1.5 in _resolveSupportKind (after explicit SUPPORT-KIND, before direction heuristic)

const DEFAULT_SUPPORT_KIND_MAP = {
  'CA150': 'REST',
  'CA100': 'GUIDE',
};

export function getSupportKindMap() {
  return readJsonSetting('supportKindMap', DEFAULT_SUPPORT_KIND_MAP);
}

export function saveSupportKindMap(map) {
  writeJsonSetting('supportKindMap', map);
}
