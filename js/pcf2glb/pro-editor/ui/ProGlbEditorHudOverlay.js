export function createHudOverlay(host) {
  const root = document.createElement('div');
  root.className = 'proglb-hud-root';

  const topStrip = document.createElement('div');
  topStrip.className = 'proglb-hud-top';

  const bottomStrip = document.createElement('div');
  bottomStrip.className = 'proglb-hud-bottom';

  const hoverCard = document.createElement('div');
  hoverCard.className = 'proglb-hover-card';
  hoverCard.style.display = 'none';

  root.append(topStrip, bottomStrip, hoverCard);
  host.appendChild(root);

  function pill(label, value, tone = '') {
    return `
      <div class="proglb-hud-pill ${tone}">
        <span class="proglb-hud-pill-label">${escapeHtml(label)}</span>
        <span class="proglb-hud-pill-value">${escapeHtml(value ?? '—')}</span>
      </div>
    `;
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
      hoverCard.innerHTML = `
        <div class="proglb-hover-title">${escapeHtml(title || 'Hover')}</div>
        <div class="proglb-hover-rows">
          ${rows.map(r => `
            <div class="proglb-hover-row">
              <span class="proglb-hover-key">${escapeHtml(r.key)}</span>
              <span class="proglb-hover-val">${escapeHtml(r.value)}</span>
            </div>
          `).join('')}
        </div>
      `;
    },

    hideHover() {
      hoverCard.style.display = 'none';
      hoverCard.innerHTML = '';
    },

    destroy() {
      root.remove();
    }
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
