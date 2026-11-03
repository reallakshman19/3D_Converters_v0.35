import { createPRO2EDITOR_HudOverlay } from './PRO2EDITOR_HudOverlay.js';
import { createPRO2EDITOR_ShortcutController } from './PRO2EDITOR_ShortcutController.js';
import { createPRO2EDITOR_ViewerApp } from '../core/PRO2EDITOR_createViewerApp.js';
import { loadMockPcfToGlbUrl, loadMockGlbUrl } from '../../pro-editor/core/mockLoader.js';
import { getRow, onChange as onDataChange, loadDataTable } from '../core/PRO2EDITOR_dataStore.js';

export function renderPRO2EDITOR_Panel(container) {
  injectStyles();
  loadDataTable([]);

  container.innerHTML = `
    <div id="pro2editor-root" class="pro2editor-shell">
      <header class="pro2editor-topbar">
        <div class="pro2editor-topbar-row pro2editor-topbar-row-main">
          <button class="pro2editor-btn" data-action="import">Import</button>
          <button class="pro2editor-btn" data-action="mock-pcf">PCF</button>
          <button class="pro2editor-btn" data-action="mock-glb">GLB</button>
          <div class="pro2editor-divider"></div>
          <button class="pro2editor-btn" data-action="export">Export</button>
          <button class="pro2editor-btn" data-action="undo">Undo</button>
          <button class="pro2editor-btn" data-action="redo">Redo</button>
          <div class="pro2editor-divider"></div>
          <button class="pro2editor-btn active" data-action="select">Select</button>
          <button class="pro2editor-btn" data-action="move">Move</button>
          <button class="pro2editor-btn" data-action="rotate">Rotate</button>
          <button class="pro2editor-btn" data-action="measure">Measure</button>
          <button class="pro2editor-btn" data-action="break">Break</button>
          <button class="pro2editor-btn" data-action="connect">Connect</button>
          <button class="pro2editor-btn" data-action="stretch">Stretch</button>
          <button class="pro2editor-btn" data-action="marquee">Marquee</button>
          <div class="pro2editor-spacer"></div>
          <button class="pro2editor-btn" data-action="views-menu">Views ▾</button>
        </div>
        <div class="pro2editor-topbar-row pro2editor-topbar-row-sub">
          <button class="pro2editor-btn minor" data-action="toggle-projection">Ortho / Persp</button>
          <button class="pro2editor-btn minor" data-action="home">Home</button>
          <button class="pro2editor-btn minor" data-action="fit">Fit</button>
          <div class="pro2editor-divider"></div>
          <label class="pro2editor-label">Snap <input id="pro2editor-snap-toggle" type="checkbox" checked></label>
          <label class="pro2editor-label">Grid <input id="pro2editor-grid-mm" type="number" value="100"></label>
          <label class="pro2editor-label">Angle <input id="pro2editor-angle-deg" type="number" value="90"></label>
        </div>
      </header>

      <section class="pro2editor-middle">
        <aside class="pro2editor-panel pro2editor-panel-left">
          <div class="pro2editor-tabs">
            <button class="pro2editor-tab active" data-pane="model">Model</button>
            <button class="pro2editor-tab" data-pane="tools">Tools</button>
            <button class="pro2editor-tab" data-pane="annotations">Annotations</button>
          </div>
          <div class="pro2editor-panel-content">
            <div class="pro2editor-pane active" data-pane="model"><div id="pro2editor-model-tree">Tree will load here…</div></div>
            <div class="pro2editor-pane" data-pane="tools">
              <div class="pro2editor-form-grid">
                <label>Projection</label>
                <select id="pro2editor-projection-select">
                  <option value="PERSPECTIVE">Perspective</option>
                  <option value="ORTHOGRAPHIC">Orthographic</option>
                </select>
                <label>FOV</label>
                <input id="pro2editor-fov-input" type="range" min="20" max="120" step="1" value="60">
                <label>Smooth</label>
                <input id="pro2editor-smooth-input" type="range" min="0" max="2" step="0.05" value="0.35">
                
                <label>Theme</label>
                <select id="pro2editor-theme-select">
                  <option value="DARK">Dark</option>
                  <option value="LIGHT">Light</option>
                  <option value="BLUE">Blue</option>
                </select>
              </div>
            </div>
            <div class="pro2editor-pane" data-pane="annotations"><div class="pro2editor-empty-note">Annotations will be added later.</div></div>
          </div>
        </aside>

        <main class="pro2editor-canvas-area">
          <div id="pro2editor-canvas-container" class="pro2editor-canvas-host"></div>
          <div id="pro2editor-hidden-toolbar" style="display:none;"></div>
        </main>

        <aside class="pro2editor-panel pro2editor-panel-right">
          <div class="pro2editor-tabs"><button class="pro2editor-tab active">Properties</button></div>
          <div id="pro2editor-properties-panel" class="pro2editor-panel-content"><div class="pro2editor-empty-note">Select an object…</div></div>
        </aside>
      </section>

      <footer class="pro2editor-footer">
        <div class="pro2editor-debug-header">Debug Console</div>
        <div id="pro2editor-debug-logs" class="pro2editor-debug-content"></div>
      </footer>

      <input type="file" id="pro2editor-file-input" accept=".glb,.gltf" style="display:none;">
      <div id="pro2editor-properties-hidden" style="display:none;"></div>
    </div>
  `;

  const root = container.querySelector('#pro2editor-root');
  const canvasContainer = container.querySelector('#pro2editor-canvas-container');
  const fileInput = container.querySelector('#pro2editor-file-input');
  const hiddenToolbar = container.querySelector('#pro2editor-hidden-toolbar');
  const propPanel = container.querySelector('#pro2editor-properties-panel');
  const propContent = container.querySelector('#pro2editor-properties-hidden');
  const debugLogs = container.querySelector('#pro2editor-debug-logs');
  const snapToggle = container.querySelector('#pro2editor-snap-toggle');
  const gridInput = container.querySelector('#pro2editor-grid-mm');
  const angleInput = container.querySelector('#pro2editor-angle-deg');
  const projectionSelect = container.querySelector('#pro2editor-projection-select');
  const fovInput = container.querySelector('#pro2editor-fov-input');
  const smoothInput = container.querySelector('#pro2editor-smooth-input');
  const themeSelect = container.querySelector('#pro2editor-theme-select');

  const uiState = {
    tool: 'select', snapEnabled: true, gridMm: 100, angleDeg: 90,
    projection: 'PERSPECTIVE', fps: 0, selection: 'None', objectUrl: null,
    perfHandle: 0, hoverHandle: 0, frameCounter: 0, lastPerfTs: performance.now(), destroyed: false,
  };

  const viewer = createPRO2EDITOR_ViewerApp(canvasContainer, hiddenToolbar, propPanel, propContent, debugLogs, {
    disableInternalPropertyPanel: true,
    onSceneLoaded: ({ sceneIndex }) => {
      renderModelTree(sceneIndex);
      log('INFO', 'SCENE', `Loaded ${sceneIndex?.items?.length ?? 0} indexed objects`);
      updateHud();
    },
    onSelectionChange: (item) => {
      currentSelectedItem = item;
      uiState.selection = item?.id || item?.refNo || item?.type || 'None';
      updateHud();
      updatePropertyPanel();
    },
    onFrame: () => { uiState.frameCounter += 1; }
  });

  const hud = createPRO2EDITOR_HudOverlay(canvasContainer);
  const shortcuts = createPRO2EDITOR_ShortcutController({ onAction: handleShortcut });
  let currentSelectedItem = null;
  const unsubscribeData = onDataChange(() => { if (currentSelectedItem) updatePropertyPanel(); });

  wireTabs();
  wireInputs();
  wireToolbar();
  wireHover();
  startPerfLoop();
  updateHud();

  return {
    destroy() {
      uiState.destroyed = true;
      if (uiState.perfHandle) cancelAnimationFrame(uiState.perfHandle);
      if (uiState.hoverHandle) cancelAnimationFrame(uiState.hoverHandle);
      shortcuts.destroy();
      hud.destroy();
      viewer.dispose();
      if (uiState.objectUrl) URL.revokeObjectURL(uiState.objectUrl);
      unsubscribeData?.();
    }
  };

  function wireTabs() {
    root.querySelectorAll('.pro2editor-tab[data-pane]').forEach(tab => {
      tab.addEventListener('click', () => {
        const pane = tab.dataset.pane;
        root.querySelectorAll('.pro2editor-tab[data-pane]').forEach(t => t.classList.toggle('active', t === tab));
        root.querySelectorAll('.pro2editor-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === pane));
      });
    });
  }

  function wireInputs() {
    snapToggle.addEventListener('change', () => { uiState.snapEnabled = snapToggle.checked; syncSnaps(); });
    gridInput.addEventListener('change', () => { uiState.gridMm = Math.max(1, Number(gridInput.value) || 100); syncSnaps(); });
    angleInput.addEventListener('change', () => { uiState.angleDeg = Math.max(1, Number(angleInput.value) || 90); syncSnaps(); });
    projectionSelect.addEventListener('change', () => { uiState.projection = projectionSelect.value; viewer.setProjection(uiState.projection); updateHud(); });
    fovInput.addEventListener('input', () => { viewer.getController()?.setPerspectiveFov(Number(fovInput.value) || 60); updateHud(); });
    smoothInput.addEventListener('input', () => { viewer.getController()?.setSmoothTime(Number(smoothInput.value) || 0.35); });
    themeSelect.addEventListener('change', () => { viewer.setTheme(themeSelect.value); });
    syncSnaps();
  }

  function wireToolbar() {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.pro2editor-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'import') { fileInput.click(); return; }
      if (action === 'mock-pcf') {
        btn.disabled = true; btn.textContent = 'Loading...';
        try { const url = await loadMockPcfToGlbUrl(); await loadUrl(url); }
        catch (err) { console.error(err); }
        finally { btn.disabled = false; btn.textContent = 'PCF'; }
        return;
      }
      if (action === 'mock-glb') {
        btn.disabled = true; btn.textContent = 'Loading...';
        try { const url = await loadMockGlbUrl(); await loadUrl(url); }
        catch (err) { console.error(err); }
        finally { btn.disabled = false; btn.textContent = 'GLB'; }
        return;
      }
      if (['select','move','rotate','measure','break','connect','stretch','marquee'].includes(action)) {
        uiState.tool = action;
        viewer.setToolMode(action);
        updateToolButtons();
        updateHud();
        if (['break','connect','stretch','marquee'].includes(action)) {
          log('INFO', 'TOOL', `${action} tool selected (functionality pending)`);
        }
        return;
      }
      if (action === 'undo') { viewer.undo?.(); return; }
      if (action === 'redo') { viewer.redo?.(); return; }
      if (action === 'fit') { viewer.fitAll(); return; }
      if (action === 'home') { viewer.home(); return; }
      if (action === 'toggle-projection') {
        uiState.projection = uiState.projection === 'PERSPECTIVE' ? 'ORTHOGRAPHIC' : 'PERSPECTIVE';
        projectionSelect.value = uiState.projection;
        viewer.setProjection(uiState.projection);
        updateHud();
        return;
      }
      log('WARN', 'UI', `${action} not yet implemented`);
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (uiState.objectUrl) URL.revokeObjectURL(uiState.objectUrl);
      uiState.objectUrl = URL.createObjectURL(file);
      await loadUrl(uiState.objectUrl);
    });

    canvasContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    canvasContainer.addEventListener('drop', async (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf'))) {
        if (uiState.objectUrl) URL.revokeObjectURL(uiState.objectUrl);
        uiState.objectUrl = URL.createObjectURL(file);
        await loadUrl(uiState.objectUrl);
      }
    });
  }

  async function loadUrl(url) { await viewer.loadGLB(url); viewer.fitAll(); updateHud(); }

  function wireHover() {
    canvasContainer.addEventListener('pointerleave', () => { hud.hideHover(); });
    canvasContainer.addEventListener('pointermove', (event) => {
      if (uiState.hoverHandle) cancelAnimationFrame(uiState.hoverHandle);
      uiState.hoverHandle = requestAnimationFrame(() => {
        const picked = viewer.pickAtClient?.(event.clientX, event.clientY);
        if (!picked || !picked.hit) { hud.hideHover(); updateHud('—'); return; }
        const point = picked.hit.point;
        const xyz = `${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)}`;
        hud.showHover({
          x: event.offsetX,
          y: event.offsetY,
          title: picked.item?.type || picked.object?.userData?.pcfType || 'Component',
          rows: [
            { key: 'Id', value: picked.item?.id || picked.object?.userData?.pcfId || '—' },
            { key: 'Ref', value: picked.item?.refNo || picked.object?.userData?.REF_NO || '—' },
            { key: 'XYZ', value: xyz },
          ]
        });
        updateHud(xyz);
      });
    });
  }

  function handleShortcut(action) {
    if (action === 'tool:select') { uiState.tool = 'select'; viewer.setToolMode('select'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:move') { uiState.tool = 'move'; viewer.setToolMode('move'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:rotate') { uiState.tool = 'rotate'; viewer.setToolMode('rotate'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:measure') { uiState.tool = 'measure'; viewer.setToolMode('measure'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:break') { uiState.tool = 'break'; viewer.setToolMode('break'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:connect') { uiState.tool = 'connect'; viewer.setToolMode('connect'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:stretch') { uiState.tool = 'stretch'; viewer.setToolMode('stretch'); updateToolButtons(); updateHud(); return; }
    if (action === 'tool:marquee') { uiState.tool = 'marquee'; viewer.setToolMode('marquee'); updateToolButtons(); updateHud(); return; }
    if (action === 'view:fit') { viewer.fitAll(); return; }
    if (action === 'view:home') { viewer.home(); return; }
    if (action === 'view:iso') { viewer.getController()?.setPresetView('ISO'); updateHud(); return; }
    if (action === 'view:ortho') { uiState.projection = 'ORTHOGRAPHIC'; projectionSelect.value = uiState.projection; viewer.setProjection(uiState.projection); updateHud(); return; }
    if (action === 'view:persp') { uiState.projection = 'PERSPECTIVE'; projectionSelect.value = uiState.projection; viewer.setProjection(uiState.projection); updateHud(); return; }
    if (action === 'view:top') { viewer.getController()?.setPresetView('TOP'); updateHud(); return; }
    if (action === 'view:front') { viewer.getController()?.setPresetView('FRONT'); updateHud(); return; }
    if (action === 'view:back') { viewer.getController()?.setPresetView('BACK'); updateHud(); return; }
    if (action === 'view:left') { viewer.getController()?.setPresetView('LEFT'); updateHud(); return; }
    if (action === 'view:right') { viewer.getController()?.setPresetView('RIGHT'); updateHud(); return; }
    if (action === 'view:bottom') { viewer.getController()?.setPresetView('BOTTOM'); updateHud(); return; }
    if (action === 'toggle:snap') { uiState.snapEnabled = !uiState.snapEnabled; snapToggle.checked = uiState.snapEnabled; syncSnaps(); return; }
    if (action === 'history:undo') { viewer.undo?.(); return; }
    if (action === 'history:redo') { viewer.redo?.(); return; }
  }

  function syncSnaps() { viewer.setSnapSettings(uiState.snapEnabled, uiState.gridMm, uiState.angleDeg); updateHud(); }

  function updateToolButtons() {
    root.querySelectorAll('.pro2editor-btn[data-action="select"], .pro2editor-btn[data-action="move"], .pro2editor-btn[data-action="rotate"], .pro2editor-btn[data-action="measure"], .pro2editor-btn[data-action="break"], .pro2editor-btn[data-action="connect"], .pro2editor-btn[data-action="stretch"], .pro2editor-btn[data-action="marquee"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.action === uiState.tool);
    });
  }

  function renderModelTree(sceneIndex) {
    const tree = root.querySelector('#pro2editor-model-tree');
    const items = sceneIndex?.items || [];
    tree.innerHTML = items.length
      ? items.slice(0, 60).map(item => `<div class="tree-row">${item.type} <span>${item.id || item.refNo || '—'}</span></div>`).join('')
      : '<div class="pro2editor-empty-note">No indexed items.</div>';
  }

  function startPerfLoop() {
    function tick(ts) {
      if (uiState.destroyed) return;
      const dt = ts - uiState.lastPerfTs;
      if (dt >= 500) {
        uiState.fps = Math.round((uiState.frameCounter * 1000) / dt);
        uiState.frameCounter = 0;
        uiState.lastPerfTs = ts;
        updateHud();
      }
      uiState.perfHandle = requestAnimationFrame(tick);
    }
    uiState.perfHandle = requestAnimationFrame(tick);
  }

  function updateHud(xyz = '—') {
    const controller = viewer?.getController?.();
    const preset = controller?.getPresetView?.() || 'ISO';
    const projection = viewer?.getProjectionMode?.() || uiState.projection;
    hud.setStatus({
      tool: uiState.tool,
      snap: uiState.snapEnabled ? `On · ${uiState.gridMm}mm` : 'Off',
      grid: `${uiState.gridMm}mm`,
      angle: `${uiState.angleDeg}°`,
      view: `${projection === 'ORTHOGRAPHIC' ? 'Ortho' : 'Persp'} · ${preset}`,
      selection: uiState.selection,
      xyz,
      fps: uiState.fps,
    });
  }

  function updatePropertyPanel() {
    if (!propPanel) return;
    if (!currentSelectedItem) {
      propPanel.innerHTML = '<div class="pro2editor-empty-note">Select an object…</div>';
      return;
    }
    const id = currentSelectedItem.id || currentSelectedItem.refNo || currentSelectedItem.type;
    const row = id != null ? getRow(id) : undefined;
    if (!row) {
      propPanel.innerHTML = `<div class="pro2editor-empty-note">No data for ${escapeHtml(id)}</div>`;
      return;
    }
    const entries = Object.entries(row).filter(([k]) => k !== 'id');
    let rowsHtml = '';
    for (const [key, value] of entries) {
      rowsHtml += `<tr><td style="padding:3px 4px;border-bottom:1px solid #2a2a3a;color:#889aaa;width:45%;word-break:break-word;">${escapeHtml(key)}</td><td style="padding:3px 4px;border-bottom:1px solid #2a2a3a;color:#e0e0e0;word-break:break-word;">${escapeHtml(String(value))}</td></tr>`;
    }
    const title = escapeHtml(String(id));
    propPanel.innerHTML = `<div style="font-size:12px;font-weight:bold;color:#cce;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #334;">${title}</div><table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:11px;"><tbody>${rowsHtml}</tbody></table>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function log(level, channel, message) {
    const row = document.createElement('div');
    row.className = 'pro2editor-log-row';
    row.innerHTML = `<span>[${level}]</span> <span>[${channel}]</span> <span>${message}</span>`;
    debugLogs.prepend(row);
  }
}

function injectStyles() {
  if (document.getElementById('pro2editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'pro2editor-styles';
  style.textContent = `
    .pro2editor-shell{display:flex;flex-direction:column;height:calc(100vh - 120px);background:#0f151c;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif}
    .pro2editor-topbar{display:flex;flex-direction:column;background:#1e293b;border-bottom:1px solid #334155}
    .pro2editor-topbar-row{display:flex;align-items:center;padding:0 12px;height:40px;gap:8px}
    .pro2editor-topbar-row-sub{height:32px;background:#151e2b;border-top:1px solid #283548;font-size:12px}
    .pro2editor-btn{background:transparent;border:1px solid transparent;color:#cbd5e1;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px}
    .pro2editor-btn:hover{background:#334155}
    .pro2editor-btn.active{background:#d97706;color:#fff}
    .pro2editor-divider{width:1px;height:16px;background:#334155;margin:0 4px}
    .pro2editor-spacer{flex:1}
    .pro2editor-label{display:flex;align-items:center;gap:4px;color:#94a3b8}
    .pro2editor-middle{display:flex;flex:1;min-height:0}
    .pro2editor-panel{width:300px;background:#1e293b;display:flex;flex-direction:column;border-right:1px solid #334155}
    .pro2editor-panel-right{border-right:none;border-left:1px solid #334155}
    .pro2editor-tabs{display:flex;background:#0f151c;border-bottom:1px solid #334155}
    .pro2editor-tab{flex:1;background:transparent;border:none;color:#94a3b8;padding:8px 0;cursor:pointer;border-bottom:2px solid transparent}
    .pro2editor-tab.active{color:#fff;border-bottom-color:#f59e0b}
    .pro2editor-panel-content{flex:1;overflow:auto;position:relative}
    .pro2editor-pane{display:none;padding:12px}
    .pro2editor-pane.active{display:block}
    .pro2editor-canvas-area{flex:1;position:relative;background:#000}
    .pro2editor-canvas-host{position:absolute;inset:0}
    .pro2editor-footer{height:180px;background:#1e293b;border-top:1px solid #334155;display:flex;flex-direction:column}
    .pro2editor-debug-header{padding:4px 12px;font-size:12px;color:#94a3b8;border-bottom:1px solid #334155;background:#0f151c}
    .pro2editor-debug-content{flex:1;overflow:auto;padding:8px 12px;font-family:monospace;font-size:11px;color:#a7f3d0}
    .tree-row{padding:4px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05)}
    .tree-row span{color:#94a3b8;margin-left:6px}
    .pro2editor-form-grid{display:grid;grid-template-columns:90px 1fr;gap:10px 12px;align-items:center}
    .pro2editor-form-grid input,.pro2editor-form-grid select{width:100%;box-sizing:border-box;background:#0f151c;border:1px solid #334155;color:#fff;padding:6px;border-radius:4px}
    .pro2editor-empty-note{padding:12px;font-size:12px;color:#9fb3c8}
    .pro2editor-hud-root{position:absolute;inset:0;pointer-events:none;z-index:10}
    .pro2editor-hud-top,.pro2editor-hud-bottom{position:absolute;left:12px;display:flex;gap:8px;flex-wrap:wrap}
    .pro2editor-hud-top{top:12px}
    .pro2editor-hud-bottom{bottom:12px}
    .pro2editor-hud-pill{display:flex;gap:8px;padding:7px 11px;border:1px solid rgba(255,255,255,0.1);border-radius:999px;background:rgba(10,14,20,0.88)}
    .pro2editor-hud-pill-label{color:#8ea5bf;font-size:11px;text-transform:uppercase}
    .pro2editor-hud-pill-value{color:#edf4fc;font-size:12px;font-weight:700}
    .pro2editor-hover-card{position:absolute;min-width:220px;max-width:320px;padding:10px 12px;border-radius:8px;background:rgba(8,12,18,0.92);border:1px solid rgba(255,255,255,0.12);color:#eaf1fa}
    .pro2editor-hover-title{font-size:14px;font-weight:700;margin-bottom:8px}
    .pro2editor-hover-row{display:grid;grid-template-columns:54px 1fr;gap:10px;padding:4px 0;font-size:12px}
  `;
  document.head.appendChild(style);
}
