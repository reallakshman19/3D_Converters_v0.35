export function createPRO2EDITOR_HudOverlay(host) {
  const root = document.createElement('div');
  root.className = 'pro2editor-hud-root';
  const topStrip = document.createElement('div');
  topStrip.className = 'pro2editor-hud-top';
  const bottomStrip = document.createElement('div');
  bottomStrip.className = 'pro2editor-hud-bottom';
  const hoverCard = document.createElement('div');
  hoverCard.className = 'pro2editor-hover-card';
  hoverCard.style.display = 'none';
  root.append(topStrip, bottomStrip, hoverCard);
  host.appendChild(root);

  function pill(label, value, tone = '') {
    return `<div class="pro2editor-hud-pill ${tone}"><span class="pro2editor-hud-pill-label">${escapeHtml(label)}</span><span class="pro2editor-hud-pill-value">${escapeHtml(value ?? '—')}</span></div>`;
  }

  return {
    setStatus(data = {}) {
      topStrip.innerHTML = [
        pill('Tool', data.tool || 'Select'),
        pill('Snap', data.snap || 'Off', data.snap?.startsWith('On') ? 'ok' : 'warn'),
        pill('Grid', data.grid || '10 mm'),
        pill('Angle', data.angle || '15°'),
        pill('View', data.view || 'Perspective'),
      ].join('');
      bottomStrip.innerHTML = [
        pill('Selection', data.selection || 'None'),
        pill('XYZ', data.xyz || '—'),
        pill('FPS', data.fps != null ? String(data.fps) : '—', (data.fps || 0) >= 30 ? 'ok' : 'warn'),
      ].join('');
    },
    showHover({ x = 0, y = 0, title = '', rows = [] } = {}) {
      hoverCard.style.display = 'block';
      hoverCard.style.left = `${x + 18}px`;
      hoverCard.style.top = `${y + 18}px`;
      hoverCard.innerHTML = `<div class="pro2editor-hover-title">${escapeHtml(title || 'Hover')}</div><div class="pro2editor-hover-rows">${rows.map(r => `<div class="pro2editor-hover-row"><span class="pro2editor-hover-key">${escapeHtml(r.key)}</span><span class="pro2editor-hover-val">${escapeHtml(r.value)}</span></div>`).join('')}</div>`;
    },
    hideHover() {
      hoverCard.style.display = 'none';
      hoverCard.innerHTML = '';
    },
    destroy() { root.remove(); }
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
