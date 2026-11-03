import { detectXmlCiiWorkflowSourceKind } from './xml-cii-workflow-source-detect.js';

const SAMPLE_LIMIT = 2000;

export function createDefaultRegexTesterConfig() {
  const defaultFormat = {
    tokenDelimiter: '-',
    lineKeyJoiner: '',
    lineKey: { regex: '', group: 1, tokenPosition: 3 },
    pipingClass: { regex: '', group: 1, tokenPosition: 4 },
    rating: { regex: '', group: 1, tokenPosition: 4 },
    bore: { regex: '', group: 1, tokenPosition: 2 },
  };
  return {
    activeFormatIndex: 0,
    formats: [
      { ...defaultFormat },
      { ...defaultFormat }
    ],
    ratingSequence: [['200', '20000'], ['150', '15000'], ['100', '10000'], ['25', '2500'], ['15', '1500'], ['5', '5000'], ['1', '150'], ['3', '300'], ['6', '600'], ['9', '900']],
  };
}

function text(value) {
  return String(value ?? '').trim();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function childText(xml, tagName) {
  const match = String(xml || '').match(new RegExp(`<\\s*(?:[A-Za-z_][\\w.-]*:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*(?:[A-Za-z_][\\w.-]*:)?${tagName}\\s*>`, 'i'));
  return decodeXml(match?.[1] || '').trim();
}

function attrText(xml, attrName) {
  const match = String(xml || '').match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return decodeXml(match?.[1] || '').trim();
}

function uniqueSamples(samples) {
  const seen = new Set();
  const out = [];
  for (const sample of samples) {
    const key = text(sample.branchName || sample.lineReference);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...sample, sampleIndex: out.length + 1 });
  }
  return out.slice(0, SAMPLE_LIMIT);
}

export function parseStandaloneRegexBranchSamples(sourceText) {
  try {
    const doc = new DOMParser().parseFromString(sourceText || '', 'application/xml');
    if (!doc.querySelector('parsererror')) {
      const rows = [];
      const seen = new Set();
      
      const addRow = (src, name, ref) => {
         const key = text(name || ref);
         if (key && !seen.has(key)) {
           seen.add(key);
           rows.push({ source: src, branchName: name, lineReference: ref });
         }
      };

      const allElements = doc.querySelectorAll('*');
      for (const el of allElements) {
        const tag = (el.localName || '').toLowerCase();
        
        if (tag === 'branch') {
          const name = el.getAttribute('NAME') || el.getAttribute('name') || Array.from(el.children).find(c => (c.localName || '').toLowerCase() === 'branchname')?.textContent || '';
          addRow('Branch', name, name);
        } else if (tag === 'branchname') {
          addRow('Branchname', el.textContent, el.textContent);
        } else if (tag === 'pipingelement') {
          const lineId = el.getAttribute('LINE_ID') || el.getAttribute('LineId') || '';
          addRow('PipingElement', lineId, lineId);
        } else if (tag === 'pipeline') {
          const name = el.getAttribute('Name') || el.getAttribute('NAME') || '';
          addRow('Pipeline', name, name);
        }
      }

      return rows.map((r, i) => ({ ...r, sampleIndex: i + 1 })).slice(0, SAMPLE_LIMIT);
    }
  } catch (err) {
    console.warn('DOMParser failed in regex extraction', err);
  }
  return [];
}

