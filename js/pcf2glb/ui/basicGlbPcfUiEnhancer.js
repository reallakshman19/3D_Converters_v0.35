const PANEL_WIDTH_KEY = 'basic-glb-property-panel-width-v1';
const PROP_COL_KEY = 'basic-glb-property-panel-label-col-v1';
const MIN_PANEL_WIDTH = 286;
const MAX_PANEL_WIDTH = 760;
const DEFAULT_PANEL_WIDTH = 360;
const MIN_COL = 26;
const MAX_COL = 62;
const DEFAULT_COL = 38;

const ICONS = Object.freeze({
  ISO: '◇',
  TOP: '▣',
  FRONT: '▥',
  SIDE: '▤',
  FIT: '⤢',
  ZOOM_SELECTED: '⌕',
  MARQUEE: '▢',
  CLIP: '◫',
  MEASURE: '⌖',
});

const LABELS = Object.freeze({
  ISO: 'ISO',
  TOP: 'TOP',
  FRONT: 'FRT',
  SIDE: 'SIDE',
  FIT: 'FIT',
  ZOOM_SELECTED: 'ZOOM',
  MARQUEE: 'MZoom',
  CLIP: 'CLIP',
  MEASURE: 'MSR',
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readStoredNumber(key, fallback, min, max) {
  try {
    return clampNumber(window.localStorage?.getItem(key), min, max, fallback);
  } catch {
    return fallback;
  }
}

function storeNumber(key, value) {
  try { window.localStorage?.setItem(key, String(Math.round(value))); } catch {}
}

function injectCss() {
  if (document.getElementById('basic-glb-ui-enhancer-css')) return;
  const style = document.createElement('style');
  style.id = 'basic-glb-ui-enhancer-css';
  style.textContent = `
    #adv-right-dock {
      --adv-prop-label-width: 38%;
      transition: width 80ms ease;
      overflow: visible !important;
    }
    #adv-property-panel {
      min-width: 286px;
      max-width: min(760px, 78vw);
      overflow: visible !important;
    }
    #adv-property-panel .adv-prop-width-grip {
      position: absolute;
      left: -7px;
      top: 48px;
      bottom: 8px;
      width: 10px;
      cursor: ew-resize;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(96,165,250,.18), rgba(14,165,233,.06));
      border-left: 1px solid rgba(147,197,253,.42);
      opacity: .72;
      z-index: 3;
    }
    #adv-property-panel .adv-prop-width-grip:hover,
    #adv-property-panel .adv-prop-width-grip.is-dragging {
      opacity: 1;
      background: rgba(96,165,250,.22);
      border-left-color: rgba(191,219,254,.8);
    }
    #adv-property-panel .adv-prop-layout-tools {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      color: #cbd5e1;
      font-size: 10px;
      white-space: nowrap;
    }
    #adv-property-panel .adv-prop-layout-tools input[type='range'] {
      width: 74px;
      accent-color: #38bdf8;
    }
    #adv-property-panel .adv-prop-layout-tools button {
      border: 1px solid rgba(148,163,184,.26);
      background: rgba(15,23,42,.64);
      color: #dbeafe;
      border-radius: 8px;
      height: 22px;
      padding: 0 6px;
      cursor: pointer;
      font-size: 10px;
      font-weight: 800;
    }
    #adv-property-content div[style*='grid-template-columns'] {
      grid-template-columns: minmax(86px, var(--adv-prop-label-width, 38%)) minmax(0, 1fr) auto !important;
    }
    #adv-property-content table td:first-child {
      width: var(--adv-prop-label-width, 38%) !important;
    }
    #adv-property-content div[style*='grid-template-columns'] > div:nth-child(1),
    #adv-property-content table td:first-child {
      overflow-wrap: anywhere;
    }
    #adv-property-content div[style*='grid-template-columns'] > div:nth-child(2),
    #adv-property-content table td:nth-child(2) {
      overflow-wrap: anywhere;
      word-break: break-word;
      min-width: 0;
    }
    #adv-nav-strip button[data-adv-nav],
    #adv-toolbar .btn-icon {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      line-height: 1 !important;
    }
    .adv-compact-icon {
      font-size: 13px;
      line-height: 1;
      opacity: .92;
      font-weight: 900;
    }
    .adv-compact-label {
      font-size: 10px;
      letter-spacing: .06em;
      font-weight: 800;
    }
    @media (max-width: 1180px) {
      #adv-toolbar .adv-compact-label { display: none; }
      #adv-toolbar .btn-icon { min-width: 34px; padding-left: 8px !important; padding-right: 8px !important; }
    }
  `;
  document.head.appendChild(style);
}

function setDockWidth(dock, width) {
  if (!dock) return;
  const safeWidth = clampNumber(width, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, DEFAULT_PANEL_WIDTH);
  dock.style.width = `${safeWidth}px`;
  storeNumber(PANEL_WIDTH_KEY, safeWidth);
}

function setColumnWidth(dock, content, value) {
  const pct = clampNumber(value, MIN_COL, MAX_COL, DEFAULT_COL);
  dock?.style?.setProperty('--adv-prop-label-width', `${pct}%`);
  content?.style?.setProperty('--adv-prop-label-width', `${pct}%`);
  storeNumber(PROP_COL_KEY, pct);
  content?.querySelectorAll?.("div[style*='grid-template-columns']")?.forEach((row) => {
    row.style.gridTemplateColumns = `minmax(86px, var(--adv-prop-label-width, ${pct}%)) minmax(0, 1fr) auto`;
  });
}

function enhancePropertyPanel(root) {
  const dock = root.querySelector('#adv-right-dock');
  const panel = root.querySelector('#adv-property-panel');
  const content = root.querySelector('#adv-property-content');
  if (!dock || !panel || !content || panel.dataset.layoutEnhanced === '1') return;
  panel.dataset.layoutEnhanced = '1';
  panel.style.position = panel.style.position || 'relative';
  panel.style.boxSizing = 'border-box';

  setDockWidth(dock, readStoredNumber(PANEL_WIDTH_KEY, DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH));
  setColumnWidth(dock, content, readStoredNumber(PROP_COL_KEY, DEFAULT_COL, MIN_COL, MAX_COL));

  const grip = document.createElement('div');
  grip.className = 'adv-prop-width-grip';
  grip.title = 'Drag to resize Component Properties panel width';
  panel.appendChild(grip);

  grip.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = dock.getBoundingClientRect().width || DEFAULT_PANEL_WIDTH;
    grip.classList.add('is-dragging');
    grip.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent) => {
      setDockWidth(dock, startWidth + (startX - moveEvent.clientX));
    };
    const onUp = () => {
      grip.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });

  const header = panel.firstElementChild;
  if (header && !header.querySelector('.adv-prop-layout-tools')) {
    const tools = document.createElement('span');
    tools.className = 'adv-prop-layout-tools';
    const initialCol = readStoredNumber(PROP_COL_KEY, DEFAULT_COL, MIN_COL, MAX_COL);
    tools.innerHTML = `
      <label title="Adjust label/data column split" style="display:inline-flex;align-items:center;gap:4px;">Cols
        <input id="adv-prop-col-width" type="range" min="${MIN_COL}" max="${MAX_COL}" value="${initialCol}">
      </label>
      <button type="button" id="adv-prop-width-reset" title="Reset panel width and column split">RST</button>
    `;
    const close = header.querySelector('#btn-adv-close-props');
    if (close) header.insertBefore(tools, close); else header.appendChild(tools);
    const slider = tools.querySelector('#adv-prop-col-width');
    slider?.addEventListener('input', () => setColumnWidth(dock, content, slider.value));
    tools.querySelector('#adv-prop-width-reset')?.addEventListener('click', () => {
      setDockWidth(dock, DEFAULT_PANEL_WIDTH);
      setColumnWidth(dock, content, DEFAULT_COL);
      if (slider) slider.value = String(DEFAULT_COL);
    });
  }

  const observer = new MutationObserver(() => {
    setColumnWidth(dock, content, readStoredNumber(PROP_COL_KEY, DEFAULT_COL, MIN_COL, MAX_COL));
  });
  observer.observe(content, { childList: true, subtree: true });
}

