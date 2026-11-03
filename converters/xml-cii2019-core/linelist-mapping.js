import { resolveLineListDensity } from './line-density-resolver.js';

export const FIELD_RULES = {
  lineSeqNo: {
    all: [
      ['line number', 'line no', 'line no.', 'lineno', 'line', 'seq', 'sequence', 'no.']
    ],
    reject: [
      /(piping|construction|pipe)\s*class/i,
      /\bspec\b/i,
      /rating/i,
      /material/i,
      /pressure/i,
      /temp/i,
      /density/i,
      /fluid/i
    ]
  },

  lineKey1: {
    all: [
      ['service', 'fluid']
    ],
    reject: [
      /piping\s*class/i,
      /pipe\s*class/i,
      /line\s*(number|no\.?)/i,
      /rating/i,
      /pressure/i,
      /temp/i,
      /density/i
    ]
  },

  lineKey2: {
    all: [
      ['line number', 'line no', 'line no.', 'lineno', 'line', 'seq', 'sequence']
    ],
    reject: [
      /(piping|construction|pipe)\s*class/i,
      /\bspec\b/i,
      /rating/i,
      /material/i,
      /pressure/i,
      /temp/i,
      /density/i,
      /fluid/i,
      /critical/i,
      /stress/i,
      /\bempty\b/i
    ],
    requireHeaderMatch: true
  },

  pipingClass: {
    all: [
      ['piping', 'pipe'],
      ['class', 'spec']
    ],
    reject: [
      /construction\s*class/i,
      /\bconstruction\b/i,
      /line\s*(number|no\.?)/i,
      /\bservice\b/i,
      /\bfluid\b/i,
      /rating/i,
      /material/i,
      /pressure/i,
      /temp/i,
      /density/i,
      /insulation/i
    ]
  },

  rating: {
    all: [
      ['rating']
    ],
    reject: [
      /piping\s*class/i,
      /pipe\s*class/i,
      /material/i,
      /pressure/i,
      /temp/i,
      /density/i,
      /line/i
    ]
  },

  material: {
    all: [
      ['material', 'mat', 'moc']
    ],
    reject: [
      /material\s*code/i,
      /mat\.?\s*code/i,
      /\bcode\b/i,
      /piping\s*class/i,
      /pipe\s*class/i,
      /construction\s*class/i,
      /insulation\s*material/i,
      /insulation/i,
      /rating/i,
      /pressure/i,
      /temp/i,
      /density/i
    ]
  },

  convertedBore: {
    all: [
      ['bore', 'size', 'dn', 'nb', 'nps', 'nominal pipe', 'nominal bore']
    ],
    reject: [
      /class/i,
      /spec/i,
      /rating/i,
      /pressure/i,
      /temp/i,
      /density/i,
      /line/i
    ]
  },

  p1: {
    all: [
      ['p1', 'pressure', 'pr'],
      ['p1', 'max', 'design']
    ],
    reject: [
      /test\s*pressure/i,
      /hydro/i,
      /hydrostatic/i,
      /proof/i,
      /temp/i,
      /temperature/i,
      /density/i,
      /fluid/i,
      /line\s*(number|no\.?)/i,
      /piping\s*class/i
    ]
  },

  t1: {
    all: [
      ['t1', 'temp', 'temperature'],
      ['t1', 'max', 'design']
    ],
    reject: [
      /min/i,
      /pressure/i,
      /test/i,
      /hydro/i,
      /density/i
    ]
  },

  t2: {
    all: [
      ['t2', 'temp', 'temperature']
    ],
    optional: [
      ['normal', 'operating']
    ],
    reject: [
      /max/i,
      /min/i,
      /pressure/i,
      /test/i,
      /hydro/i,
      /density/i
    ]
  },

  t3: {
    all: [
      ['t3', 'temp', 'temperature'],
      ['t3', 'min']
    ],
    reject: [
      /max/i,
      /pressure/i,
      /test/i,
      /hydro/i,
      /density/i
    ]
  },

  hydroPressure: {
    all: [
      ['pressure', 'pr'],
      ['hydo', 'hydro', 'test']
    ],
    reject: [
      /temp/i,
      /temperature/i,
      /density/i,
      /line\s*(number|no\.?)/i,
      /piping\s*class/i
    ]
  },

  insThk: {
    all: [
      ['insulation', 'ins'],
      ['thickness', 'thk']
    ],
    reject: [
      /insulation\s*type/i
    ]
  },

  density: {
    all: [
      ['density', 'den', 'kg/m', 'kg/m3', 'kg/cm', 'kg/cm3', 'kg']
    ],
    reject: [
      /mixed/i,
      /gas/i,
      /liquid/i,
      /\bliq\b/i,
      /phase/i,
      /pressure/i,
      /temp/i
    ]
  },

  densityMixed: {
    all: [
      ['mixed'],
      ['density', 'den', 'kg/m', 'kg/m3', 'kg/cm', 'kg/cm3', 'kg']
    ],
    reject: [
      /gas/i,
      /liquid/i,
      /\bliq\b/i
    ]
  },

  densityGas: {
    all: [
      ['gas'],
      ['density', 'den', 'kg/m', 'kg/m3', 'kg/cm', 'kg/cm3', 'kg']
    ],
    reject: [
      /mixed/i,
      /liquid/i,
      /\bliq\b/i
    ]
  },

  densityLiquid: {
    all: [
      ['liquid', 'liq'],
      ['density', 'den', 'kg/m', 'kg/m3', 'kg/cm', 'kg/cm3', 'kg']
    ],
    reject: [
      /mixed/i,
      /gas/i
    ]
  },

  phase: {
    all: [
      ['fluid', 'phase', 'medium']
    ],
    reject: []
  }
};

