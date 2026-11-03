import { state } from '../../core/state.js';
import { parseRmssAttributes } from '../../converters/rmss-attribute-parser.js';
import {
  buildRvmAttributeScopeTree,
  countRvmAttributeScopeTree,
} from './rvmattr-scope-tree-model.js?v=20260802-rvm-full-scope-tree-1';
const VERSION = '20260802-rvm-full-scope-tree-1';
let installed = false;
let latestAttributeFile = null;
function clean(value) {
  return String(value ?? '').trim();
}
function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}
function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
function isAttributeFile(file) {
  return Boolean(file && /\.(att|txt)$/i.test(clean(file.name)));
}
function filesFromInput(input) {
  return Array.from(input?.files || []).filter(isAttributeFile);
}
function rememberInputFiles(input) {
  const files = filesFromInput(input);
  if (files.length) latestAttributeFile = files.at(-1);
}
function scanAttributeInputs(root = document) {
  for (const input of root.querySelectorAll?.('input[type="file"]') || []) {
    rememberInputFiles(input);
  }
  return latestAttributeFile;
}
function wildcardRegex(pattern) {
  const text = clean(pattern);
  if (!text) return null;
  const escaped = text.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(text.includes('*') ? `^${escaped}$` : escaped, 'i');
}
function nodeMatches(node, regex) {
  return Boolean(regex && regex.test(`${node.label} ${node.kind} ${node.searchable}`));
}
function selectionStates(treeElement) {
  const result = new Map();
  for (const input of treeElement.querySelectorAll('input[data-scope-node]')) {
    result.set(input.getAttribute('data-scope-node'), Boolean(input.checked));
  }
  return result;
}
function mergeSelectionStates(cache, treeElement) {
  for (const [id, checked] of selectionStates(treeElement)) cache.set(id, checked);
}
function selectableIds(node, values = []) {
  if (node.selectable && node.selectId) values.push(node.selectId);
  for (const child of node.children || []) selectableIds(child, values);
  return values;
}
function modelIndex(tree) {
  const result = new Map();
  const visit = (nodes) => {
    for (const node of nodes || []) {
      result.set(node.id, node);
      visit(node.children);
    }
  };
  visit(tree);
  return result;
}
function selectedWithinMap(tree, selection) {
  const result = new Map();
  const visit = (node) => {
    let selected = node.selectable && selection.get(node.selectId) === true;
    for (const child of node.children || []) {
      if (visit(child)) selected = true;
    }
    result.set(node.id, selected);
    return selected;
  };
  for (const node of tree || []) visit(node);
  return result;
}
function toggleHtml(node, expanded) {
  if (!node.children?.length) return '<span style="display:inline-block;width:22px;"></span>';
  const symbol = expanded ? '−' : '+';
  const label = expanded ? 'Collapse' : 'Expand';
  return `<button type="button" data-rvm-tree-toggle="${escapeAttribute(node.id)}" aria-label="${label} ${escapeAttribute(node.label)}" title="${label}" style="width:22px;height:22px;padding:0;border:1px solid #52617a;border-radius:4px;background:#101722;color:#dbe8f7;font-weight:700;line-height:18px;">${symbol}</button>`;
}
function checkboxHtml(node, checked, indeterminate) {
  if (!node.selectable || !node.selectId) {
    return '<span aria-hidden="true" style="display:inline-block;width:14px;text-align:center;color:#64748b;">•</span>';
  }
  return `<input type="checkbox" data-scope-node="${escapeAttribute(node.selectId)}" ${checked ? 'checked' : ''} data-indeterminate="${indeterminate ? 'true' : 'false'}">`;
}
function nodeHtml(node, depth, context) {
  const expanded = context.expanded.has(node.id) ? context.expanded.get(node.id) : true;
  const checked = node.selectable && context.selection.get(node.selectId) === true;
  const indeterminate = node.selectable && !checked
    && context.selectedWithin.get(node.id) === true;
  const matched = nodeMatches(node, context.regex);
  const children = (node.children || []).map((child) => nodeHtml(child, depth + 1, context)).join('');
  const count = node.branchKeys?.length ? ` (${node.branchKeys.length})` : '';
  return `<li data-rvm-tree-node="${escapeAttribute(node.id)}" style="list-style:none;margin:2px 0 2px ${depth ? 14 : 0}px;">
    <div style="display:flex;align-items:center;gap:7px;padding:3px 4px;border-radius:5px;${matched ? 'background:rgba(75,137,220,.16);' : ''}">
      ${toggleHtml(node, expanded)}
      ${checkboxHtml(node, checked, indeterminate)}
      <span style="color:#7fb4ff;font-size:11px;min-width:58px;">${escapeHtml(node.kind)}</span>
      <span>${escapeHtml(node.label)}</span>
      <span style="color:#7f8ea3;font-size:11px;">${escapeHtml(count)}</span>
    </div>
    ${children ? `<ul data-rvm-tree-children style="padding-left:0;margin:0;${expanded ? '' : 'display:none;'}">${children}</ul>` : ''}
  </li>`;
}
function selectedBranchCount(tree, selection) {
  let count = 0;
  const visit = (nodes) => {
    for (const node of nodes || []) {
      if (node.kind === 'BRANCH' && selection.get(node.selectId) === true) count += 1;
      visit(node.children);
    }
  };
  visit(tree);
  return count;
}
function renderFullTree(context) {
  const regex = wildcardRegex(context.wildcardInput?.value);
  const selectedWithin = selectedWithinMap(context.tree, context.selection);
  const html = context.tree.map((node) => nodeHtml(node, 0, {
    expanded: context.expanded, selection: context.selection, selectedWithin, regex,
  })).join('');
  context.treeElement.innerHTML = `<ul data-rvm-full-tree-root="${VERSION}" style="padding-left:0;margin:0;">${html}</ul>`;
  for (const input of context.treeElement.querySelectorAll('input[data-indeterminate="true"]')) {
    input.indeterminate = true;
  }
  const selected = selectedBranchCount(context.tree, context.selection);
  context.statsElement.textContent = `${context.counts.branches} total branch(es), ${context.counts.items} hierarchy item(s), ${selected} selected branch(es). Use +/− to expand or collapse.`;
}
function updateSelectionCache(context, event) {
  const input = event.target.closest?.('input[data-scope-node]');
  if (!input) return;
  const id = input.getAttribute('data-scope-node');
  const node = context.index.get(id);
  const ids = node ? selectableIds(node, []) : [id];
  for (const selectableId of ids) context.selection.set(selectableId, input.checked);
}
function toggleNode(context, event) {
  const button = event.target.closest?.('[data-rvm-tree-toggle]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const id = button.getAttribute('data-rvm-tree-toggle');
  context.expanded.set(id, !(context.expanded.has(id) ? context.expanded.get(id) : true));
  renderFullTree(context);
}
function installFullScopeButton(card) {
  if (card.querySelector('[data-scope-convert-full]')) return;
  const convertButton = card.querySelector('[data-scope-convert]');
  const cancelButton = card.querySelector('[data-scope-cancel]');
  const clearButton = card.querySelector('[data-scope-clear]');
  if (!convertButton || !cancelButton || !clearButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.scopeConvertFull = VERSION;
  button.className = 'model-converters-run-btn';
  button.textContent = 'Convert full scope';
  button.addEventListener('click', () => {
    clearButton.click();
    queueMicrotask(() => convertButton.click());
  });
  cancelButton.parentElement.insertBefore(button, cancelButton);
}
async function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('ATT file read failed.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });
}
async function hierarchyFromCurrentFile() {
  const file = latestAttributeFile || scanAttributeInputs();
  if (!file) return null;
  const text = await readFileText(file);
  return parseRmssAttributes(text, state.rvm?.routing);
}
function isScopeCard(card) {
  return Boolean(card?.querySelector?.('[data-scope-tree]')
    && card.querySelector('[data-scope-convert]')
    && card.textContent.includes('Select ATT/RVM hierarchy scope'));
}
function installTreeWatch(context) {
  let lifetimeObserver = null;
  const stop = () => {
    treeObserver.disconnect();
    lifetimeObserver?.disconnect();
  };
  const treeObserver = new MutationObserver(() => {
    if (!context.card.isConnected) { stop(); return; }
    if (context.treeElement.querySelector('[data-rvm-full-tree-root]')) return;
    mergeSelectionStates(context.selection, context.treeElement);
    renderFullTree(context);
  });
  lifetimeObserver = new MutationObserver(() => {
    if (!context.card.isConnected) stop();
  });
  treeObserver.observe(context.treeElement, { childList: true });
  lifetimeObserver.observe(document.body, { childList: true, subtree: true });
}
async function enhanceScopeCard(card) {
  if (!isScopeCard(card) || card.dataset.rvmFullScopeTree === VERSION) return;
  card.dataset.rvmFullScopeTree = VERSION;
  installFullScopeButton(card);
  const treeElement = card.querySelector('[data-scope-tree]');
  const expanded = new Map();
  try {
    const hierarchy = await hierarchyFromCurrentFile();
    if (!card.isConnected || !Array.isArray(hierarchy)) return;
    const tree = buildRvmAttributeScopeTree(hierarchy);
    if (!tree.length) return;
    const context = {
      card, treeElement, tree,
      index: modelIndex(tree),
      counts: countRvmAttributeScopeTree(tree),
      selection: selectionStates(treeElement),
      expanded,
      wildcardInput: card.querySelector('[data-scope-wildcard]'),
      statsElement: card.querySelector('[data-scope-stats]'),
    };
    treeElement.addEventListener('change', (event) => updateSelectionCache(context, event), true);
    treeElement.addEventListener('click', (event) => toggleNode(context, event));
    context.wildcardInput?.addEventListener('input', () => queueMicrotask(() => {
      if (card.isConnected && !treeElement.querySelector('[data-rvm-full-tree-root]')) {
        mergeSelectionStates(context.selection, treeElement);
      }
    }));
    mergeSelectionStates(context.selection, treeElement);
    renderFullTree(context);
    installTreeWatch(context);
  } catch (error) {
    console.warn('[RVM scope tree] Full ATT hierarchy enhancement failed.', error);
  }
}
function inspectAddedNode(node) {
  if (!(node instanceof Element)) return;
  const candidates = node.matches('[data-scope-tree]')
    ? [node.parentElement]
    : [...node.querySelectorAll('[data-scope-tree]')].map((tree) => tree.parentElement);
  for (const card of candidates) enhanceScopeCard(card);
}
export function installRvmAttrScopeTreeAddon() {
  if (installed || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  installed = true;
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('input[type="file"]')) rememberInputFiles(event.target);
  }, true);
  scanAttributeInputs();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) inspectAddedNode(node);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  for (const tree of document.querySelectorAll('[data-scope-tree]')) enhanceScopeCard(tree.parentElement);
}
export const __RVMATTR_SCOPE_TREE_ADDON_VERSION__ = VERSION;
