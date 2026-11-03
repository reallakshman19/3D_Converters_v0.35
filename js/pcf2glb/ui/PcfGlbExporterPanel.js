import { notify } from '../../diagnostics/notification-center.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLogger } from '../debug/logger.js';
import { timeStep } from '../pipeline/timeStep.js';
import { parsePcfText } from '../pcf/parsePcfText.js';
import { normalizePcfModel } from '../pcf/normalizePcfModel.js';
import { buildExportScene } from '../glb/buildExportScene.js';
import { exportSceneToGLB } from '../glb/exportSceneToGLB.js';
import { state } from '../../../core/state.js';
import { buildUniversalCSV, normalizeToPCF } from '../../../utils/accdb-to-pcf.js';

function _pt(v) {
  if (!v) return null;
  return {
    x: Number(v.x ?? 0),
    y: Number(v.y ?? 0),
    z: Number(v.z ?? 0),
    bore: Number(v.bore ?? 0),
  };
}

function _resolveNodePositions(csvRows) {
  const nodePos = new Map();
  if (!csvRows?.length) return nodePos;
  const first = csvRows[0];
  if (first?.FROM_NODE !== undefined) nodePos.set(first.FROM_NODE, { x: 0, y: 0, z: 0 });
  let progress = true, guard = 0;
  while (progress && guard < csvRows.length * 4) {
    guard += 1; progress = false;
    for (const row of csvRows) {
      const a = nodePos.get(row.FROM_NODE);
      const b = nodePos.get(row.TO_NODE);
      const dx = Number(row.DELTA_X || 0), dy = Number(row.DELTA_Y || 0), dz = Number(row.DELTA_Z || 0);
      if (a && !b) { nodePos.set(row.TO_NODE, { x: a.x + dx, y: a.y + dy, z: a.z + dz }); progress = true; }
      else if (!a && b) { nodePos.set(row.FROM_NODE, { x: b.x - dx, y: b.y - dy, z: b.z - dz }); progress = true; }
    }
  }
  return nodePos;
}

