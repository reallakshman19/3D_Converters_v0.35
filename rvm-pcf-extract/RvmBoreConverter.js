/**
 * RvmBoreConverter.js
 * Wave 4 - converts raw bore strings/numbers to DN (mm).
 * Pure JS: no DOM, no three.js.
 *
 * Inputs: RVM node attributes, optional line-key fallback values, raw bore values.
 * Outputs: normalized bore conversion result with source and mapping diagnostics.
 * Fallback: DTXR support text is ignored; unresolved bore can fall back to line-key parsing.
 */

const NPS_TO_DN = {
  '1/8': 6,
  '1/4': 8,
  '3/8': 10,
  '1/2': 15,
  '3/4': 20,
  '1': 25,
  '1-1/4': 32,
  '1-1/2': 40,
  '2': 50,
  '2-1/2': 65,
  '3': 80,
  '4': 100,
  '5': 125,
  '6': 150,
  '8': 200,
  '10': 250,
  '12': 300,
  '14': 350,
  '16': 400,
  '18': 450,
  '20': 500,
  '24': 600,
  '28': 700,
  '30': 750,
  '32': 800,
  '36': 900,
  '40': 1000,
  '42': 1050,
  '48': 1200,
};

const OD_TO_DN = [
  [10.3, 6],
  [13.7, 8],
  [17.1, 10],
  [21.3, 15],
  [26.7, 20],
  [33.4, 25],
  [42.2, 32],
  [48.3, 40],
  [60.3, 50],
  [73.0, 65],
  [88.9, 80],
  [114.3, 100],
  [141.3, 125],
  [168.3, 150],
  [219.1, 200],
  [273.0, 250],
  [273.1, 250],
  [323.8, 300],
  [323.9, 300],
  [355.6, 350],
  [406.4, 400],
  [457.0, 450],
  [457.2, 450],
  [508.0, 500],
  [609.6, 600],
  [610.0, 600],
  [711.0, 700],
  [762.0, 750],
];

const BORE_ATTR_KEYS = [
  'HBOR',
  'TBOR',
  'ABORE',
  'LBORE',
  'BORE',
  'NPS',
  'DN',
  'OD',
  'Size',
  'NS',
  'NB',
  'DBOR',
  'NBORE',
  'DTXR',
];

const LINE_KEY_ATTR_KEYS = [
  'LINEKEY',
  'LINE_KEY',
  'LINE_NO_KEY',
  'LINENO',
  'LINE_NO',
  'LINE_NUMBER',
  'LINENUMBER',
  'PIPELINE',
  'PIPELINE_REF',
  'PIPELINE-REFERENCE',
  'LINE',
];

const DTXR_NON_BORE_RX =
  /\b(GUIDE|LINE\s*STOP|LINESTOP|LIMIT|REST|RESTING|SHOE|SUPPORT|ANCHOR|FIXED|BASE\s*PLATE|BP)\b/i;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normaliseFraction(str) {
  const whole = str.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (whole) {
    return `${parseInt(whole[1], 10)}-${parseInt(whole[2], 10)}/${parseInt(whole[3], 10)}`;
  }

  const frac = str.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    return `${frac[1]}/${frac[2]}`;
  }

  const integer = str.match(/^(\d+(?:\.\d+)?)$/);
  if (integer) {
    const value = parseFloat(integer[1]);
    return Number.isInteger(value) ? String(Math.round(value)) : null;
  }

  return null;
}

function parseMmText(value) {
  const text = clean(value);
  const mmMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*MM$/i);
  if (mmMatch) {
    const dn = Number(mmMatch[1]);
    return Number.isFinite(dn) ? dn : null;
  }
  return null;
}

function findAttrValue(attrs, keys) {
  const attrKeys = Object.keys(attrs || {});

  for (const key of keys) {
    const upper = key.toUpperCase();
    const found = attrKeys.find(k => k.toUpperCase() === upper);

    if (found !== undefined && attrs[found] != null && attrs[found] !== '') {
      return attrs[found];
    }
  }

  return null;
}

function okResult(rawBore, dn, source, mapping) {
  return {
    bore: rawBore,
    convertedBore: dn,
    convertedBoreStatus: 'OK',
    convertedBoreSource: source,
    boreMapping: mapping,
  };
}

function emptyResult(rawBore) {
  return {
    bore: rawBore,
    convertedBore: null,
    convertedBoreStatus: 'UNRESOLVED',
    convertedBoreSource: null,
    boreMapping: null,
  };
}

export class RvmBoreConverter {
  findRawBore(attrs) {
    const attrKeys = Object.keys(attrs || {});

    for (const key of BORE_ATTR_KEYS) {
      const upper = key.toUpperCase();
      const found = attrKeys.find(k => k.toUpperCase() === upper);

      if (found !== undefined && attrs[found] != null && attrs[found] !== '') {
        if (upper === 'DTXR' && DTXR_NON_BORE_RX.test(String(attrs[found]))) {
          continue;
        }

        return attrs[found];
      }
    }

    return null;
  }

