const COLOR_BY_FIELD_LABELS = new Map([
  ['lineNo', 'Line No.'],
  ['Line No', 'Line No.'],
  ['bore', 'Bore'],
  ['Bore', 'Bore'],
  ['materialName', 'materialName'],
  ['wallThickness', 'wallThickness'],
  ['pressure', 'pressure'],
  ['hydroPressure', 'hydroPressure'],
  ['materialThickness', 'Material Thickness'],
  ['temp1', 'Temp1'],
  ['temp2', 'Temp2'],
  ['temp3', 'Temp3'],
  ['Pressure', 'Pressure'],
  ['Hydro Pressure', 'Hydro Pressure'],
]);

const COLOR_BY_FIELD_ORDER = [
  'lineNo',
  'bore',
  'materialName',
  'wallThickness',
  'pressure',
  'hydroPressure',
  'materialThickness',
  'temp1',
  'temp2',
  'temp3',
  'Pressure',
  'Hydro Pressure',
];

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createToolbar(container, cameraController) {
  const CLIP_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16"/><path d="M10 4v16"/></svg>';
  container.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:flex-end;">
      <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.08); color:#d8e6f7; font-size:12px; font-weight:600;">
        <span>Color By</span>
        <select id="adv-color-prop" style="font-size:12px; padding:6px 10px; max-width:180px; border-radius:10px; border:1px solid rgba(255,255,255,0.15); background:#f7fbff; color:#102033;" disabled>
          <option value="default">Default</option>
        </select>
      </label>

      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn-icon" id="adv-view-iso" title="Isometric View" style="padding:7px 12px; border-radius:10px; border:1px solid rgba(133,188,255,0.32); background:rgba(23,53,85,0.95); color:#edf6ff; font-size:11px; font-weight:700; letter-spacing:0.08em;">ISO</button>
        <button class="btn-icon" id="adv-view-top" title="Top View" style="padding:7px 12px; border-radius:10px; border:1px solid rgba(133,188,255,0.2); background:rgba(255,255,255,0.06); color:#d2e3f6; font-size:11px; font-weight:700; letter-spacing:0.08em;">TOP</button>
        <button class="btn-icon" id="adv-view-front" title="Front View" style="padding:7px 12px; border-radius:10px; border:1px solid rgba(133,188,255,0.2); background:rgba(255,255,255,0.06); color:#d2e3f6; font-size:11px; font-weight:700; letter-spacing:0.08em;">FRONT</button>
        <button class="btn-icon" id="adv-view-side" title="Side View" style="padding:7px 12px; border-radius:10px; border:1px solid rgba(133,188,255,0.2); background:rgba(255,255,255,0.06); color:#d2e3f6; font-size:11px; font-weight:700; letter-spacing:0.08em;">SIDE</button>
        <button class="btn-icon" id="adv-view-fit" title="Fit Scene" style="padding:7px 12px; border-radius:10px; border:1px solid rgba(255,191,120,0.35); background:rgba(224,112,32,0.18); color:#ffe2c2; font-size:11px; font-weight:700; letter-spacing:0.08em;">FIT ALL</button>
        <button class="btn-icon" id="adv-measure-btn" title="Measure Selection" style="padding:7px 12px; border-radius:10px; border:1px solid rgba(111,206,168,0.24); background:rgba(255,255,255,0.06); color:#d2e3f6; font-size:11px; font-weight:700; letter-spacing:0.08em;">MEASURE</button>
        <button class="btn-icon" id="adv-section-btn" title="Toggle Section Box" style="display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:10px; border:1px solid rgba(140,226,176,0.24); background:rgba(255,255,255,0.06); color:#d2e3f6; font-size:11px; font-weight:700; letter-spacing:0.08em;">${CLIP_ICON}<span id="adv-section-btn-label">CLIP OFF</span></button>
      </div>
    </div>

    <div id="adv-legend-panel" style="position:absolute; bottom:20px; left:20px; background:rgba(18,37,59,0.9); color:#edf6ff; padding:14px 12px; border-radius:14px; font-size:11px; display:none; max-height:220px; overflow-y:auto; z-index:10; border:1px solid rgba(255,255,255,0.08); box-shadow:0 10px 24px rgba(0,0,0,0.28);">
      <strong style="display:block; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#9fc0e6;">Legend</strong>
      <div id="adv-legend-content" style="margin-top:8px;"></div>
    </div>
  `;

  const colorSelect = container.querySelector('#adv-color-prop');
  const sectionBtn = container.querySelector('#adv-section-btn');
  const sectionBtnLabel = container.querySelector('#adv-section-btn-label');
  const measureBtn = container.querySelector('#adv-measure-btn');
  const legendPanel = container.querySelector('#adv-legend-panel');
  const legendContent = container.querySelector('#adv-legend-content');

  let heatmapHandler = null;
  let sectionHandler = null;
  let fitHandler = null;
  let sectionOn = false;
  let measureHandler = null;
  let measureOn = false;

  sectionBtn.addEventListener('click', () => {
    sectionOn = !sectionOn;
    if (sectionOn) {
      sectionBtn.style.border = '1px solid rgba(111, 238, 167, 0.42)';
      sectionBtn.style.background = 'rgba(49, 150, 87, 0.24)';
      sectionBtn.style.color = '#d7ffe5';
      if (sectionBtnLabel) sectionBtnLabel.textContent = 'CLIP ON';
    } else {
      sectionBtn.style.border = '1px solid rgba(140,226,176,0.24)';
      sectionBtn.style.background = 'rgba(255,255,255,0.06)';
      sectionBtn.style.color = '#d2e3f6';
      if (sectionBtnLabel) sectionBtnLabel.textContent = 'CLIP OFF';
    }
    if (sectionHandler) sectionHandler(sectionOn);
  });

  colorSelect.addEventListener('change', (event) => {
    if (heatmapHandler) heatmapHandler(event.target.value);
  });

  container.querySelector('#adv-view-iso').addEventListener('click', () => cameraController.setPresetView('ISO'));
  container.querySelector('#adv-view-top').addEventListener('click', () => cameraController.setPresetView('TOP'));
  container.querySelector('#adv-view-front').addEventListener('click', () => cameraController.setPresetView('FRONT'));
  container.querySelector('#adv-view-side').addEventListener('click', () => cameraController.setPresetView('SIDE'));
  container.querySelector('#adv-view-fit').addEventListener('click', () => {
    if (fitHandler) fitHandler();
  });
  measureBtn.addEventListener('click', () => {
    measureOn = !measureOn;
    _paintMeasureButton();
    if (measureHandler) measureHandler(measureOn);
  });

  return {
    setFitHandler: (fn) => { fitHandler = fn; },
    setHeatmapHandler: (fn) => { heatmapHandler = fn; },
    setMeasureHandler: (fn) => { measureHandler = fn; },
    setSectionHandler: (fn) => { sectionHandler = fn; },
    setMeasureState: (enabled) => {
      measureOn = !!enabled;
      _paintMeasureButton();
    },
    setProperties: (props) => {
      const available = new Set((props || []).map(String));
      let html = '<option value="default">Default</option>';
      for (const prop of COLOR_BY_FIELD_ORDER) {
        if (!available.has(prop)) continue;
        const label = COLOR_BY_FIELD_LABELS.get(prop) || prop;
        html += `<option value="${escapeAttr(prop)}">${escapeAttr(label)}</option>`;
      }
      colorSelect.innerHTML = html;
      colorSelect.disabled = html.indexOf('<option value="') === html.lastIndexOf('<option value="');
    },
    updateLegend: (legendHtml) => {
      if (!legendHtml) {
        legendPanel.style.display = 'none';
      } else {
        legendContent.innerHTML = legendHtml;
        legendPanel.style.display = 'block';
      }
    }
  };

  function _paintMeasureButton() {
    if (measureOn) {
      measureBtn.style.border = '1px solid rgba(111,206,168,0.5)';
      measureBtn.style.background = 'rgba(39,117,85,0.28)';
      measureBtn.style.color = '#e4fff2';
    } else {
      measureBtn.style.border = '1px solid rgba(111,206,168,0.24)';
      measureBtn.style.background = 'rgba(255,255,255,0.06)';
      measureBtn.style.color = '#d2e3f6';
    }
  }
}
