function _toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function _normalizeBranchMapKey(value) {
  return _toText(value).trim().toUpperCase().replace(/\s+/g, '');
}

function _mappedLineKeyForBranch(branchName, linelist) {
  const map = linelist?.branchLineKeyMap;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return '';
  const exact = _toText(map[_toText(branchName).trim()]).trim();
  if (exact) return exact;
  const wanted = _normalizeBranchMapKey(branchName);
  for (const [key, value] of Object.entries(map)) {
    const mapped = _toText(value).trim();
    if (mapped && _normalizeBranchMapKey(key) === wanted) return mapped;
  }
  return '';
}

function _regexGroup(text, pattern, groupIndex = 1) {
  const source = _toText(text).trim();
  const patternText = _toText(pattern).trim();
  if (!source || !patternText) return '';
  try {
    const match = new RegExp(patternText, 'i').exec(source);
    const index = Math.max(0, Number(groupIndex || 0));
    return _toText(match?.[index] || '').trim();
  } catch {
    return '';
  }
}

function _looksLikeNpsSizeToken(value) {
  const text = _toText(value).trim();
  if (!text) return false;
  return /^(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+)(?:\s*(?:in|inch|"))?$/i.test(text);
}

function _looksLikeLineKeyToken(value) {
  const text = _toText(value).trim();
  if (!text) return false;
  if (_looksLikeNpsSizeToken(text)) return false;
  // Project line keys commonly look like S8810105, D8810386, etc. Require both
  // letters and at least four consecutive digits so material/spec tokens such as
  // CS, PL, HC, or 91261M7 are not accidentally treated as line keys.
  return /^(?=.*[A-Za-z])(?=.*\d{4,})[A-Za-z][A-Za-z0-9_./]*$/i.test(text);
}

function _autoShiftedLineKeyFromTokens(tokens, configuredParts) {
  if (!Array.isArray(tokens) || tokens.length < 5) return '';
  const configured = _toText(configuredParts).trim();
  // Only rescue the legacy default case where token 4 has become the NPS size
  // because the branch contains an inserted discipline/service token, e.g.:
  // /ASIM-1885-PL-10"-CS-S8810105-01/B2
  if (!_looksLikeNpsSizeToken(configured)) return '';
  for (let index = 4; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (_looksLikeLineKeyToken(token)) return token;
  }
  return '';
}

export function tokenizeBranchName(branchName, delimiter = '-') {
  const cleaned = _toText(branchName).trim().replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const delim = _toText(delimiter) || '-';
  return cleaned.split(delim).map((token) => token.trim()).filter(Boolean);
}

export function tokenAtPosition(branchName, delimiter, oneBasedIndex) {
  const index = Number(oneBasedIndex);
  if (!Number.isFinite(index) || index <= 0) return '';
  return tokenizeBranchName(branchName, delimiter)[Math.round(index) - 1] || '';
}

export function xmlCiiTokenPositionList(value) {
  if (Array.isArray(value)) return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0);
  const text = _toText(value).trim();
  if (!text) return [];
  if (!/^\s*\d+(?:\s*[,+]\s*\d+)*\s*$/.test(text)) return [];
  return text
    .split(/[,+]/)
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

export function xmlCiiLineKeyFromBranchTokens(branchName, config) {
  const linelist = config.linelist || {};
  const positions = xmlCiiTokenPositionList(linelist.lineKeyTokenPositions);
  const safePositions = positions.length ? positions : [4];
  const delimiter = linelist.tokenDelimiter || '-';
  const joiner = _toText(linelist.lineKeyJoiner);
  const tokens = tokenizeBranchName(branchName, delimiter);
  const parts = safePositions.map((position) => tokens[Math.round(position) - 1] || '').filter(Boolean);
  const joined = parts.join(joiner);

  if (safePositions.length === 1 && Math.round(safePositions[0]) === 4) {
    const shifted = _autoShiftedLineKeyFromTokens(tokens, joined);
    if (shifted) return shifted;
  }

  return joined;
}

export function deriveLineKeyFromBranchName(branchName, config) {
  const text = _toText(branchName).trim();
  const linelist = config.linelist || {};
  const mapped = _mappedLineKeyForBranch(text, linelist);
  if (mapped) return mapped;

  // Regex is an explicit user override and must take precedence over token fallback.
  // Otherwise a configured regex cannot fix shifted branch formats such as:
  // /ASIM-1885-PL-10"-CS-S8810105-01/B2, where token 4 is the size, not the line key.
  const byRegex = _regexGroup(text, linelist.branchNameRegex, linelist.lineNoGroup || 1);
  if (byRegex) return byRegex;

  const byToken = xmlCiiLineKeyFromBranchTokens(text, config);
  if (byToken) return byToken;
  return '';
}
