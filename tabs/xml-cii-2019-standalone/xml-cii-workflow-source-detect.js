const XML_ROOT_PATTERN = /<\s*(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b([^>]*)>/i;
const XML_MASK_STORAGE_KEY = 'xml-cii-global-xml-mask-enabled';
export const XML_OR_TXT_ACCEPT = '.xml,.XML,.inputxml,.INPUTXML,.txt,.TXT';

function attrValue(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return String(attrs || '').match(pattern)?.[1] || '';
}

export function detectXmlCiiWorkflowSourceKind(sourceText, fallback = 'xml') {
  const text = String(sourceText || '').trim();
  if (!text) return fallback === 'inputxml' ? 'inputxml' : 'xml';

  const rootMatch = text.match(XML_ROOT_PATTERN);
  const rootName = String(rootMatch?.[1] || '').toLowerCase();
  const rootAttrs = rootMatch?.[2] || '';

  if (rootName === 'pipestressexport') return 'xml';
  if (rootName === 'cleanxml') return 'xml';

  if (rootName === 'caesarii') {
    const xmlType = attrValue(rootAttrs, 'XML_TYPE').toLowerCase();
    if (xmlType === 'input' || /<\s*(?:[A-Za-z_][\w.-]*:)?PIPINGMODEL\b/i.test(text)) return 'inputxml';
  }

  if (rootName === 'pipingelement') return 'inputxml';
  if (/<\s*(?:[A-Za-z_][\w.-]*:)?PipeStressExport\b/i.test(text)) return 'xml';
  if (/<\s*(?:[A-Za-z_][\w.-]*:)?CleanXML\b/i.test(text)) return 'xml';
  if (/<\s*(?:[A-Za-z_][\w.-]*:)?PIPINGELEMENT\b/i.test(text)) return 'inputxml';
  if (/<\s*(?:[A-Za-z_][\w.-]*:)?CAESARII\b/i.test(text) && /<\s*(?:[A-Za-z_][\w.-]*:)?PIPINGMODEL\b/i.test(text)) return 'inputxml';

  return fallback === 'inputxml' ? 'inputxml' : 'xml';
}

export function isXmlMaskEnabled() {
  try {
    return globalThis.localStorage?.getItem?.(XML_MASK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setXmlMaskEnabled(enabled) {
  try {
    globalThis.localStorage?.setItem?.(XML_MASK_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export function maskedFileName(fileName) {
  const name = String(fileName || 'xml-output.xml');
  if (!isXmlMaskEnabled()) return name;
  return name.replace(/\.(xml|inputxml)$/i, '.txt');
}

export function workflowSourceKindLabel(sourceKind) {
  return sourceKind === 'inputxml' ? 'Element-based InputXML' : 'PSI116 XML';
}

export function workflowOutputKindForSource(sourceKind) {
  return sourceKind === 'inputxml' ? 'enrichedInputXML' : 'enrichedXML';
}