function mergeConfig(config = {}) {
  const defaults = createDefaultRegexTesterConfig();
  const source = safeObject(config);
  let formats = source.formats;
  if (!formats || !Array.isArray(formats)) {
    const singleFormat = {
      tokenDelimiter: text(source.tokenDelimiter || defaults.formats[0].tokenDelimiter),
      lineKeyJoiner: text(source.lineKeyJoiner ?? defaults.formats[0].lineKeyJoiner),
      lineKey: { ...defaults.formats[0].lineKey, ...safeObject(source.lineKey) },
      pipingClass: { ...defaults.formats[0].pipingClass, ...safeObject(source.pipingClass) },
      rating: { ...defaults.formats[0].rating, ...safeObject(source.rating) },
      bore: { ...defaults.formats[0].bore, ...safeObject(source.bore) },
    };
    formats = [
      { ...singleFormat },
      { ...defaults.formats[1] }
    ];
  } else {
    formats = formats.map((f, i) => {
      const defF = defaults.formats[i] || defaults.formats[0];
      const srcF = safeObject(f);
      return {
        tokenDelimiter: text(srcF.tokenDelimiter || defF.tokenDelimiter),
        lineKeyJoiner: text(srcF.lineKeyJoiner ?? defF.lineKeyJoiner),
        lineKey: { ...defF.lineKey, ...safeObject(srcF.lineKey) },
        pipingClass: { ...defF.pipingClass, ...safeObject(srcF.pipingClass) },
        rating: { ...defF.rating, ...safeObject(srcF.rating) },
        bore: { ...defF.bore, ...safeObject(srcF.bore) },
      };
    });
  }
  return {
    activeFormatIndex: typeof source.activeFormatIndex === 'number' ? source.activeFormatIndex : defaults.activeFormatIndex,
    formats,
    ratingSequence: Array.isArray(source.ratingSequence) ? source.ratingSequence : defaults.ratingSequence,
  };
}

export function analyzeStandaloneRegexFormats(branchSamples, delimiter = '-') {
  if (!branchSamples || !branchSamples.length) {
    return { dominantSample: '', alternativeSample: '', hasMultipleFormats: false };
  }
  const counts = {};
  const samplesByCount = {};
  for (const sample of branchSamples) {
    const txt = sample.branchName || sample.lineReference || '';
    const cleaned = txt.replace(/^\/+/, '').replace(/\/B\d+$/i, '');
    const tokens = cleaned.split(delimiter).filter(Boolean);
    const tokenCount = tokens.length;
    counts[tokenCount] = (counts[tokenCount] || 0) + 1;
    if (!samplesByCount[tokenCount]) samplesByCount[tokenCount] = [];
    samplesByCount[tokenCount].push(txt);
  }
  const sortedLengths = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);
  const dominantLength = sortedLengths[0];
  const dominantSample = samplesByCount[dominantLength]?.[0] || '';
  let alternativeSample = '';
  let hasMultipleFormats = false;
  if (sortedLengths.length > 1) {
    hasMultipleFormats = true;
    const alternativeLength = sortedLengths[1];
    alternativeSample = samplesByCount[alternativeLength]?.[0] || '';
  }
  return { dominantSample, alternativeSample, hasMultipleFormats };
}

function regexValue(value, rule) {
  const pattern = text(rule.regex);
  if (!pattern) return '';
  try {
    const match = String(value || '').match(new RegExp(pattern));
    return text(match?.[Number(rule.group || 1)] ?? match?.[0]);
  } catch {
    return '';
  }
}

function tokenValue(value, rule, delimiter, joiner) {
  const posText = String(rule.tokenPosition || '').trim();
  if (!posText) return '';
  const positions = posText.split(/[,+]/).map((p) => Number(p.trim())).filter((p) => Number.isFinite(p) && p > 0);
  if (!positions.length) return '';
  const tokens = String(value || '').split(delimiter || '-').map((part) => part.trim());
  const parts = positions.map((pos) => tokens[pos - 1] || '').filter(Boolean);
  return parts.join(joiner || '');
}

function extractValue(value, rule, delimiter, joiner) {
  return regexValue(value, rule) || tokenValue(value, rule, delimiter, joiner);
}

