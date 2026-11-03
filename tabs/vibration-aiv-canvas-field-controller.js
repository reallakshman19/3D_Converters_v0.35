import {
  applyAivCanvasFieldHighlight,
  clearAivCanvasFieldHighlight,
  flashAivCanvasField,
  focusAivCanvasField,
  openAivWorkingTable,
} from './vibration-aiv-canvas-field.js?v=20260816-aiv-canvas-fields-1';

function text(value) { return String(value ?? '').trim(); }
function fieldKey(element) { return text(element?.dataset?.aivFieldKey || element?.dataset?.aivEngineeringFieldKey); }
function card(container) { return container.querySelector('[data-aiv-unified-canvas]'); }
function canvasOwner(element) { return element?.closest?.('[data-aiv-canvas-node],[data-aiv-canvas-segment],[data-aiv-canvas-relationship]') ?? null; }
function setPending(container, key, pending) {
  const value = card(container); if (!value) return;
  if (pending && key) value.dataset.aivEditPendingField = key; else delete value.dataset.aivEditPendingField;
}

export function createAivCanvasFieldController(container, callbacks = {}) {
  let flashedField = null;
  function activateCanvasField(element) {
    const key = text(element?.dataset?.aivCanvasFieldKey); if (!key) return false;
    const owner = canvasOwner(element); if (owner) callbacks.onCanvasOwner?.(owner);
    return focusAivCanvasField(container, key);
  }
  function handleClick(event) {
    const label = event.target?.closest?.('[data-aiv-canvas-field-key]');
    if (label) { activateCanvasField(label); return true; }
    const open = event.target?.closest?.('[data-aiv-canvas-open-table]');
    if (!open) return false;
    openAivWorkingTable(container, open.dataset.aivCanvasOpenTable, open.dataset.aivSelectionKey); return true;
  }
  function handleKeyDown(event) {
    if (!['Enter', ' '].includes(event.key)) return false;
    const label = event.target?.closest?.('[data-aiv-canvas-field-key]'); if (!label) return false;
    activateCanvasField(label); return true;
  }
  function noteCommit(event) {
    const key = fieldKey(event.target); if (!key) return null;
    event.target.removeAttribute('data-aiv-edit-pending'); setPending(container, key, false); callbacks.onFieldCommit?.(key); return key;
  }
  function input(event) {
    const key = fieldKey(event.target); if (!key) return;
    event.target.dataset.aivEditPending = 'true'; setPending(container, key, true);
  }
  function focusIn(event) {
    const key = fieldKey(event.target); if (key) applyAivCanvasFieldHighlight(container, key);
  }
  function focusOut() {
    globalThis.queueMicrotask?.(() => {
      const active = container.ownerDocument?.activeElement;
      if (!fieldKey(active)) clearAivCanvasFieldHighlight(container);
    });
  }
  function sync() {
    const committed = text(card(container)?.dataset.aivLastCommittedField);
    if (committed && committed !== flashedField) { flashAivCanvasField(container, committed); flashedField = committed; }
  }
  container.addEventListener('input', input); container.addEventListener('focusin', focusIn); container.addEventListener('focusout', focusOut);
  return Object.freeze({
    handleClick, handleKeyDown, noteCommit, sync,
    destroy() { container.removeEventListener('input', input); container.removeEventListener('focusin', focusIn); container.removeEventListener('focusout', focusOut); clearAivCanvasFieldHighlight(container); },
  });
}