export function renderPcfGlbExporterPanel(container) {
  const hasParsedState = !!(state.parsed && state.parsed.elements && state.parsed.elements.length > 0);

  container.innerHTML = `
    <div style="display: flex; height: calc(100vh - 120px);">
      <!-- Left Panel: Controls -->
      <div style="width: 300px; padding: 20px; background: #f0f4f8; border-right: 1px solid #ccc; display: flex; flex-direction: column;">
        <h3>PCF to GLB Export</h3>
        <p style="margin-bottom: 20px; font-size: 12px; color: #666;">Browser-only pipeline. No server needed.</p>

        <div style="margin-bottom: 15px; padding: 10px; background: #e0e0e0; border-radius: 4px;">
            <label style="display:block; margin-bottom:5px;">
                <input type="radio" name="glb-source" value="state" ${hasParsedState ? 'checked' : 'disabled'}>
                Export loaded application state
            </label>
            <label style="display:block;">
                <input type="radio" name="glb-source" value="file" ${!hasParsedState ? 'checked' : ''}>
                Export from raw PCF file
            </label>
        </div>

        <input type="file" id="pcf-file-input" accept=".pcf,.pcfx" style="margin-bottom: 10px;" ${hasParsedState ? 'disabled' : ''}>
        <button id="btn-run-pipeline" class="btn-primary" style="margin-bottom: 10px;" ${hasParsedState ? '' : 'disabled'}>Run Pipeline & Export</button>
        <button id="btn-download-glb" class="btn-secondary" style="margin-bottom: 20px;" disabled>Download GLB</button>

        <h4>Status</h4>
        <div id="pipeline-status" style="font-weight: bold; margin-bottom: 10px;">Waiting for file...</div>

        <h4>Logs</h4>
        <div id="pipeline-logs" style="flex: 1; overflow-y: auto; background: #fff; border: 1px solid #ccc; padding: 10px; font-size: 11px; font-family: monospace;"></div>
      </div>

      <!-- Right Panel: Preview -->
      <div style="flex: 1; display: flex; flex-direction: column; position: relative;">
        <div style="background: #1e2d42; color: #fff; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center;">
             <span style="margin-right: 15px;">3D Preview</span>
             <label style="font-size: 11px; margin-right: 5px;">Color By:</label>
             <select id="glb-color-prop" style="font-size: 11px; padding: 2px; max-width: 120px;" disabled>
                 <option value="default">Default</option>
             </select>
          </div>
          <div>
              <button class="btn-icon" id="btn-view-iso" title="Isometric View" style="padding: 2px 6px; margin-right: 4px; font-size: 11px;">ISO</button>
              <button class="btn-icon" id="btn-view-top" title="Top View" style="padding: 2px 6px; margin-right: 4px; font-size: 11px;">TOP</button>
              <button class="btn-icon" id="btn-view-front" title="Front View" style="padding: 2px 6px; font-size: 11px;">FRONT</button>
          </div>
        </div>
        <div id="preview-container" style="flex: 1; background: #222; position: relative;"></div>

        <!-- Legend Panel for Heatmap -->
        <div id="glb-legend-panel" style="position: absolute; bottom: 20px; left: 20px; background: rgba(30, 45, 66, 0.9); color: white; padding: 10px; border-radius: 4px; font-size: 11px; display: none; max-height: 200px; overflow-y: auto;">
            <strong>Legend</strong>
            <div id="glb-legend-content" style="margin-top: 5px;"></div>
        </div>

        <!-- Floating Property Panel -->
        <div id="glb-property-panel" style="position: absolute; top: 50px; right: 20px; width: 300px; background: rgba(30, 45, 66, 0.9); color: white; padding: 15px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: none; z-index: 10;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #555; padding-bottom: 5px; margin-bottom: 10px;">
                <strong style="font-size: 14px;">Component Properties</strong>
                <button id="btn-close-props" style="background: none; border: none; color: white; cursor: pointer; font-weight: bold;">✕</button>
            </div>
            <div id="glb-property-content" style="max-height: 400px; overflow-y: auto; font-size: 12px; font-family: monospace;"></div>
        </div>
      </div>
    </div>
  `;

  const fileInput = container.querySelector('#pcf-file-input');
  const btnRun = container.querySelector('#btn-run-pipeline');
  const btnDownload = container.querySelector('#btn-download-glb');
  const statusEl = container.querySelector('#pipeline-status');
  const logsEl = container.querySelector('#pipeline-logs');
  const previewContainer = container.querySelector('#preview-container');

  const propPanel = container.querySelector('#glb-property-panel');
  const propContent = container.querySelector('#glb-property-content');
  const btnCloseProps = container.querySelector('#btn-close-props');

  const colorPropSelect = container.querySelector('#glb-color-prop');
  const legendPanel = container.querySelector('#glb-legend-panel');
  const legendContent = container.querySelector('#glb-legend-content');

  btnCloseProps.addEventListener('click', () => {
      propPanel.style.display = 'none';
  });

  const palettes = [
      0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c, 0xfabebe,
      0x008080, 0xe6beff, 0x9a6324, 0xfffac8, 0x800000, 0xaaffc3, 0x808000, 0xffd8b1, 0x000075, 0x808080,
  ];

  let originalMaterials = new Map();

  function applyHeatmap(property) {
      if (property === 'default') {
          scene.traverse(child => {
              if (child.isMesh && originalMaterials.has(child.uuid)) {
                  child.material = originalMaterials.get(child.uuid);
              }
          });
          legendPanel.style.display = 'none';
          return;
      }

      const valuesSet = new Set();
      scene.traverse(child => {
          if (child.isMesh && child.userData && child.userData[property] !== undefined) {
              valuesSet.add(String(child.userData[property]));
          }
      });

      const uniqueValues = Array.from(valuesSet).sort();
      const colorMap = new Map();
      uniqueValues.forEach((val, idx) => {
          colorMap.set(val, palettes[idx % palettes.length]);
      });

      scene.traverse(child => {
          if (child.isMesh && child.userData) {
              if (!originalMaterials.has(child.uuid)) {
                  originalMaterials.set(child.uuid, child.material);
              }

              const val = String(child.userData[property]);
              if (child.userData[property] !== undefined && colorMap.has(val)) {
                  child.material = new THREE.MeshStandardMaterial({ color: colorMap.get(val) });
              } else {
                  child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 }); // Ghosted if no prop
              }
          }
      });

      // Build Legend
      let html = '';
      uniqueValues.forEach(val => {
          const colorHex = '#' + colorMap.get(val).toString(16).padStart(6, '0');
          html += `<div style="display:flex; align-items:center; margin-bottom:4px;">
              <span style="width:12px; height:12px; background:${colorHex}; display:inline-block; margin-right:6px; border:1px solid #fff;"></span>
              <span>${val}</span>
          </div>`;
      });
      legendContent.innerHTML = html;
      legendPanel.style.display = 'block';
  }

  colorPropSelect.addEventListener('change', (e) => {
      applyHeatmap(e.target.value);
  });

  const logger = createLogger();
  logger.subscribe((entry) => {
    const div = document.createElement('div');
    div.style.color = entry.level === 'ERROR' ? 'red' : entry.level === 'WARN' ? 'orange' : 'black';
    div.textContent = `[${entry.level}] ${entry.code} ${JSON.stringify(entry.data)}`;
    logsEl.appendChild(div);
    logsEl.scrollTop = logsEl.scrollHeight;
  });

  let currentFile = null;
  let currentBlob = null;
  let currentBlobUrl = null;
  let useParsedState = hasParsedState;

  container.querySelectorAll('input[name="glb-source"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
          useParsedState = e.target.value === 'state';
          fileInput.disabled = useParsedState;
          if (useParsedState) {
              btnRun.disabled = false;
              statusEl.textContent = `Ready to export parsed application state`;
          } else {
              btnRun.disabled = currentFile === null;
              statusEl.textContent = currentFile ? `File selected: ${currentFile.name}` : `Waiting for file...`;
          }
      });
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      currentFile = e.target.files[0];
      if (!useParsedState) btnRun.disabled = false;
      statusEl.textContent = `File selected: ${currentFile.name}`;
      logsEl.innerHTML = '';
      logger.clear();
    } else {
      currentFile = null;
      if (!useParsedState) btnRun.disabled = true;
    }
  });

  // Setup Three.js preview
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const controls = new OrbitControls(camera, renderer.domElement);

  // Axis Helper
  const axesHelper = new THREE.AxesHelper(1000);
  scene.add(axesHelper);

  // Basic lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(100, 200, 50);
  scene.add(dirLight);

  // View Controls mapping
  const currentCenter = new THREE.Vector3();
  let currentMaxDim = 1000;

  container.querySelector('#btn-view-iso').addEventListener('click', () => {
     const distance = currentMaxDim * 1.5;
     camera.up.set(0, 1, 0); // Restore default UP
     camera.position.copy(currentCenter).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance));
     camera.lookAt(currentCenter);
     controls.target.copy(currentCenter);
     controls.update();
  });

  container.querySelector('#btn-view-top').addEventListener('click', () => {
     const distance = currentMaxDim * 1.5;
     camera.position.copy(currentCenter).add(new THREE.Vector3(0, 1, 0).normalize().multiplyScalar(distance));
     camera.up.set(0, 0, -1);
     camera.lookAt(currentCenter);
     controls.target.copy(currentCenter);
     controls.update();
  });

  container.querySelector('#btn-view-front').addEventListener('click', () => {
     const distance = currentMaxDim * 1.5;
     camera.position.copy(currentCenter).add(new THREE.Vector3(0, 0, 1).normalize().multiplyScalar(distance));
     camera.up.set(0, 1, 0);
     camera.lookAt(currentCenter);
     controls.target.copy(currentCenter);
     controls.update();
  });

  const initPreview = () => {
    const w = previewContainer.clientWidth;
    const h = previewContainer.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!previewContainer.contains(renderer.domElement)) {
      previewContainer.appendChild(renderer.domElement);
    }
  };

  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  window.addEventListener('resize', () => {
    if (previewContainer.clientWidth) {
      initPreview();
    }
  });

  // Setup Raycaster for properties
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  previewContainer.addEventListener('pointerdown', (e) => {
      const rect = previewContainer.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      let clickedObject = null;
      for (const intersect of intersects) {
          // ignore helper lines or unnammed
          if (intersect.object.type === 'Mesh' && intersect.object.userData && intersect.object.userData.pcfType) {
              clickedObject = intersect.object;
              break;
          }
      }

      if (clickedObject) {
          // Adjust orbit target to clicked component
          const clickBox = new THREE.Box3().setFromObject(clickedObject);
          const clickCenter = clickBox.getCenter(new THREE.Vector3());
          controls.target.copy(clickCenter);
          controls.update();

          const data = clickedObject.userData;
          let html = `<table style="width: 100%; text-align: left; border-collapse: collapse;">`;
          for (const [key, value] of Object.entries(data)) {
              if (value === null || value === undefined || value === '') continue;
              html += `<tr>
                <td style="padding: 4px; border-bottom: 1px solid #444; color: #aaa; width: 40%; word-break: break-word;">${key}</td>
                <td style="padding: 4px; border-bottom: 1px solid #444; color: #fff; word-break: break-word;">${value}</td>
              </tr>`;
          }
          html += `</table>`;
          propContent.innerHTML = html;
          propPanel.style.display = 'block';
      } else {
          // Clicked empty space, reset to global center
          controls.target.copy(currentCenter);
          controls.update();
          propPanel.style.display = 'none';
      }
  });

  // Render loop triggers init on first frame if visible
  setTimeout(initPreview, 100);

  btnRun.addEventListener('click', async () => {
    if (!useParsedState && !currentFile) return;

    if (!useParsedState && currentFile) {
        // File size guard
        const mb = currentFile.size / (1024 * 1024);
        if (mb > 20) {
            notify("File is over 20MB. In a real environment, this requires a Web Worker.");
        } else if (mb > 5) {
            if (!confirm("File is over 5MB. Parsing may freeze the browser briefly. Continue?")) {
                return;
            }
        }
    }

    try {
      btnRun.disabled = true;
      btnDownload.disabled = true;

      let model;

      if (useParsedState) {
        statusEl.textContent = 'Processing application state...';
        model = await timeStep(logger, 'NORMALIZE_STATE', async () => {
            const csvRows = buildUniversalCSV(state.parsed, { supportMappings: state.sticky?.supportMappings || [] });
            const method = state.engineMode === 'common' ? 'ContEngineMethod' : 'Legacy';
            const segments = normalizeToPCF(csvRows, { method });
            const nodePos = _resolveNodePositions(csvRows);
            const components = [];
            for (const seg of segments) {
                const type = String(seg.COMPONENT_TYPE || 'PIPE').toUpperCase();
                if (type === 'GHOST' || type === 'MESSAGE-SQUARE') continue;
                const p1 = _pt(seg.EP1) || _pt(nodePos.get(seg.FROM_NODE));
                const p2 = _pt(seg.EP2) || _pt(nodePos.get(seg.TO_NODE));
                const bore = Number(seg.DIAMETER || 0);

                const attributes = {
                  'PIPELINE-REFERENCE': seg.PIPELINE_REFERENCE || '',
                  MATERIAL: seg.MATERIAL || '',
                  SKEY: seg.SKEY || '',
                  T1: seg.T1,
                  P1: seg.P1,
                  WALL_THICK: seg.WALL_THICK,
                  FLUID_DENSITY: seg.FLUID_DENSITY,
                  INSUL_DENSITY: seg.INSUL_DENSITY,
                  SUPPORT_TAG: seg.SUPPORT_TAG || '',
                  SUPPORT_NAME: seg.SUPPORT_NAME || '',
                  SUPPORT_DESC: seg.SUPPORT_DESC || ''
                };

                components.push({
                    id: seg.REF_NO || `viewer3d-${seg.SEQ_NO}`,
                    type,
                    ep1: p1,
                    ep2: p2,
                    bore,
                    attributes
                });
            }
            return { components };
        });
      } else {
          statusEl.textContent = 'Reading file...';
          const text = await timeStep(logger, 'FILE_READ', async () => await currentFile.text());

          statusEl.textContent = 'Parsing blocks...';
          const parsed = await timeStep(logger, 'PARSE', async () => parsePcfText(text, logger));

          statusEl.textContent = 'Normalizing model...';
          model = await timeStep(logger, 'NORMALIZE', async () => normalizePcfModel(parsed, logger));
      }

      statusEl.textContent = 'Building geometry...';
      const exportScene = await timeStep(logger, 'BUILD_GEOMETRY', async () => buildExportScene(model, logger));

      statusEl.textContent = 'Exporting to GLB...';
      currentBlob = await timeStep(logger, 'EXPORT_GLB', async () => await exportSceneToGLB(exportScene));

      statusEl.textContent = 'Loading preview...';

      // Clear previous preview
      for (let i = scene.children.length - 1; i >= 0; i--) {
         const obj = scene.children[i];
         if (obj.type === 'Group') scene.remove(obj);
      }

      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = URL.createObjectURL(currentBlob);

      const loader = new GLTFLoader();
      await new Promise((resolve, reject) => {
         loader.load(currentBlobUrl, (gltf) => {
             scene.add(gltf.scene);

             // Auto-fit camera
             const box = new THREE.Box3().setFromObject(gltf.scene);
             const center = box.getCenter(new THREE.Vector3());
             const size = box.getSize(new THREE.Vector3());

             // For long linear models like STEAM_SISO, diagonal distance is safer
             const maxDim = Math.sqrt(size.x*size.x + size.y*size.y + size.z*size.z);

             // Update Global Tracking logic
             currentCenter.copy(center);
             currentMaxDim = maxDim;
             axesHelper.position.copy(center);
             // Make axes proportional to scene size
             axesHelper.scale.set(maxDim/4, maxDim/4, maxDim/4);

             // Base distance off of the bounding sphere radius (maxDim / 2)
             const radius = maxDim / 2;
             const fovRad = camera.fov * (Math.PI / 180);
             let distance = Math.abs(radius / Math.sin(fovRad / 2));
             // Adjust for aspect ratio if screen is tall
             if (camera.aspect < 1) distance /= camera.aspect;

             // Add buffer for margins
             distance *= 1.5;

             // Ensure far plane accommodates the distance
             camera.far = Math.max(10000000, distance * 10);
             camera.updateProjectionMatrix();

             const dir = new THREE.Vector3(1, 1, 1).normalize();

             camera.position.copy(center).add(dir.multiplyScalar(distance));
             camera.lookAt(center);
             controls.target.copy(center);
             // Adjust dolly speed for large objects
             controls.maxDistance = distance * 10;
             controls.update();

             // Scale up lights for massive scenes
             dirLight.position.copy(camera.position);
             const pointLight = new THREE.PointLight(0xffffff, 0.8, distance * 10);
             camera.add(pointLight);
             scene.add(camera); // Camera must be in scene for its child lights to work

             resolve();
         }, undefined, reject);
      });

      // Populate Heatmap Dropdown
      const propSet = new Set();
      scene.traverse(c => {
          if (c.isMesh && c.userData) {
              Object.keys(c.userData).forEach(k => {
                  if (k !== 'pcfId' && k !== 'pcfType') propSet.add(k);
              });
          }
      });
      const props = Array.from(propSet).sort();
      let html = `<option value="default">Default</option>`;
      props.forEach(p => {
          html += `<option value="${p}">${p}</option>`;
      });
      colorPropSelect.innerHTML = html;
      colorPropSelect.disabled = false;

      statusEl.textContent = 'Ready.';
      btnRun.disabled = false;
      btnDownload.disabled = false;
      const fName = useParsedState ? 'app_state.glb' : currentFile.name;
      logger.info('PIPELINE_DONE', { fileName: fName, bytes: currentBlob.size });

    } catch (err) {
      statusEl.textContent = 'Failed (Check logs)';
      btnRun.disabled = false;
      console.error(err);
    }
  });

  btnDownload.addEventListener('click', () => {
    if (!currentBlobUrl) return;
    const a = document.createElement('a');
    a.href = currentBlobUrl;
    const fName = (useParsedState || !currentFile) ? 'app_state.glb' : currentFile.name.replace(/\.[^/.]+$/, "") + ".glb";
    a.download = fName;
    a.click();

    // MDN Recommendation: revoke object url
    setTimeout(() => {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
        btnDownload.disabled = true; // require re-run
    }, 1000);
  });
}