function replaceButtonHtml(button, icon, label) {
  if (!button || button.dataset.iconEnhanced === '1') return;
  button.dataset.iconEnhanced = '1';
  button.innerHTML = `<span class="adv-compact-icon" aria-hidden="true">${icon}</span><span class="adv-compact-label">${label}</span>`;
}

function enhanceIcons(root) {
  root.querySelectorAll('#adv-nav-strip button[data-adv-nav]').forEach((button) => {
    const action = button.getAttribute('data-adv-nav');
    replaceButtonHtml(button, ICONS[action] || '•', LABELS[action] || button.textContent.trim());
  });

  const topButtons = [
    ['#adv-view-iso', '◇', 'ISO'],
    ['#adv-view-top', '▣', 'TOP'],
    ['#adv-view-front', '▥', 'FRONT'],
    ['#adv-view-side', '▤', 'SIDE'],
    ['#adv-view-fit', '⤢', 'FIT'],
    ['#adv-measure-btn', '⌖', 'MSR'],
    ['#adv-section-btn', '◫', 'CLIP'],
  ];
  for (const [selector, icon, label] of topButtons) {
    replaceButtonHtml(root.querySelector(selector), icon, label);
  }
}

function enhanceAll() {
  injectCss();
  const roots = document.querySelectorAll('#basic-glb-shell, .app-content');
  roots.forEach((root) => {
    enhancePropertyPanel(root);
    enhanceIcons(root);
  });
}

if (typeof window !== 'undefined') {
  injectCss();
  const observer = new MutationObserver(enhanceAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(enhanceAll);
  window.addEventListener('load', enhanceAll, { once: true });
}

export { enhanceAll as enhanceBasicGlbPcfUi };