  findLineKey(attrs, fallbackValues = []) {
    const direct = findAttrValue(attrs, LINE_KEY_ATTR_KEYS);
    if (direct != null) return direct;

    for (const value of fallbackValues) {
      if (clean(value)) return value;
    }

    return null;
  }

  parseLineKeyBoreMm(value) {
    const text = clean(value).toUpperCase();
    if (!text) return null;

    const dn = text.match(/(?:^|[^A-Z0-9])DN\s*([0-9]{2,4})(?:[^0-9]|$)/);
    if (dn) return Number(dn[1]);

    const quotedInch = text.match(/([0-9]{1,2}(?:-[0-9]\/[0-9]|\/[0-9])?)"/);
    if (quotedInch) {
      const key = normaliseFraction(quotedInch[1]);
      if (key && NPS_TO_DN[key] != null) return NPS_TO_DN[key];
    }

    const explicit = text.match(
      /(?:NPS|SIZE|BORE)\s*[-:=]?\s*([0-9]{1,2}(?:-[0-9]\/[0-9]|\/[0-9])?)/
    );
    if (explicit) {
      const key = normaliseFraction(explicit[1]);
      if (key && NPS_TO_DN[key] != null) return NPS_TO_DN[key];
    }

    const delimited = text.match(
      /(?:^|[-_\s])([0-9]{1,2}(?:-[0-9]\/[0-9]|\/[0-9])?)(?=[-_\s])/
    );
    if (delimited) {
      const key = normaliseFraction(delimited[1]);
      if (key && NPS_TO_DN[key] != null) return NPS_TO_DN[key];
    }

    return null;
  }

  convertBore(rawBore) {
    if (rawBore == null) return emptyResult(rawBore);

    const mmValue = parseMmText(rawBore);
    if (mmValue != null) {
      return okResult(rawBore, mmValue, 'DN-MM', `${rawBore}->${mmValue}`);
    }

    if (
      typeof rawBore === 'number' ||
      /^\d+(\.\d+)?$/.test(String(rawBore).trim())
    ) {
      const n = typeof rawBore === 'number' ? rawBore : parseFloat(rawBore);

      if (
        Number.isFinite(n) &&
        n >= 6 &&
        n <= 1200 &&
        (Number.isInteger(n) || n % 1 === 0)
      ) {
        return okResult(rawBore, n, 'DN-PASSTHROUGH', `${rawBore}->${n}`);
      }
    }

    const str = String(rawBore).trim();

    const dnMatch = str.match(/^DN\s*(\d+(?:\.\d+)?)$/i);
    if (dnMatch) {
      return okResult(
        rawBore,
        parseFloat(dnMatch[1]),
        'DN-STRING',
        `${str}->${dnMatch[1]}`
      );
    }

    const npsNumMatch = str.match(/^NPS\s*(\d+(?:\.\d+)?)$/i);
    if (npsNumMatch) {
      const npsVal = parseFloat(npsNumMatch[1]);
      const key = Number.isInteger(npsVal) ? String(Math.round(npsVal)) : null;

      if (key && NPS_TO_DN[key] != null) {
        return okResult(
          rawBore,
          NPS_TO_DN[key],
          'NPS-STRING',
          `${str}->${NPS_TO_DN[key]}`
        );
      }
    }

    const inchMatch = str.match(/^([\d\-\/]+)[""]?$/);
    if (inchMatch) {
      const key = normaliseFraction(inchMatch[1]);

      if (key && NPS_TO_DN[key] != null) {
        return okResult(
          rawBore,
          NPS_TO_DN[key],
          'NPS-INCH',
          `${str}->${NPS_TO_DN[key]}`
        );
      }
    }

    const odNum = parseFloat(str);
    if (Number.isFinite(odNum)) {
      let best = null;

      for (const [od, dn] of OD_TO_DN) {
        const err = Math.abs(odNum - od);
        if (!best || err < best.err) {
          best = { od, dn, err };
        }
      }

      if (best) {
        const tolerance = Math.max(1.5, Math.abs(best.od) * 0.006);

        if (best.err <= tolerance) {
          const source = best.err === 0 ? 'OD-MM' : 'OD-MM-FUZZY';
          return okResult(
            rawBore,
            best.dn,
            source,
            `${odNum}~OD${best.od}->DN${best.dn}`
          );
        }
      }
    }

    return emptyResult(rawBore);
  }

  convertBoreWithContext(rawBore, attrs = {}, fallbackLineKeys = []) {
    const direct = this.convertBore(rawBore);
    if (direct.convertedBore != null) return direct;

    const directLineKey = findAttrValue(attrs, LINE_KEY_ATTR_KEYS);
    const candidates = [];
    if (directLineKey) candidates.push(directLineKey);
    if (Array.isArray(fallbackLineKeys)) {
      candidates.push(...fallbackLineKeys);
    }

    for (const lineKey of candidates) {
      if (!lineKey) continue;
      const parsed = this.parseLineKeyBoreMm(lineKey);
      if (parsed != null) {
        return okResult(rawBore, parsed, 'LINE-KEY', `${lineKey}->DN${parsed}`);
      }
    }

    return direct;
  }
}
