const ICON_PATHS = Object.freeze({
  analyze: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><path d="m9 15 1.4-3.6L14 10l-3.6-1.4L9 5 7.6 8.6 4 10l3.6 1.4Z"/>',
  preview: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/>',
  apply: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 3 7.7 7 10 4-2.3 7-5.4 7-10V6l-7-3Z"/><path d="m8.8 12 2 2 4.5-4.5"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5.5 15a7 7 0 1 0 1-8.5L4 10"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h3m4 0h9M4 18h7m4 0h5"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>',
  samples: '<path d="M7 7h13v13H7z"/><path d="M4 4h13v3M4 4v13h3"/>',
  formats: '<path d="M12 3v6M12 9 6 15M12 9l6 6"/><path d="M4 15h4v4H4zM10 3h4v4h-4zM16 15h4v4h-4z"/>',
  trusted: '<path d="M12 3 5 6v5c0 4.6 3 7.7 7 10 4-2.3 7-5.4 7-10V6l-7-3Z"/><path d="m8.8 12 2 2 4.5-4.5"/>',
  approximate: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M8 12h8"/>',
  conflict: '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 9v5m0 3h.01"/>',
  rejected: '<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/>',
  coverage: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 12 4-4"/><circle cx="12" cy="18" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2.6"/>',
  fill: '<path d="M5 4h14v6H5zM5 14h14v6H5z"/><path d="m12 7 3 3-3 3M9 10h6"/>',
  refresh: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 11m2 4a7 7 0 0 0 12 2l2-4"/>',
  rows: '<path d="M5 5h14v4H5zM5 11h14v4H5zM5 17h14v2H5z"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  diameter: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5 17.5 6.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  tag: '<path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1.2"/>',
  rating: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 12 3-3"/>',
});

function iconMarkup(name) {
  return ICON_PATHS[name] || ICON_PATHS.info;
}

export function createSmartIcon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'mc-smart-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconMarkup(name)}</svg>`;
  Object.assign(span.style, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: '0' });
  return span;
}

export function createSmartIconButton(name, label, onClick, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mc-smart-icon-button${options.active ? ' is-active' : ''}`;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.dataset.smartAction = options.action || name;
  Object.assign(button.style, {
    width: '30px', height: '30px', padding: '0', borderRadius: '6px',
    border: `1px solid ${options.border || 'rgba(148,163,184,.28)'}`,
    background: options.active ? 'rgba(59,130,246,.25)' : 'rgba(15,23,42,.56)',
    color: options.color || '#cbd5e1', cursor: options.disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    opacity: options.disabled ? '.45' : '1'
  });
  button.disabled = Boolean(options.disabled);
  button.appendChild(createSmartIcon(name, options.size || 16));
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

export function createSmartMetricChip(name, value, label, options = {}) {
  const button = createSmartIconButton(name, `${label}: ${value}`, options.onClick, {
    action: options.action || name,
    color: options.color || '#cbd5e1',
    border: options.border,
  });
  button.classList.add('mc-smart-metric');
  button.style.width = 'auto';
  button.style.minWidth = '52px';
  button.style.gap = '5px';
  button.style.padding = '0 8px';
  const count = document.createElement('strong');
  count.textContent = String(value);
  count.style.fontSize = '11px';
  count.style.fontVariantNumeric = 'tabular-nums';
  button.appendChild(count);
  return button;
}

export function createSmartToolbar() {
  const bar = document.createElement('div');
  bar.className = 'mc-smart-toolbar';
  Object.assign(bar.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: '8px', padding: '8px', margin: '8px 0 12px',
    border: '1px solid rgba(59,130,246,.24)', borderRadius: '8px',
    background: 'rgba(2,6,23,.45)'
  });
  const actions = document.createElement('div');
  const metrics = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '6px', alignItems: 'center' });
  Object.assign(metrics.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' });
  bar.append(actions, metrics);
  return { bar, actions, metrics };
}

export function smartStatusColor(status) {
  if (status === 'READY_TO_APPLY') return '#4ade80';
  if (status === 'REVIEW_REQUIRED') return '#fbbf24';
  if (status === 'BLOCKED' || status === 'STALE') return '#f87171';
  return '#94a3b8';
}
