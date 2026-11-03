import * as THREE from 'three';
import { SelectionBox } from 'three/addons/interactive/SelectionBox.js';
import { resolveInspectableObject } from './createSelection.js';

export function createMarqueeZoom(getCamera, scene, domElement, controller) {
  const selectionBox = new SelectionBox(getCamera(), scene);
  let startPoint = null;
  let startPx = null;       // pixel start for visual overlay
  let enabled = false;
  let overlay = null;       // rubber-band rect element

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute', 'pointer-events:none', 'border:2px dashed #4a9eff',
      'background:rgba(74,158,255,0.1)', 'border-radius:2px', 'display:none', 'z-index:50'
    ].join(';');
    // Attach to the container that holds the canvas
    (domElement.parentElement || document.body).appendChild(overlay);
  }

  function showOverlay(x1, y1, x2, y2) {
    if (!overlay) return;
    const l = Math.min(x1, x2), t = Math.min(y1, y2);
    Object.assign(overlay.style, {
      left: l + 'px', top: t + 'px',
      width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px',
      display: 'block'
    });
  }

  function hideOverlay() { if (overlay) overlay.style.display = 'none'; }

  function toNdc(event) {
    const rect = domElement.getBoundingClientRect();
    return new THREE.Vector3(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
      0.5
    );
  }

  function toPx(event) {
    const rect = domElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  const onPointerDown = (event) => {
    if (!enabled || event.button !== 0) return;
    event.stopImmediatePropagation();
    startPoint = toNdc(event);
    startPx = toPx(event);
    // Disable orbit so it doesn't steal the drag
    if (controller?.controls) controller.controls.enabled = false;
    ensureOverlay();
  };

  const onPointerMove = (event) => {
    if (!enabled || !startPx) return;
    const cur = toPx(event);
    showOverlay(startPx.x, startPx.y, cur.x, cur.y);
  };

  const onPointerUp = (event) => {
    if (enabled) event.stopImmediatePropagation();
    // Always re-enable orbit
    if (controller?.controls) controller.controls.enabled = true;
    hideOverlay();

    if (!enabled || !startPoint) { startPoint = null; startPx = null; return; }

    const endPoint = toNdc(event);
    const dx = Math.abs(endPoint.x - startPoint.x);
    const dy = Math.abs(endPoint.y - startPoint.y);
    const sp = startPoint;
    startPoint = null; startPx = null;

    if (dx < 0.02 && dy < 0.02) return; // Too small: treat as click, not drag.

    const selected = selectionBox
      .select(sp, endPoint)
      .filter((obj) => Object.keys(obj.userData || {}).length > 0 || (obj.name && !obj.name.startsWith('Object_')));

    if (!selected.length) return;

    const box = new THREE.Box3();
    selected.forEach((obj) => {
      const target = resolveInspectableObject(obj);
      if (target && typeof target.updateWorldMatrix === 'function') {
        box.expandByObject(target, false);
      }
    });
    if (!box.isEmpty()) controller.fitBox?.(box);

    // Auto-disable marquee after one zoom so left-click orbit works again
    enabled = false;
    domElement.style.cursor = '';
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);

  return {
    setEnabled: (val) => {
      enabled = !!val;
      domElement.style.cursor = enabled ? 'crosshair' : '';
      // Disable orbit while marquee is armed so a drag starts the box not the orbit
      if (controller?.controls) controller.controls.enabled = !enabled;
      if (!enabled) { startPoint = null; startPx = null; hideOverlay(); }
    },
    dispose: () => {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.style.cursor = '';
      if (controller?.controls) controller.controls.enabled = true;
      overlay?.remove();
    }
  };
}