function deriveRatingFromPc(pipingClass, sequence) {
  const pcText = String(pipingClass ?? '').trim().toUpperCase();
  if (!pcText) return '';
  for (const pair of (sequence || [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const prefix = String(pair[0]).trim().toUpperCase();
    if (prefix && pcText.startsWith(prefix)) {
      return String(pair[1]);
    }
  }
  return '';
}

function extractionRow(sample, cfg, ratingSequence) {
  const source = sample.branchName || sample.lineReference || '';
  const pcVal = extractValue(source, cfg.pipingClass, cfg.tokenDelimiter);
  const ratingVal = deriveRatingFromPc(pcVal, ratingSequence) || extractValue(source, cfg.rating, cfg.tokenDelimiter).match(/\d+/)?.[0] || '';
  const row = {
    ...sample,
    lineKey: extractValue(source, cfg.lineKey, cfg.tokenDelimiter, cfg.lineKeyJoiner),
    pipingClass: pcVal,
    rating: ratingVal,
    bore: extractValue(source, cfg.bore, cfg.tokenDelimiter).replace(/[^0-9.]/g, ''),
  };
  row.status = row.lineKey && row.pipingClass ? 'MATCHED' : 'REJECTED';
  return row;
}

function diagnosticsFor(rows, sourceKind) {
  return [
    { type: 'regex-tester-source-kind', sourceKind },
    { type: 'regex-tester-samples', rows: rows.length },
    { type: 'regex-tester-matched', rows: rows.filter((row) => row.status === 'MATCHED').length },
    { type: 'regex-tester-rejected', rows: rows.filter((row) => row.status !== 'MATCHED').length },
  ];
}

function writeRegexConfig(supportConfigJson, extractionConfig) {
  const config = JSON.parse(text(supportConfigJson) || '{}');
  const cfg = mergeConfig(extractionConfig);
  config.regexTester = cfg;
  const f0 = cfg.formats[0];
  config.linelist = { ...safeObject(config.linelist), branchNameRegex: f0.lineKey.regex, lineNoGroup: f0.lineKey.group, tokenDelimiter: f0.tokenDelimiter, lineKeyTokenPositions: String(f0.lineKey.tokenPosition || ''), lineKeyJoiner: f0.lineKeyJoiner };
  config.rating = { ...safeObject(config.rating), pipingClassRegex: f0.pipingClass.regex, pipingClassGroup: f0.pipingClass.group, ratingRegex: f0.rating.regex, ratingGroup: f0.rating.group, tokenDelimiter: f0.tokenDelimiter, pipingClassTokenIndex: f0.pipingClass.tokenPosition, ratingSequence: cfg.ratingSequence };
  config.weight = { ...safeObject(config.weight), boreRegex: f0.bore.regex, boreGroup: f0.bore.group, tokenDelimiter: f0.tokenDelimiter, boreTokenIndex: f0.bore.tokenPosition };
  
  // also store formats array in config for downstream parser usage if necessary
  config.formats = cfg.formats;
  return JSON.stringify(config, null, 2);
}

export function runStandaloneRegexTester(input = {}) {
  const sourceText = String(input.sourceText || '');
  const sourceKind = input.sourceKind === 'auto' ? detectXmlCiiWorkflowSourceKind(sourceText) : (input.sourceKind || 'xml');
  const extractionConfig = mergeConfig(input.extractionConfig || input.regexTesterConfig);
  if (sourceKind === 'inputxml') return inputXmlNotRequired(extractionConfig, input.supportConfigJson);
  const branchSamples = parseStandaloneRegexBranchSamples(sourceText);
  const rows = branchSamples.map((sample) => {
    const row1 = extractionRow(sample, extractionConfig.formats[0], extractionConfig.ratingSequence);
    if (row1.status === 'MATCHED') {
      row1.matchedFormatIndex = 0;
      return row1;
    }
    const row2 = extractionRow(sample, extractionConfig.formats[1], extractionConfig.ratingSequence);
    if (row2.status === 'MATCHED') {
      row2.matchedFormatIndex = 1;
      return row2;
    }
    row1.matchedFormatIndex = 0;
    return row1;
  });
  const matchedRows = rows.filter((row) => row.status === 'MATCHED');
  const rejectedRows = rows.filter((row) => row.status !== 'MATCHED');
  return { branchSamples, matchedRows, rejectedRows, diagnostics: diagnosticsFor(rows, sourceKind), extractionConfig, supportConfigJson: writeRegexConfig(input.supportConfigJson, extractionConfig) };
}

function inputXmlNotRequired(extractionConfig, supportConfigJson) {
  return {
    branchSamples: [],
    matchedRows: [],
    rejectedRows: [],
    diagnostics: [{ type: 'regex-tester-inputxml-not-required', sourceKind: 'inputxml' }],
    extractionConfig,
    supportConfigJson: writeRegexConfig(supportConfigJson, extractionConfig),
  };
}
