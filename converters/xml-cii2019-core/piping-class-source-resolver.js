import { tokenAtPosition } from './regex-line-key.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function regexGroup(value, pattern, group = 1) {
  const source = text(value);
  const rule = text(pattern);
  if (!source || !rule) return '';
  try {
    const match = new RegExp(rule, 'i').exec(source);
    return text(match?.[Math.max(0, Number(group || 1))] ?? match?.[0]);
  } catch {
    return '';
  }
}

function looksLikeNps(value) {
  const source = text(value).replace(/(?:nps|inch(?:es)?|in\.?|["”])/gi, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(source)) return false;
  const numeric = Number(source);
  return Number.isFinite(numeric) && numeric >= 0.25 && numeric <= 80;
}

function likelyMaterial(value) {
  return /^(CS|SS|LTCS|DSS|SDSS|ALLOY|GI|CI|DI|PVC|CPVC|HDPE|GRP|GRE)$/i.test(text(value));
}

function lineKeyToken(value) {
  return /^[A-Z]\d{5,}$/i.test(text(value));
}

function classToken(value) {
  const source = text(value).replace(/^=/, '');
  if (!/^[A-Z0-9]{3,10}$/i.test(source)) return false;
  if (lineKeyToken(source) || likelyMaterial(source) || looksLikeNps(source)) return false;
  return /\d/.test(source);
}

function branchTokens(branchName, delimiter) {
  return text(branchName)
    .replace(/^\/+/, '')
    .replace(/\/B\d+$/i, '')
    .split(delimiter || '-')
    .map((value) => text(value))
    .filter(Boolean);
}

function scanClassAfterLineKey(branchName, delimiter) {
  const tokens = branchTokens(branchName, delimiter);
  const lineIndex = tokens.findIndex(lineKeyToken);
  if (lineIndex >= 0) {
    for (let index = lineIndex + 1; index < tokens.length; index += 1) {
      if (classToken(tokens[index])) return tokens[index];
    }
  }
  return tokens.find((value, index) => index >= 3 && classToken(value)) || '';
}

export function deriveXmlCiiPipingClassFromBranchName(branchName, config = {}) {
  const regexValue = regexGroup(branchName, config?.rating?.pipingClassRegex, config?.rating?.pipingClassGroup || 1);
  if (regexValue && !lineKeyToken(regexValue)) return regexValue;
  const delimiter = config?.rating?.tokenDelimiter || config?.linelist?.tokenDelimiter || '-';
  const index = Number(config?.rating?.pipingClassTokenIndex || 5);
  const configured = text(tokenAtPosition(branchName, delimiter, index));
  const scanned = scanClassAfterLineKey(branchName, delimiter);
  if (lineKeyToken(configured)) return scanned;
  if (index === 5) {
    const fourth = tokenAtPosition(branchName, delimiter, 4);
    const sixth = tokenAtPosition(branchName, delimiter, 6);
    if (likelyMaterial(configured) && looksLikeNps(fourth) && /^S\d+/i.test(text(sixth))) return scanned;
  }
  return classToken(configured) ? configured : scanned;
}

export function selectXmlCiiRequestedPipingClass({ branchName = '', lineListPipingClass = '', config = {} } = {}) {
  const branchPipingClass = deriveXmlCiiPipingClassFromBranchName(branchName, config);
  const lineListClass = text(lineListPipingClass);
  return {
    requestedPipingClass: branchPipingClass || lineListClass,
    branchPipingClass,
    lineListPipingClass: lineListClass,
    source: branchPipingClass ? 'branch-name' : (lineListClass ? 'line-list' : 'none'),
  };
}
