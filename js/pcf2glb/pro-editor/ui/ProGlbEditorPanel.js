import { createHudOverlay } from './ProGlbEditorHudOverlay.js';
import { createShortcutController } from './ProGlbEditorShortcutController.js';
import { createEditorViewerApp } from '../core/createEditorViewerApp.js';
import { loadMockPcfToGlbUrl, loadMockGlbUrl } from '../core/mockLoader.js';
import { getRow, onChange as onDataChange, loadDataTable } from '../core/dataStore.js';

export function renderProGlbEditorPanel(container) {
  injectStyles();

  loadDataTable([]); // initialise empty table

  container.innerHTML = `
    <div id="proglb-root" class="proglb-shell">
      <header class="proglb-topbar">
        <div class="proglb-topbar-row proglb-topbar-row-main">
          <button class="proglb-btn" data-action="import">Import</button>
          <button class="proglb-btn" data-action="mock-pcf">PCF</button>
          <button class="proglb-btn" data-action="mock-glb">GLB</button>
          <div class="proglb-divider"></div>
          <button class="proglb-btn" data-action="export">Export</button>
          <button class="proglb-btn" data-action="undo">Undo</button>
          <button class="proglb-btn" data-action="redo">Redo</button>
          <div class="proglb-divider"></div>
          <button class="proglb-btn active" data-action="select">Select</button>
          <button class="proglb-btn" data-action="move">Move</button>
          <button class="proglb-btn" data-action="rotate">Rotate</button>
          <button class="proglb-btn" data-action="measure">Measure</button>
          <div class="proglb-divider"></div>
          <button class="proglb-btn" data-action="break">Break</button>
          <button class="proglb-btn" data-action="connect">Connect</button>
          <button class="proglb-btn" data-action="stretch">Stretch</button>
          <button class="proglb-btn" data-action="marquee">Marquee</button>
          <div class="proglb-divider"></div>
          <button class="proglb-btn" data-action="fitting">Fitting</button>
          <button class="proglb-btn" data-action="support">Support</button>
          <button class="proglb-btn" data-action="cut">Cut</button>
          <div class="proglb-spacer"></div>
          <button class="proglb-btn" data-action="views-menu">Views ▾</button>
        </div>

        <div class="proglb-topbar-row proglb-topbar-row-sub">
          <button class="proglb-btn minor" data-action="toggle-projection">Ortho / Persp</button>
          <button class="proglb-btn minor" data-action="home">Home</button>
          <button class="proglb-btn minor" data-action="fit">Fit</button>
          <div class="proglb-divider"></div>
          <label class="proglb-label">Snap <input id="proglb-snap-toggle" type="checkbox" checked></label>
          <label class="proglb-label">Grid <input id="proglb-grid-mm" type="number" value="100"></label>
          <label class="proglb-label">Angle <input id="proglb-angle-deg" type="number" value="90"></label>
        </div>
      </header>

      <section class="proglb-middle">
        <aside class="proglb-panel proglb-panel-left">
          <div class="proglb-tabs">
            <button class="proglb-tab active" data-pane="model">Model</button>
            <button class="proglb-tab" data-pane="tools">Tools</button>
            <button class="proglb-tab" data-pane="annotations">Annotations</button>
          </div>

          <div class="proglb-panel-content">
            <div class="proglb-pane active" data-pane="model">
              <div id="proglb-model-tree">Tree will load here…</div>
            </div>

            <div class="proglb-pane" data-pane="tools">
              <div class="proglb-form-grid">
                <label>Projection</label>
                <select id="proglb-projection-select">
                  <option value="PERSPECTIVE">Perspective</option>
                  <option value="ORTHOGRAPHIC">Orthographic</option>
                </select>

                <label>FOV</label>
                <input id="proglb-fov-input" type="range" min="20" max="120" step="1" value="60">

                <label>Smooth</label>
                <input id="proglb-smooth-input" type="range" min="0" max="2" step="0.05" value="0.35">
                
                <label>Theme</label>
                <select id="proglb-theme-select">
                  <option value="DARK">Dark</option>
                  <option value="LIGHT">Light</option>
                  <option value="BLUE">Blue</option>
                </select>
              </div>
            </div>

            <div class="proglb-pane" data-pane="annotations">
              <div class="proglb-empty-note">Annotations will be added later.</div>
            </div>
          </div>
        </aside>

        <main class="proglb-canvas-area">
          <div id="proglb-canvas-container" class="proglb-canvas-host"></div>
          <div id="proglb-hidden-toolbar" style="display:none;"></div>
        </main>

        <aside class="proglb-panel proglb-panel-right">
          <div class="proglb-tabs">
            <button class="proglb-tab active">Properties</button>
          </div>
          <div id="proglb-properties-panel" class="proglb-panel-content">
            <div class="proglb-empty-note">Select an object…</div>
          </div>
        </aside>
      </section>

      <footer class="proglb-footer">
        <div class="proglb-debug-header">Debug Console</div>
        <div id="proglb-debug-logs" class="proglb-debug-content"></div>
      </footer>

      <input type="file" id="proglb-file-input" accept=".glb,.gltf" style="display:none;">
      <div id="proglb-properties-hidden" style="display:none;"></div>
    </div>
  `;

  const root = container.querySelector('#proglb-root');
  const canvasContainer = container.querySelector('#proglb-canvas-container');
  const fileInput = container.querySelector('#proglb-file-input');
  const hiddenToolbar = container.querySelector('#proglb-hidden-toolbar');
  const propPanel = container.querySelector('#proglb-properties-panel');
  const propContent = container.querySelector('#proglb-properties-hidden');
  const debugLogs = container.querySelector('#proglb-debug-logs');
  const snapToggle = container.querySelector('#proglb-snap-toggle');
  const gridInput = container.querySelector('#proglb-grid-mm');
  const angleInput = container.querySelector('#proglb-angle-deg');
  const projectionSelect = container.querySelector('#proglb-projection-select');
  const fovInput = container.querySelector('#proglb-fov-input');
  const smoothInput = container.querySelector('#proglb-smooth-input');
  const themeSelect = container.querySelector('#proglb-theme-select');

  let currentSelectedItem = null;
  const unsubscribeData = onDataChange(() => {
    if (currentSelectedItem) updatePropertyPanel();
  });

  const uiState = {
    tool: 'select',
    snapEnabled: true,
    gridMm: 100,
    angleDeg: 90,
    projection: 'PERSPECTIVE',
    fps: 0,
    selection: 'None',
    objectUrl: null,
    perfHandle: 0,
    hoverHandle: 0,
    frameCounter: 0,
    lastPerfTs: performance.now(),
    destroyed: false,
  };

  const viewer = createEditorViewerApp(
    canvasContainer,
    hiddenToolbar,
    propPanel,
    propContent,
    debugLogs,
    {
      onSceneLoaded: ({ sceneIndex }) => {
        renderModelTree(sceneIndex);
        log('INFO', 'SCENE', `Loaded ${sceneIndex?.items?.length ?? 0} indexed objects`);
        updateHud();
      },
      onSelectionChange: (item) => {
        uiState.selection = item?.id || item?.refNo || item?.type || 'None';
        currentSelectedItem = item;
        updatePropertyPanel();
        updateHud();
      },
      onFrame: () => {
        uiState.frameCounter += 1;
      }
    }
  );

  const hud = createHudOverlay(canvasContainer);
  const shortcuts = createShortcutController({
    onAction: handleShortcut
  });

  wireTabs();
  wireInputs();
  wireToolbar();
  wireHover();
  startPerfLoop();
  updateHud();

  return {
    destroy() {
      uiState.destroyed = true;
      unsubscribeData();
      if (uiState.perfHandle) cancelAnimationFrame(uiState.perfHandle);
      if (uiState.hoverHandle) cancelAnimationFrame(uiState.hoverHandle);
      shortcuts.destroy();
      hud.destroy();
      viewer.dispose();
      if (uiState.objectUrl) URL.revokeObjectURL(uiState.objectUrl);
    }
  };

  function updatePropertyPanel() {
    if (!propPanel) return;
    if (!currentSelectedItem) {
      propPanel.innerHTML = '<div class="proglb-empty-note">Select an object…</div>';
      return;
    }
    const id = currentSelectedItem.id || currentSelectedItem.refNo || currentSelectedItem.type;
    const row = id != null ? getRow(id) : undefined;
    if (!row) {
      propPanel.innerHTML = `<div class="proglb-empty-note">No datatable row found for ${escapeHtml(id)}</div>`;
      return;
    }
    const entries = Object.entries(row).filter(([k]) => k !== 'id');
    propPanel.innerHTML = entries.length
      ? entries.map(([k, v]) => `<div class="proglb-hover-row"><span class="proglb-hover-key">${escapeHtml(k)}</span><span class="proglb-hover-val">${escapeHtml(v)}</span></div>`).join('')
      : `<div class="proglb-empty-note">No additional fields.</div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function wireTabs() {
    root.querySelectorAll('.proglb-tab[data-pane]').forEach(tab => {
      tab.addEventListener('click', () => {
        const pane = tab.dataset.pane;
        root.querySelectorAll('.proglb-tab[data-pane]').forEach(t => t.classList.toggle('active', t === tab));
        root.querySelectorAll('.proglb-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === pane));
      });
    });
  }

  function wireInputs() {
    snapToggle.addEventListener('change', () => {
      uiState.snapEnabled = snapToggle.checked;
      syncSnaps();
    });

    gridInput.addEventListener('change', () => {
      uiState.gridMm = Math.max(1, Number(gridInput.value) || 100);
      syncSnaps();
    });

    angleInput.addEventListener('change', () => {
      uiState.angleDeg = Math.max(1, Number(angleInput.value) || 90);
      syncSnaps();
    });

    projectionSelect.addEventListener('change', () => {
      uiState.projection = projectionSelect.value;
      viewer.setProjection(uiState.projection);
      updateHud();
    });

    fovInput.addEventListener('input', () => {
      viewer.getController()?.setPerspectiveFov(Number(fovInput.value) || 60);
      updateHud();
    });

    smoothInput.addEventListener('input', () => {
      viewer.getController()?.setSmoothTime(Number(smoothInput.value) || 0.35);
    });

    themeSelect.addEventListener('change', () => {
      viewer.setTheme(themeSelect.value);
    });

    syncSnaps();
  }

  function wireToolbar() {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.proglb-btn');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'import') {
        fileInput.click();
        return;
      }

      if (action === 'mock-pcf') {
        btn.disabled = true;
        btn.textContent = 'Loading...';
        try {
            const url = await loadMockPcfToGlbUrl();
            await loadUrl(url);
        } catch (err) {
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'PCF';
        }
        return;
      }

      if (action === 'mock-glb') {
        btn.disabled = true;
        btn.textContent = 'Loading...';
        try {
            const url = await loadMockGlbUrl();
            await loadUrl(url);
        } catch (err) {
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'GLB';
        }
        return;
      }

      if (action === 'undo') { viewer.undo?.(); return; }
      if (action === 'redo') { viewer.redo?.(); return; }

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

      if (action === 'fit') {
        viewer.fitAll();
        return;
      }

      if (action === 'home') {
        viewer.home();
        return;
      }

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

  async function loadUrl(url) {
    await viewer.loadGLB(url);
    viewer.fitAll();
    updateHud();
  }

  function wireHover() {
    canvasContainer.addEventListener('pointerleave', () => {
      hud.hideHover();
    });

    canvasContainer.addEventListener('pointermove', (event) => {
      if (uiState.hoverHandle) cancelAnimationFrame(uiState.hoverHandle);

      uiState.hoverHandle = requestAnimationFrame(() => {
        const picked = viewer.pickAtClient?.(event.clientX, event.clientY);

        if (!picked || !picked.hit) {
          hud.hideHover();
          updateHud('—');
          return;
        }

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
    if (action === 'history:undo') { viewer.undo?.(); return; }
    if (action === 'history:redo') { viewer.redo?.(); return; }

    if (['tool:select','tool:move','tool:rotate','tool:measure','tool:break','tool:connect','tool:stretch','tool:marquee'].includes(action)) {
        const mode = action.split(':')[1];
        uiState.tool = mode;
        viewer.setToolMode(mode);
        updateToolButtons();
        updateHud();
        if (['break','connect','stretch','marquee'].includes(mode)) {
          log('INFO', 'TOOL', `${mode} tool selected (functionality pending)`);
        }
        return;
    }

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

    if (action === 'toggle:snap') {
      uiState.snapEnabled = !uiState.snapEnabled;
      snapToggle.checked = uiState.snapEnabled;
      syncSnaps();
      return;
    }
  }

  function syncSnaps() {
    viewer.setSnapSettings(uiState.snapEnabled, uiState.gridMm, uiState.angleDeg);
    updateHud();
  }

  function updateToolButtons() {
    root.querySelectorAll(
      '.proglb-btn[data-action="select"], .proglb-btn[data-action="move"], .proglb-btn[data-action="rotate"], .proglb-btn[data-action="measure"], .proglb-btn[data-action="break"], .proglb-btn[data-action="connect"], .proglb-btn[data-action="stretch"], .proglb-btn[data-action="marquee"]'
    ).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.action === uiState.tool);
    });
  }

  function renderModelTree(sceneIndex) {
    const tree = root.querySelector('#proglb-model-tree');
    const items = sceneIndex?.items || [];
    tree.innerHTML = items.length
      ? items.slice(0, 60).map(item => `<div class="tree-row">${item.type} <span>${item.id || item.refNo || '—'}</span></div>`).join('')
      : '<div class="proglb-empty-note">No indexed items.</div>';
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

  function log(level, channel, message) {
    const row = document.createElement('div');
    row.className = 'proglb-log-row';
    row.innerHTML = `<span>[${level}]</span> <span>[${channel}]</span> <span>${message}</span>`;
    debugLogs.prepend(row);
  }
}

function injectStyles() {
  if (document.getElementById('proglb-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'proglb-editor-styles';
  style.textContent = `
    .proglb-shell{display:flex;flex-direction:column;height:calc(100vh - 120px);background:#0f151c;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif}
    .proglb-topbar{display:flex;flex-direction:column;background:#1e293b;border-bottom:1px solid #334155}
    .proglb-topbar-row{display:flex;align-items:center;padding:0 12px;height:40px;gap:8px}
    .proglb-topbar-row-sub{height:32px;background:#151e2b;border-top:1px solid #283548;font-size:12px}
    .proglb-btn{background:transparent;border:1px solid transparent;color:#cbd5e1;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px}
    .proglb-btn:hover{background:#334155}
    .proglb-btn.active{background:#2563eb;color:#fff}
    .proglb-divider{width:1px;height:16px;background:#334155;margin:0 4px}
    .proglb-spacer{flex:1}
    .proglb-label{display:flex;align-items:center;gap:4px;color:#94a3b8}
    .proglb-middle{display:flex;flex:1;min-height:0}
    .proglb-panel{width:300px;background:#1e293b;display:flex;flex-direction:column;border-right:1px solid #334155}
    .proglb-panel-right{border-right:none;border-left:1px solid #334155}
    .proglb-tabs{display:flex;background:#0f151c;border-bottom:1px solid #334155}
    .proglb-tab{flex:1;background:transparent;border:none;color:#94a3b8;padding:8px 0;cursor:pointer;border-bottom:2px solid transparent}
    .proglb-tab.active{color:#fff;border-bottom-color:#3b82f6}
    .proglb-panel-content{flex:1;overflow:auto;position:relative}
    .proglb-pane{display:none;padding:12px}
    .proglb-pane.active{display:block}
    .proglb-canvas-area{flex:1;position:relative;background:#000}
    .proglb-canvas-host{position:absolute;inset:0}
    .proglb-footer{height:180px;background:#1e293b;border-top:1px solid #334155;display:flex;flex-direction:column}
    .proglb-debug-header{padding:4px 12px;font-size:12px;color:#94a3b8;border-bottom:1px solid #334155;background:#0f151c}
    .proglb-debug-content{flex:1;overflow:auto;padding:8px 12px;font-family:monospace;font-size:11px;color:#a7f3d0}
    .tree-row{padding:4px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05)}
    .tree-row span{color:#94a3b8;margin-left:6px}
    .proglb-form-grid{display:grid;grid-template-columns:90px 1fr;gap:10px 12px;align-items:center}
    .proglb-form-grid input,.proglb-form-grid select{width:100%;box-sizing:border-box;background:#0f151c;border:1px solid #334155;color:#fff;padding:6px;border-radius:4px}
    .proglb-empty-note{padding:12px;font-size:12px;color:#9fb3c8}
    .proglb-hud-root{position:absolute;inset:0;pointer-events:none;z-index:10}
    .proglb-hud-top,.proglb-hud-bottom{position:absolute;left:12px;display:flex;gap:8px;flex-wrap:wrap}
    .proglb-hud-top{top:12px}
    .proglb-hud-bottom{bottom:12px}
    .proglb-hud-pill{display:flex;gap:8px;padding:7px 11px;border:1px solid rgba(255,255,255,0.1);border-radius:999px;background:rgba(10,14,20,0.88)}
    .proglb-hud-pill-label{color:#8ea5bf;font-size:11px;text-transform:uppercase}
    .proglb-hud-pill-value{color:#edf4fc;font-size:12px;font-weight:700}
    .proglb-hover-card{position:absolute;min-width:220px;max-width:320px;padding:10px 12px;border-radius:8px;background:rgba(8,12,18,0.92);border:1px solid rgba(255,255,255,0.12);color:#eaf1fa}
    .proglb-hover-title{font-size:14px;font-weight:700;margin-bottom:8px}
    .proglb-hover-row{display:grid;grid-template-columns:54px 1fr;gap:10px;padding:4px 0;font-size:12px}
  `;
  document.head.appendChild(style);
}