export const DETECTION_ORDER = [
  'lineKey1',
  'lineKey2',
  'pipingClass',
  'rating',
  'material',
  'convertedBore',
  'p1',
  't1',
  't2',
  't3',
  'hydroPressure',
  'insThk',
  'density',
  'densityMixed',
  'densityGas',
  'densityLiquid',
  'phase'
];

export const LINE_LIST_PROCESS_VALUE_ALIASES = Object.freeze({
  p1: Object.freeze(['p1', 'P1', 'Pressure1', 'Design Pressure', 'Design Pres', 'DesignPressure', 'Pressure Design', 'Pressure Max kPa(g)', 'Pressure Max', 'PressureMax', 'P1 / Design Pressure', 'P1 / Design Pres', 'P1 Design Pressure', 'P1 Design Pres']),
  hydroPressure: Object.freeze(['hydroPressure', 'HydroPressure', 'hydro_pressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Hyd. Test Pressure', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure Test', 'Proof Pressure', 'Hydro/Test Pressure', 'Pressure2']),
  t1: Object.freeze(['t1', 'T1', 'Temperature1', 'Design Temp', 'Design Temperature', 'Temp Max C', 'Temp Max', 'T1 (C)', 'T1 C']),
  t2: Object.freeze(['t2', 'T2', 'Temperature2', 'Temperature 2', 'Operating Temp', 'Operating Temperature', 'Temp. C', 'Temp C', 'T2 (C)', 'T2 C']),
  t3: Object.freeze(['t3', 'T3', 'Temperature3', 'Temperature 3', 'Temp Min C', 'Temp Min', 'Minimum Temp', 'Min Temp', 'T3 (C)', 'T3 C']),
  density: Object.freeze(['density', 'Density', 'DENSITY', 'FluidDensity', 'Fluid Density', 'Density kg/m3', 'kg/m3']),
  densityMixed: Object.freeze(['densityMixed', 'Density Mixed', 'Mixed Density', 'Mixed kg/m3', 'Density (Mixed)', 'Mixed']),
  densityGas: Object.freeze(['densityGas', 'Density Gas', 'Gas Density', 'Gas kg/m3', 'Density (Gas)', 'Gas']),
  densityLiquid: Object.freeze(['densityLiquid', 'Density Liquid', 'Liquid Density', 'Liquid kg/m3', 'Density (Liquid)', 'Liquid', 'Liq Density']),
  phase: Object.freeze(['phase', 'Phase', 'PHASE', 'Fluid Phase', 'Medium Phase', 'Medium', 'State'])
});

export function canon(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/º/g, '°')
    .replace(/³/g, '3')
    .replace(/[_\-()[\]/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clean(value) {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '');
}

export function readRowValue(row, keys) {
  if (!row || !keys) return '';
  for (const k of keys) {
    const value = k ? (row[k] ?? row._raw?.[k]) : '';
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export function buildColumnProbe(key, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const vals = [key];
  for (let i = 0; i < Math.min(5, safeRows.length); i++) {
    const v = safeRows[i]?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      vals.push(String(v).trim());
    }
  }
  // Keep pipe delimiters in the probe so table previews like
  // "3 | Line number | 8010125 | 8010126" can be split and compared
  // segment-by-segment instead of only as one flattened string.
  return vals.join(' | ');
}

export function getAllColumnKeys(rows) {
  return Array.from(
    new Set((Array.isArray(rows) ? rows : []).flatMap((row) => Object.keys(row || {})))
  );
}

export function hasAlias(probe, alias) {
  const p = canon(probe);
  const a = canon(alias);

  if (!a) return false;

  // Short aliases like "pr", "den", "liq", "ins" should be word-boundary matched.
  if (/^[a-z0-9]+$/.test(a) && a.length <= 4) {
    return new RegExp(`\\b${a}\\b`, 'i').test(p);
  }

  return p.includes(a);
}

export function hasAny(probe, aliases) {
  return aliases.some((alias) => hasAlias(probe, alias));
}

export function groupsMatch(probe, groups) {
  return groups.every((group) => hasAny(probe, group));
}

export function rejectMatch(probe, rejects) {
  return rejects.some((rx) => rx.test(probe));
}

function directProcessHeaderMatch(field, probe) {
  const text = canon(probe);
  if (field === 'p1') return /\bp\s*1\b/.test(text) && /(pressure|pres|design|pr\b)/i.test(text);
  if (field === 't1') return /\bt\s*1\b|\btemperature\s*1\b/i.test(text);
  if (field === 't2') return /\bt\s*2\b|\btemperature\s*2\b/i.test(text);
  if (field === 't3') return /\bt\s*3\b|\btemperature\s*3\b/i.test(text);
  return false;
}

export function splitPipeSegments(value) {
  return String(value ?? '')
    .split(/\s*\|\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function pipeSegmentMatchesField(field, value) {
  const rule = FIELD_RULES[field];
  if (!rule) return false;
  return splitPipeSegments(value).some((segment) => {
    if (!groupsMatch(segment, rule.all || [])) return false;
    if (rejectMatch(segment, rule.reject || [])) return false;
    return true;
  });
}

export function isValidFieldMatch(field, probe, key) {
  const rule = FIELD_RULES[field];
  if (!rule) return false;

  if (rejectMatch(probe, rule.reject || [])) return false;
  if (directProcessHeaderMatch(field, probe)) return true;
  if (!groupsMatch(probe, rule.all || [])) return false;

  // If the rule requires a header match, the column key itself must satisfy
  // the AND-groups. For lineKey2, also allow pipe-delimited preview/probe
  // segments such as "3 | Line number | 8010125 | 8010126" to match the
  // semantic header segment without accepting numeric-only sample values.
  if (rule.requireHeaderMatch && key !== undefined) {
    const header = canon(key);
    const headerMatches = groupsMatch(header, rule.all || []) && !rejectMatch(header, rule.reject || []);
    const pipeHeaderMatches = field === 'lineKey2' && pipeSegmentMatchesField(field, probe);
    if (!headerMatches && !pipeHeaderMatches) {
      return false;
    }
  }

  return true;
}

export function scoreField(field, key, rows) {
  const rule = FIELD_RULES[field];
  if (!rule) return -999;

  const probe = buildColumnProbe(key, rows);
  const header = canon(key);

  if (!isValidFieldMatch(field, probe, key)) return -999;

  let score = 200;

  // Stronger score if the header itself satisfies the AND-groups.
  if (groupsMatch(header, rule.all || []) && !rejectMatch(header, rule.reject || [])) {
    score += 90;
  }
  if (directProcessHeaderMatch(field, key) || directProcessHeaderMatch(field, probe)) score += 120;

  // Small boost for each group hit in header.
  for (const group of rule.all || []) {
    if (hasAny(header, group)) score += 15;
  }

  // Pipe-delimited header/probe segment boost, e.g. "3 | Line number | 8010125".
  if (field === 'lineKey2' && pipeSegmentMatchesField(field, probe)) score += 80;

  // Optional group boost, e.g. normal/operating for T2.
  for (const group of rule.optional || []) {
    if (hasAny(probe, group)) score += 35;
  }

  // Field-specific boosts.
  if (field === 'pipingClass' && /\bpiping\s*class\b/i.test(probe)) score += 180;
  if (field === 'pipingClass' && /\bpipe\s*class\b/i.test(probe)) score += 160;
  if (field === 'pipingClass' && /\bpiping\s*spec\b|\bpipe\s*spec\b/i.test(probe)) score += 130;

  if (field === 'p1' && /design\s*pressure|pressure\s*design/i.test(probe)) score += 140;
  if (field === 'p1' && /max/i.test(probe) && /pressure/i.test(probe)) score += 100;

  if (field === 'hydroPressure' && /(test\s*pressure|hydro\s*pressure|hydrostatic\s*pressure)/i.test(probe)) {
    score += 160;
  }

  return score;
}

export function shouldKeepExisting(field, key, rows) {
  if (!key) return false;

  const probe = buildColumnProbe(key, rows);

  if (!isValidFieldMatch(field, probe, key)) return false;

  return scoreField(field, key, rows) >= 200;
}

export function detectLineListFieldMap(rows, existingMap = {}, config = null) {
  const keys = getAllColumnKeys(rows);
  const result = { ...existingMap };
  const claimed = new Set();
  const customAliases = config?.customMappingAliases || {};

  // First, map any fields that have custom aliases defined in the config.
  // We do this first so they are claimed and won't be overridden.
  for (const field of DETECTION_ORDER) {
    const customAlias = customAliases[field];
    if (!customAlias) continue;

    // Find a column key that matches the custom alias.
    // If it's a standard header (non-__EMPTY), check exact header match.
    // Otherwise, check if the first row's cell value equals the custom alias.
    for (const key of keys) {
      if (claimed.has(key)) continue;

      const headerText = String(key).trim();
      const firstRowVal = rows[0]?.[key] !== undefined && rows[0]?.[key] !== null ? String(rows[0][key]).trim() : '';

      if (headerText === customAlias || firstRowVal === customAlias) {
        result[field] = key;
        claimed.add(key);
        break;
      }
    }
  }

  // Validate existing mappings.
  for (const [field, key] of Object.entries(result)) {
    if (claimed.has(key)) continue;
    if (FIELD_RULES[field] && shouldKeepExisting(field, key, rows)) {
      claimed.add(key);
    } else if (FIELD_RULES[field]) {
      delete result[field];
    }
  }

  // Detect unmapped fields.
  for (const field of DETECTION_ORDER) {
    if (result[field]) continue; // already mapped (e.g. by custom alias or kept existing)

    let bestKey = '';
    let bestScore = 0;

    for (const key of keys) {
      if (claimed.has(key) && result[field] !== key) continue;

      const score = scoreField(field, key, rows);

      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (bestKey && bestScore >= 200) {
      result[field] = bestKey;
      claimed.add(bestKey);
    }
  }

  // Density fallback.
  if (!result.density && result.densityMixed) {
    result.density = result.densityMixed;
  }

  // P1 must never equal Hydro.
  if (result.p1 && result.hydroPressure && result.p1 === result.hydroPressure) {
    delete result.p1;
  }

  return result;
}

export function computeLineNoKey(row, fieldMap) {
  const key1 = readRowValue(row, [fieldMap.lineKey1, 'lineKey1', 'Service']);
  const key2 = readRowValue(row, [fieldMap.lineKey2, 'lineKey2', 'Line number', 'Line Number']);

  const composite = `${clean(key1)}${clean(key2)}`;

  if (
    composite &&
    !/^service\s*line\s*(number|no)?$/i.test(composite) &&
    !/pipingclass/i.test(composite)
  ) {
    return composite;
  }

  return readRowValue(row, [
    fieldMap.lineNoKey,
    fieldMap.lineNo,
    fieldMap.lineSeqNo,
    'lineNoKey',
    'lineNo',
    'lineKey',
    'lineSeqNo',
    'Line No',
    'Line Number',
    'ColumnX1'
  ]);
}

export function cleanMaterialText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function cleanMaterialCode(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function mapMaterialTextToCiiCode(materialText, materialMap) {
  const key = cleanMaterialText(materialText);
  if (!key) return null;
  const rows = Array.isArray(materialMap) ? materialMap : [];
  return rows.find((row) => {
    const candidates = [
      row.material,
      row.Material,
      row.materialName,
      row.Material_Name,
      row.description,
      row.Description,
      row.name,
      row.Name
    ];
    return candidates.some((value) => cleanMaterialText(value) === key);
  }) || null;
}

export function readNumericRowValue(row, keys) {
  const raw = readRowValue(row, keys);
  const match = String(raw ?? '').match(/[-+]?\d*\.?\d+/);
  return match ? Number(match[0]) : null;
}

export function normalizeLineListRow(row, fieldMap, index) {
  const lineNoKey = computeLineNoKey(row, fieldMap);
  const materialText = readRowValue(row, [
    fieldMap.material,
    'material',
    'Material',
    'MATERIAL',
    'MOC',
    'Pipe Material',
    'Material_Name'
  ]);

  const normalized = {
    ...row,
    _sourceRowIndex: row?._rowIndex || (index !== undefined ? index + 1 : 1),
    _raw: row,

    lineNoKey,
    lineNo: lineNoKey,
    lineKey: lineNoKey,

    pipingClass: readRowValue(row, [fieldMap.pipingClass]),
    rating: readRowValue(row, [fieldMap.rating]),
    material: cleanMaterialText(materialText),
    convertedBore: readRowValue(row, [fieldMap.convertedBore]),

    p1: readRowValue(row, [fieldMap.p1, ...LINE_LIST_PROCESS_VALUE_ALIASES.p1]),
    t1: readRowValue(row, [fieldMap.t1, ...LINE_LIST_PROCESS_VALUE_ALIASES.t1]),
    t2: readRowValue(row, [fieldMap.t2, ...LINE_LIST_PROCESS_VALUE_ALIASES.t2]),
    t3: readRowValue(row, [fieldMap.t3, ...LINE_LIST_PROCESS_VALUE_ALIASES.t3]),
    hydroPressure: readRowValue(row, [fieldMap.hydroPressure, ...LINE_LIST_PROCESS_VALUE_ALIASES.hydroPressure]),
    insThk: readRowValue(row, [fieldMap.insThk]),
    density: readRowValue(row, [fieldMap.density, ...LINE_LIST_PROCESS_VALUE_ALIASES.density]),
    densityMixed: readRowValue(row, [fieldMap.densityMixed, ...LINE_LIST_PROCESS_VALUE_ALIASES.densityMixed]),
    densityGas: readRowValue(row, [fieldMap.densityGas, ...LINE_LIST_PROCESS_VALUE_ALIASES.densityGas]),
    densityLiquid: readRowValue(row, [fieldMap.densityLiquid, ...LINE_LIST_PROCESS_VALUE_ALIASES.densityLiquid]),
    phase: readRowValue(row, [fieldMap.phase, ...LINE_LIST_PROCESS_VALUE_ALIASES.phase])
  };

  const densityInfo = resolveLineListDensity(normalized, null);
  normalized.density = densityInfo.value || '';
  normalized.densitySource = densityInfo.source || 'none';

  return normalized;
}
