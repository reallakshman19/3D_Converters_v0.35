import { xmlCiiWorkflowSetConfigValue, xmlCiiWorkflowInvalidateSnapshot } from './xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1';

const FLAG = '__xmlCiiBranchSampleSync_v2';
const BRANCH_SAMPLE_KEY = 'xmlCii2019.regex.branchNameSampleFromXml.v1';
const FILE_KEY = 'xmlCii2019.regex.branchNameSampleFileKey.v1';
const ROOT_ATTR = 'data-xml-cii-workflow-root';
const LEGACY_ATTR = 'data-xml-cii-regex-path';
const NATIVE_ATTR = 'data-native-regex-path';
const SAMPLE_PATH = 'linelist.sampleBranchName';

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function text(value) {
  return value == null ? '' : String(value);
}

function clean(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function readStored(key, fallback = '') {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}

function normalizeBranchName(value) {
  const candidate = clean(value)
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
  if (!candidate) return '';
  if (candidate.length < 2 || candidate.length > 220) return '';
  if (/[<>]/.test(candidate)) return '';
  if (/^(branch|branches|branchname|name)$/i.test(candidate)) return '';
  return candidate;
}

function localName(node) {
  return clean(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function attrValue(element, names) {
  if (!element?.attributes) return '';
  for (const name of names) {
    const direct = element.getAttribute?.(name);
    const normalized = normalizeBranchName(direct);
    if (normalized) return normalized;
  }
  for (const attr of Array.from(element.attributes || [])) {
    if (names.some((name) => name.toLowerCase() === attr.name.toLowerCase())) {
      const normalized = normalizeBranchName(attr.value);
      if (normalized) return normalized;
    }
  }
  return '';
}

function extractBranchNameFromDom(xmlText) {
  if (typeof DOMParser === 'undefined') return '';
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector?.('parsererror')) return '';
    const attrNames = ['Branchname', 'BranchName', 'BRANCHNAME', 'branchname', 'NAME', 'Name', 'name', 'REF', 'Ref', 'ref'];

    for (const element of Array.from(doc.getElementsByTagName('*'))) {
      const name = localName(element).toLowerCase();
      if (name === 'branchname' || name === 'branch-name') {
        const normalized = normalizeBranchName(element.textContent);
        if (normalized) return normalized;
      }
    }

    for (const element of Array.from(doc.getElementsByTagName('*'))) {
      const name = localName(element).toLowerCase();
      if (name === 'branch' || name.endsWith('branch') || name.includes('branch')) {
        const fromAttr = attrValue(element, attrNames);
        if (fromAttr) return fromAttr;
        if (element.children?.length === 0) {
          const fromText = normalizeBranchName(element.textContent);
          if (fromText) return fromText;
        }
      }
    }
  } catch {}
  return '';
}

function extractBranchNameByRegex(xmlText) {
  const raw = text(xmlText);
  const patterns = [
    /<\s*[^>]*BranchName[^>]*>\s*([^<]{2,220})\s*<\s*\/\s*[^>]*BranchName\s*>/i,
    /<\s*[^>]*Branchname[^>]*>\s*([^<]{2,220})\s*<\s*\/\s*[^>]*Branchname\s*>/i,
    /<\s*[^>]*\bBranch\b[^>]*(?:Branchname|BranchName|BRANCHNAME|NAME|Name|name|REF|Ref|ref)\s*=\s*['"]([^'"]{2,220})['"][^>]*>/i,
    /\b(?:Branchname|BranchName|BRANCHNAME)\s*=\s*['"]([^'"]{2,220})['"]/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const normalized = normalizeBranchName(match?.[1]);
    if (normalized) return normalized;
  }
  return '';
}

export function extractXmlCiiBranchSample(xmlText) {
  return extractBranchNameFromDom(xmlText) || extractBranchNameByRegex(xmlText);
}

function primaryXmlInput(root) {
  return root?.querySelector?.('#model-converters-primary-input') || document.querySelector('#model-converters-primary-input');
}

function currentFileKey(file) {
  return file ? `${file.name}|${file.size}|${file.lastModified}` : '';
}

function isSampleTarget(node) {
  const path = node?.getAttribute?.(NATIVE_ATTR) || node?.getAttribute?.(LEGACY_ATTR) || '';
  return path === SAMPLE_PATH;
}

function sampleTargets(root = document) {
  const scope = root?.querySelectorAll ? root : document;
  return Array.from(scope.querySelectorAll?.(`[${NATIVE_ATTR}="${SAMPLE_PATH}"], [${LEGACY_ATTR}="${SAMPLE_PATH}"]`) || [])
    .filter(isSampleTarget);
}

function setElementValue(element, value) {
  if (!element || !value) return false;
  const current = 'value' in element ? element.value : element.textContent;
  if (current === value) return false;
  if ('value' in element) element.value = value;
  else element.textContent = value;
  return true;
}

function persistBranchSampleToConfig(sample) {
  const value = normalizeBranchName(sample);
  if (!value) return;
  try {
    xmlCiiWorkflowSetConfigValue?.(SAMPLE_PATH, value, 'text');
    xmlCiiWorkflowInvalidateSnapshot?.();
  } catch {}
}

export function applyXmlCiiBranchSample(root = document, value = readStored(BRANCH_SAMPLE_KEY, ''), options = {}) {
  const sample = normalizeBranchName(value);
  if (!sample) return 0;
  writeStored(BRANCH_SAMPLE_KEY, sample);
  if (options.persistConfig === true) persistBranchSampleToConfig(sample);
  const scope = root?.querySelectorAll ? root : document;
  if (scope !== document) scope.setAttribute?.(ROOT_ATTR, 'true');
  let updated = 0;
  for (const target of sampleTargets(scope)) {
    if (setElementValue(target, sample)) updated += 1;
  }
  return updated;
}

export async function syncLoadedXmlCiiBranchSample(root = document, force = false) {
  const input = primaryXmlInput(root);
  const file = input?.files?.[0];
  if (!file) {
    applyXmlCiiBranchSample(root);
    return '';
  }
  const key = currentFileKey(file);
  if (!force && key && readStored(FILE_KEY, '') === key && readStored(BRANCH_SAMPLE_KEY, '')) {
    const stored = readStored(BRANCH_SAMPLE_KEY, '');
    applyXmlCiiBranchSample(root, stored, { persistConfig: true });
    return stored;
  }
  const xmlText = await file.text();
  const sample = extractXmlCiiBranchSample(xmlText);
  if (sample) {
    writeStored(FILE_KEY, key);
    applyXmlCiiBranchSample(root, sample, { persistConfig: true });
  }
  return sample;
}

function bindPrimaryInput(root, state) {
  const input = primaryXmlInput(root);
  if (!input || state.primaryInput === input) return;
  state.primaryInput?.removeEventListener?.('change', state.onPrimaryChange);
  state.primaryInput = input;
  state.onPrimaryChange = () => syncLoadedXmlCiiBranchSample(root, true).catch(() => {});
  input.addEventListener('change', state.onPrimaryChange);
}

function bindWorkflowTabRefresh(root, state) {
  if (state.tabRefreshBound) return;
  state.tabRefreshBound = true;
  state.onTabRefresh = (event) => {
    const target = event.target?.closest?.('[data-modal-tab="regex"], [data-old-xml-cii-phase="regex"], [data-native-regex-path], [data-xml-cii-regex-path]');
    if (!target) return;
    const run = () => applyXmlCiiBranchSample(root, undefined, { persistConfig: true });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else Promise.resolve().then(run);
  };
  document.addEventListener('click', state.onTabRefresh, true);
}

export function installXmlCiiBranchSampleSync(container = document) {
  if (!browserReady()) return;
  const root = container && container.nodeType === 1 ? container : document;
  if (!window[FLAG]) window[FLAG] = { stateByRoot: new WeakMap() };
  let state = window[FLAG].stateByRoot.get(root);
  if (!state) {
    state = { primaryInput: null, onPrimaryChange: null, tabRefreshBound: false, onTabRefresh: null };
    window[FLAG].stateByRoot.set(root, state);
  }

  bindPrimaryInput(root, state);
  bindWorkflowTabRefresh(root, state);
  applyXmlCiiBranchSample(root, undefined, { persistConfig: true });
  syncLoadedXmlCiiBranchSample(root).catch(() => {});
}
