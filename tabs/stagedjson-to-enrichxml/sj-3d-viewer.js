/**
 * Functionality: renders a 3D orthographic pipeline routing preview 
 * from the enriched records. Supports rotation, panning, zoom, presets, and fit view.
 * Parameters: explicit. Outputs: DOM panel. No side effects.
 */

import { draw3dScene } from './sj-3d-renderer.js';
import { buildStagedSceneGeometry } from './sj-3d-scene-geometry.js';

export function build3dViewerPanel(records = []) {
  const container = document.createElement('div');
  container.className = 'sj-3d-container';

  const { nodes, segments } = buildStagedSceneGeometry(records);

  if (nodes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sj-atbl-empty';
    empty.innerHTML = `
      <span class="sj-atbl-empty-icon">🌐</span>
      <span class="sj-atbl-empty-msg">No 3D coordinate data available in the staged JSON.</span>
    `;
    container.appendChild(empty);
    return container;
  }

  // Bounding box calculations
  const geometryPoints = [
    ...nodes,
    ...segments.flatMap((segment) => [segment.start, segment.end]),
  ];
  const xs = geometryPoints.map(n => n.x);
  const ys = geometryPoints.map(n => n.y);
  const zs = geometryPoints.map(n => n.z);
  
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(sizeX, sizeY, sizeZ, 1);

  // Set up Canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'sj-3d-canvas';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  // Set up Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'sj-3d-tooltip';
  container.appendChild(tooltip);

  // Instructions
  const inst = document.createElement('div');
  inst.className = 'sj-3d-instructions';
  inst.textContent = 'Drag to Rotate | Shift+Drag to Pan | Scroll to Zoom';
  container.appendChild(inst);

  // 3D rotation / pan / scale state
  let theta = Math.PI / 4; 
  let phi = Math.PI / 6;   
  let scale = 1.0;
  let offsetX = 0;
  let offsetY = 0;
  let hoveredNode = null;

  // Canvas context
  const ctx = canvas.getContext('2d');

  // Drawing loop
  const draw = () => {
    const config = {
      centerX, centerY, centerZ,
      theta, phi, scale,
      offsetX, offsetY,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      maxDim,
      hoveredNode,
      minX, maxX, minY, maxY, minZ, maxZ
    };
    draw3dScene(ctx, canvas, nodes, segments, config);
  };

  // Fit view function
  const fitView = () => {
    let minPX = Infinity, maxPX = -Infinity;
    let minPY = Infinity, maxPY = -Infinity;

    nodes.forEach(n => {
      const dx = n.x - centerX;
      const dy = n.y - centerY;
      const dz = n.z - centerZ;

      const x1 = dx * Math.cos(theta) - dy * Math.sin(theta);
      const y1 = dx * Math.sin(theta) + dy * Math.cos(theta);
      const z1 = dz;

      const x2 = x1;
      const y2 = y1 * Math.cos(phi) - z1 * Math.sin(phi);

      const baseDim = Math.min(canvas.width, canvas.height) || 400;
      const wScale = (baseDim * 0.7) / maxDim;
      
      const px = x2 * wScale;
      const py = -y2 * wScale;

      if (px < minPX) minPX = px;
      if (px > maxPX) maxPX = px;
      if (py < minPY) minPY = py;
      if (py > maxPY) maxPY = py;
    });

    const w = maxPX - minPX || 1;
    const h = maxPY - minPY || 1;
    const pad = 0.85; 
    const scaleX = (canvas.width * pad) / w;
    const scaleY = (canvas.height * pad) / h;
    
    scale = Math.min(scaleX, scaleY, 4.0);
    offsetX = -((minPX + maxPX) / 2) * scale;
    offsetY = -((minPY + maxPY) / 2) * scale;
    draw();
  };

  // Unified Zoom Centering helper
  const performZoom = (factor, mouseX, mouseY) => {
    const oldScale = scale;
    scale = Math.min(Math.max(scale * factor, 0.05), 100.0);
    const ratio = scale / oldScale;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const mx = mouseX !== undefined ? mouseX : cx;
    const my = mouseY !== undefined ? mouseY : cy;
    offsetX = (mx - cx) * (1 - ratio) + offsetX * ratio;
    offsetY = (my - cy) * (1 - ratio) + offsetY * ratio;
    draw();
  };

  // Build Toolbar Controls Overlay
  const toolbar = document.createElement('div');
  toolbar.className = 'sj-3d-toolbar';

  const addToolBtn = (html, title, action) => {
    const btn = document.createElement('button');
    btn.className = 'sj-3d-toolbtn';
    btn.innerHTML = html;
    btn.title = title;
    btn.onclick = action;
    toolbar.appendChild(btn);
  };

  addToolBtn('🏠', 'Reset View', () => {
    theta = Math.PI / 4;
    phi = Math.PI / 6;
    scale = 1.0;
    offsetX = 0;
    offsetY = 0;
    draw();
  });
  addToolBtn('➕', 'Zoom In', () => performZoom(1.25));
  addToolBtn('➖', 'Zoom Out', () => performZoom(0.8));
  addToolBtn('🔲 Top', 'Top View', () => { theta = 0; phi = 0; fitView(); });
  addToolBtn('🔲 Front', 'Front View', () => { theta = 0; phi = -Math.PI / 2; fitView(); });
  addToolBtn('🔲 Side', 'Side View', () => { theta = -Math.PI / 2; phi = -Math.PI / 2; fitView(); });
  addToolBtn('📏 Fit', 'Fit to Screen', fitView);

  container.appendChild(toolbar);

  // Resize handler
  const resize = () => {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width || 600;
    canvas.height = rect.height || 400;
    draw();
  };

  const observer = new ResizeObserver(() => {
    resize();
  });
  observer.observe(container);

  // Interactions (Mouse/Touch Drag, Wheel)
  let isRotating = false;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  canvas.oncontextmenu = e => e.preventDefault();

  canvas.onmousedown = e => {
    startX = e.clientX;
    startY = e.clientY;
    if (e.button === 2 || e.shiftKey) {
      isPanning = true;
      canvas.style.cursor = 'move';
    } else if (e.button === 0) {
      isRotating = true;
      canvas.style.cursor = 'grabbing';
    }
  };

  window.onmouseup = () => {
    isRotating = false;
    isPanning = false;
    canvas.style.cursor = 'grab';
  };

  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isRotating) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      theta -= dx * 0.007;
      phi -= dy * 0.007;
      startX = e.clientX;
      startY = e.clientY;
      draw();
    } else if (isPanning) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      offsetX += dx;
      offsetY += dy;
      startX = e.clientX;
      startY = e.clientY;
      draw();
    } else {
      let best = null;
      let dist = 12; 
      nodes.forEach(n => {
        const d = Math.hypot(n.screenX - mx, n.screenY - my);
        if (d < dist) {
          dist = d;
          best = n;
        }
      });

      if (best !== hoveredNode) {
        hoveredNode = best;
        draw();

        if (hoveredNode) {
          tooltip.style.display = 'block';
          tooltip.style.left = (mx + 15) + 'px';
          tooltip.style.top = (my + 15) + 'px';
          tooltip.innerHTML = `
            <strong>NAME:</strong> ${hoveredNode.name}<br/>
            <strong>TYPE:</strong> ${hoveredNode.type}<br/>
            <strong>BORE:</strong> ${hoveredNode.bore}mm<br/>
            <strong>RATING:</strong> ${hoveredNode.rating || 'N/A'}<br/>
            <strong>BRANCH:</strong> ${hoveredNode.branch}<br/>
            <strong>POS:</strong> (${hoveredNode.x.toFixed(0)}, ${hoveredNode.y.toFixed(0)}, ${hoveredNode.z.toFixed(0)})
          `;
        } else {
          tooltip.style.display = 'none';
        }
      } else if (hoveredNode) {
        tooltip.style.left = (mx + 15) + 'px';
        tooltip.style.top = (my + 15) + 'px';
      }
    }
  };

  canvas.onwheel = e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    performZoom(e.deltaY < 0 ? 1.1 : 0.9, mx, my);
  };

  return container;
}
