export function createShortcutController({ onAction, enabled = true }) {
  const keymap = new Map([
    ['1', 'tool:select'],
    ['2', 'tool:move'],
    ['3', 'tool:rotate'],
    ['4', 'tool:measure'],
    ['5', 'tool:break'],
    ['6', 'tool:connect'],
    ['7', 'tool:stretch'],
    ['8', 'tool:marquee'],
    ['w', 'tool:move'],
    ['e', 'tool:rotate'],
    ['m', 'tool:measure'],
    ['b', 'tool:break'],
    ['c', 'tool:connect'],
    ['s', 'tool:stretch'],
    ['q', 'tool:marquee'],
    ['f', 'view:fit'],
    ['h', 'view:home'],
    ['i', 'view:iso'],
    ['o', 'view:ortho'],
    ['p', 'view:persp'],
    ['g', 'toggle:snap'],
    ['delete', 'selection:delete'],
    ['escape', 'tool:cancel'],
  ]);

  function onKeyDown(event) {
    if (!enabled) return;
    if (shouldIgnore(event.target)) return;

    const key = String(event.key || '').toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      onAction?.('history:undo', event);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && ((key === 'y') || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      onAction?.('history:redo', event);
      return;
    }

    if (event.shiftKey && key === 't') { event.preventDefault(); onAction?.('view:top', event); return; }
    if (event.shiftKey && key === 'f') { event.preventDefault(); onAction?.('view:front', event); return; }
    if (event.shiftKey && key === 'b') { event.preventDefault(); onAction?.('view:back', event); return; }
    if (event.shiftKey && key === 'l') { event.preventDefault(); onAction?.('view:left', event); return; }
    if (event.shiftKey && key === 'r') { event.preventDefault(); onAction?.('view:right', event); return; }
    if (event.shiftKey && key === 'd') { event.preventDefault(); onAction?.('view:bottom', event); return; }

    const action = keymap.get(key);
    if (!action) return;

    event.preventDefault();
    onAction?.(action, event);
  }

  window.addEventListener('keydown', onKeyDown);

  return {
    setEnabled(value) {
      enabled = !!value;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
    }
  };
}

function shouldIgnore(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}
