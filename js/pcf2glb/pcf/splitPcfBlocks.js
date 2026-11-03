/**
 * Single source-of-truth for all recognized PCF block-start keywords.
 * Kept in sync with pcf-parser.js COMP_TYPES and Pcfx_PcfAdapter.BLOCK_STARTS.
 */
export const PCF_BLOCK_TYPES = new Set([
  // Core pipe components
  'PIPE', 'BEND', 'ELBOW', 'TEE', 'OLET', 'VALVE', 'FLANGE',
  'REDUCER', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC',
  'COUPLING', 'CROSS', 'MISC-COMPONENT',
  // Fittings / hardware
  'CAP', 'GASKET', 'BOLT', 'WELD', 'STRAINER',
  'UNION', 'BLIND-FLANGE', 'TRAP', 'FILTER', 'INSTRUMENT',
  // Supports / annotations
  'SUPPORT', 'MESSAGE-SQUARE', 'MESSAGE-CIRCLE',
]);

export function splitPcfBlocks(text, log) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l.trim() !== '');

  const blocks = [];
  let current = null;

  for (const line of lines) {
    const token = line.trim().split(/\s+/)[0];
    if (PCF_BLOCK_TYPES.has(token)) {
      if (current) blocks.push(current);
      current = { type: token, lines: [line], rawAttrs: {} };
    } else if (current) {
      current.lines.push(line);
      // Capture attribute key-value pairs — handles normal keys AND angle-bracket keys
      // e.g.  "    PIPELINE-REFERENCE  P1"  and  "    <SUPPORT_NAME>  RST-001"
      const match = line.match(/^\s*(<[^>]+>|[A-Z][A-Z0-9_\-]*)\s+(.*)/);
      if (match) {
        current.rawAttrs[match[1]] = match[2].trim();
      } else {
        // Single-word attribute with no value
        const single = line.match(/^\s*(<[^>]+>|[A-Z][A-Z0-9_\-]*)$/);
        if (single) current.rawAttrs[single[1]] = '';
      }
    } else {
      // Lines before the first block keyword are PCF header lines — not an error
      if (log) log.info?.('PCF_HEADER_LINE', { line });
    }
  }

  if (current) blocks.push(current);
  return blocks;
}
