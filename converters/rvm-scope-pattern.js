// Pure, dependency-free scope-pattern matching for RVM / ATTRIBUTE branch selection.
//
// A scope pattern may contain a *list* of tokens separated by comma, semicolon
// or newline so that several branches/pipes can be selected in one pass
// (e.g. "S8810101, S8810111, S88112, S8810103, S8811951"). Each token may use
// '*' as a glob wildcard. A token without '*' matches as a case-insensitive
// substring, preserving the legacy single-pattern behaviour.
//
// No project- or model-specific values are baked in: every token comes from
// user input.

const TOKEN_SEPARATOR = /[,;\n]+/;

export function splitScopeTokens(pattern) {
  return String(pattern ?? '')
    .split(TOKEN_SEPARATOR)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenToRegexSource(token) {
  const escaped = token
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  // Globbed tokens anchor (full-string match); plain tokens match as substring.
  return token.includes('*') ? `^${escaped}$` : escaped;
}

export function rvmScopeRegex(pattern) {
  const tokens = splitScopeTokens(pattern);
  if (!tokens.length) return null;
  const source = tokens.map((token) => `(?:${tokenToRegexSource(token)})`).join('|');
  return new RegExp(source, 'i');
}

export function matchesScopeText(text, pattern) {
  const regex = rvmScopeRegex(pattern);
  if (!regex) return true;
  return regex.test(String(text ?? ''));
}
