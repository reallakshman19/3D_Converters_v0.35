import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createRenderer } from './createRenderer.js';
import { createCameraController } from './createCameraController.js';
import { createToolbar } from './createToolbar.js';
import { buildSceneIndex } from './sceneIndex.js';
import { createSelection } from './createSelection.js';
import { createPropertyPanel } from './createPropertyPanel.js';
import { createHeatmap } from './createHeatmap.js';
import { createSectionBox } from './createSectionBox.js';
import { createMarqueeZoom } from './createMarqueeZoom.js';
import { disposeScene } from './disposeRuntime.js';
import { createAxisHelper } from './createAxisHelper.js';
import { createDebugPanel } from './createDebugPanel.js';
import { computeBoundingMeasurement } from '../pro-editor/core/measureUtils.js';
import { installGlbLabelOverlay } from './glbLabelOverlay.js';
import { applyGlbSupportSymbols } from './applyGlbSupportSymbols.js';
import { layerManifestOf, mountLayerPanel } from '../ui/GlbLayerRegistry.js';

function ensureLayerPanelHost(previewContainer) {
  let host = previewContainer.querySelector(':scope > .bm-cii-viewer-layer-host');
  if (host) return host;
  host = document.createElement('div');
  host.className = 'bm-cii-viewer-layer-host';
  host.style.cssText = [
    'position:absolute',
    'left:16px',
    'top:16px',
    'z-index:14',
    'width:280px',
    'max-height:min(420px,58vh)',
    'overflow:auto',
    'pointer-events:auto',
    'display:none',
  ].join(';');
  previewContainer.appendChild(host);
  return host;
}

export function createViewerApp(previewContainer, toolbarContainer, propPanel, propContent, debugLogsContainer, options = {}) {

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a3a45); // Brighter mid-grey; geometry visible.

  // Defer initialization to first frame to ensure container has size
  let initialized = false;
  let renderer, domElement, disposeRenderer, camera, controller, axesHelper, dirLight, pointLight, toolbar;
  let resizeObserver = null;
  let windowResizeHandler = null;
  let currentRoot = null;
  let animationId;
  let sceneIndex = null;
  let propertyPanel = null;
  let heatmap = null;
  let sectionBox = null;
  let debugPanel = null;
  let selection = null;
  let selectedItem = null;
  let marqueeZoom = null;
  let css2dRenderer = null;
  let msgCircleGroup = new THREE.Group();
  let msgSquareGroup = new THREE.Group();
  let measureEnabled = false;
  let measurementListener = null;
  let measureStateListener = null;
  let sectionEnabled = false;
  let layerPanelHost = null;
  let layerPanel = null;

  const resizeViewport = () => {
    const width = previewContainer.clientWidth;
    const height = previewContainer.clientHeight;
    if (!renderer || !controller || !width || !height) return;
    renderer.setSize(width, height);
    if (domElement) {
      domElement.style.width = `${width}px`;
      domElement.style.height = `${height}px`;
    }
    css2dRenderer?.setSize?.(width, height);
    controller.onResize(width, height);
  };

  const mountLayersForCurrentRoot = () => {
    if (!currentRoot) return null;
    layerPanelHost = options.layerPanelHost || layerPanelHost || ensureLayerPanelHost(previewContainer);
    // Target the full scene, not only the GLB root, because readable runtime
    // support glyphs are world-space overlays added to the scene after GLB load.
    const layerTarget = scene;
    const manifest = layerManifestOf(layerTarget);
    layerPanel = mountLayerPanel(layerPanelHost, layerTarget, manifest, {
      onChange: ({ layerId, checked }) => {
        debugPanel?.log?.('layers', 'info', `Layer ${layerId} ${checked ? 'on' : 'off'}`);
      },
    });
    const count = manifest?.layers?.length || 0;
    layerPanelHost.style.display = count ? 'block' : 'none';
    if (count) debugPanel?.log?.('layers', 'info', `Loaded ${count} GLB layers`);
    return layerPanel;
  };

  const init = () => {
    if (initialized || !previewContainer.clientWidth) return;
    initialized = true;

    const renderData = createRenderer(previewContainer);
    renderer = renderData.renderer;
    domElement = renderData.domElement;
    disposeRenderer = renderData.dispose;

    // CSS2D overlay for MESSAGE-CIRCLE labels and GLB metadata labels.
    css2dRenderer = new CSS2DRenderer();
    css2dRenderer.setSize(previewContainer.clientWidth, previewContainer.clientHeight);
    css2dRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2147483000;';
    previewContainer.style.position = 'relative';
    previewContainer.appendChild(css2dRenderer.domElement);
    scene.add(msgCircleGroup);
    scene.add(msgSquareGroup);

    camera = new THREE.PerspectiveCamera(60, previewContainer.clientWidth / previewContainer.clientHeight, 0.1, 10000000);

    controller = createCameraController(camera, domElement);
    windowResizeHandler = () => resizeViewport();
    window.addEventListener('resize', windowResizeHandler);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resizeViewport());
      resizeObserver.observe(previewContainer);
    }
    resizeViewport();

    axesHelper = createAxisHelper(camera, domElement);
    // ViewHelper automatically attaches to camera, no need to add to scene

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));  // Strong ambient so geometry is always visible
    dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    // Fill light from opposite side for better contrast on dark materials
    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.6);
    fillLight.position.set(-80, -100, -60);
    scene.add(fillLight);

    pointLight = new THREE.PointLight(0xffffff, 0.4);
    camera.add(pointLight);
    scene.add(camera);

    toolbar = createToolbar(toolbarContainer, controller);
    toolbar.setFitHandler(() => {
       if (currentRoot) controller.fitScene(currentRoot);
    });
    toolbar.setMeasureHandler((enabled) => {
      measureEnabled = !!enabled;
      if (measureStateListener) measureStateListener(measureEnabled);
      if (!measureEnabled && measurementListener) measurementListener(null);
    });

    propertyPanel = createPropertyPanel(propPanel, propContent);
    heatmap = createHeatmap(scene);
    sectionBox = createSectionBox(scene, renderer);

    debugPanel = createDebugPanel(debugLogsContainer);

    // Wire up marquee zoom (button-toggled)
    const getActiveCamera = () => controller.getActiveCamera();
    marqueeZoom = createMarqueeZoom(getActiveCamera, scene, domElement, controller);

    toolbar.setSectionHandler((enabled) => {
        sectionEnabled = !!enabled;
        if (enabled) {
            sectionBox.enable();
            if (currentRoot) sectionBox.fitToScene(currentRoot);
        } else {
            sectionBox.disable(currentRoot);
        }
    });

    selection = createSelection(getActiveCamera, scene, domElement);
    selection.onSelect((clickedObj) => {
        if (!clickedObj || !sceneIndex) {
            selectedItem = null;
            propertyPanel.hide();
            if (measurementListener) measurementListener(null);
            return;
        }

        const id = clickedObj.userData.pcfId || clickedObj.name || clickedObj.uuid;
        const item = sceneIndex.byId.get(id);

        if (item) {
            selectedItem = item;
            // Selection does not move the camera. Use FIT ALL or Zoom Selected explicitly.
            propertyPanel.show(item);
            if (measureEnabled && measurementListener) {
              const measurement = computeBoundingMeasurement(item.object3D);
              measurementListener({
                id,
                width: Number(measurement.width || 0),
                height: Number(measurement.height || 0),
                depth: Number(measurement.depth || 0),
                diagonal: Number(measurement.diagonal || 0),
              });
            } else if (measurementListener) {
              measurementListener(null);
            }

            // Auto section fit to selection if enabled
            if (sectionBox && sectionBox.isEnabled()) {
                sectionBox.fitToSelection(item.object3D, currentRoot);
            }
        }
    });

    // Handle view helper clicks
    domElement.addEventListener('pointerup', (event) => {
      if (axesHelper && axesHelper.handleClick(event)) {
          // Handled by view helper
      }
    });

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controller.update();
      renderer.autoClear = true;
      renderer.render(scene, controller.getActiveCamera());
      if (css2dRenderer) css2dRenderer.render(scene, controller.getActiveCamera());
      if (axesHelper) {
          renderer.autoClear = false;
          axesHelper.render(renderer);
      }
    };
    animate();
  };

  setTimeout(init, 100);

  return {
    get camera() { return camera; },
    set camera(cam) { camera = cam; },
    get orthographicCamera() { return controller?.getActiveCamera?.(); },
    get perspectiveCamera() { return camera; },
    getCurrentRoot: () => currentRoot,
    getScene: () => scene,
    getLayerPanel: () => layerPanel,
    setMeasureEnabled: (enabled) => {
      measureEnabled = !!enabled;
      toolbar?.setMeasureState?.(measureEnabled);
      if (measureStateListener) measureStateListener(measureEnabled);
      if (!measureEnabled && measurementListener) measurementListener(null);
    },
    setMeasureStateListener: (fn) => {
      measureStateListener = typeof fn === 'function' ? fn : null;
    },
    setMeasurementListener: (fn) => {
      measurementListener = typeof fn === 'function' ? fn : null;
    },
    fitAll: () => {
      if (currentRoot && controller) controller.fitScene(currentRoot);
    },
    zoomSelected: () => {
      if (selectedItem?.object3D && controller) controller.fitObject(selectedItem.object3D);
    },
    resize: () => {
      resizeViewport();
    },
    setTarget: (targetVec) => {
      controller?.setTarget?.(targetVec);
    },
    setPresetView: (name) => {
      controller?.setPresetView?.(name);
    },
    setMarqueeZoom: (enabled) => {
      marqueeZoom?.setEnabled?.(enabled);
    },
    toggleSection: () => {
      sectionEnabled = !sectionEnabled;
      if (sectionEnabled) {
        sectionBox?.enable?.();
        if (currentRoot) sectionBox?.fitToScene?.(currentRoot);
      } else {
        sectionBox?.disable?.(currentRoot);
      }
    },
    getModelBounds: () => {
      if (!currentRoot) return null;
      const box = new THREE.Box3().setFromObject(currentRoot);
      if (box.isEmpty()) return null;
      return { min: box.min.clone(), max: box.max.clone() };
    },
    setSectionClipBounds: (bounds) => {
      sectionBox?.setClipBounds?.(bounds);
    },
    resetSectionToModel: () => {
      if (currentRoot) sectionBox?.fitToScene?.(currentRoot);
    },
    loadGLB: async (url) => {
      init();
      const loader = new GLTFLoader();
      return new Promise((resolve, reject) => {
          loader.load(url, (gltf) => {
              if (currentRoot) {
                  scene.remove(currentRoot);
                  disposeScene(currentRoot);
              }
              currentRoot = gltf.scene;
              scene.add(currentRoot);

              // Pre-compute metrics before fit to ensure camera far clip handles large scenes
              const box = new THREE.Box3().setFromObject(currentRoot);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.sqrt(size.x*size.x + size.y*size.y + size.z*size.z);

              // ViewHelper sets its own scale, no need to scale it like axesHelper

              controller.fitScene(currentRoot);
              dirLight.position.copy(controller.getActiveCamera().position);

              // Force visible materials; brighten any mesh that is near-black.
              currentRoot.traverse(child => {
                if (!child.isMesh) return;
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                  if (!mat) return;
                  // Store original for heatmap reset
                  if (!mat.userData.__baseColor) mat.userData.__baseColor = mat.color?.clone?.();
                  // If the mesh is very dark (luminance < 0.15), force a light steel-blue
                  const c = mat.color;
                  if (c) {
                    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
                    if (lum < 0.15) { c.setHex(0x6eb5e0); mat.userData.__baseColor = c.clone(); }
                  }
                  // Ensure metalness does not kill visibility.
                  if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.3);
                  if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.45);
                  mat.needsUpdate = true;
                });
              });

              applyGlbSupportSymbols(currentRoot, scene, { scaleMultiplier: 1.0 });
              sceneIndex = buildSceneIndex(currentRoot);
              const glbLabels = installGlbLabelOverlay(currentRoot, msgSquareGroup, {
                maxLabels: 300,
                panelHost: options.labelPanelHost || null,
              });
              debugPanel.log('system', 'info', `Loaded scene with ${sceneIndex.items.length} indexed objects`);
              if (glbLabels.length) debugPanel.log('system', 'info', `Loaded ${glbLabels.length} GLB labels from userData`);
              mountLayersForCurrentRoot();

              // Inform toolbar of available properties
              const propSet = new Set();
              currentRoot.traverse(c => {
                  if (c.isMesh && c.userData) {
                      Object.keys(c.userData).forEach(k => {
                          if (k !== 'pcfId' && k !== 'pcfType') propSet.add(k);
                      });
                  }
              });
              toolbar.setProperties(Array.from(propSet).sort());

              toolbar.setHeatmapHandler((prop) => {
                  if (prop === 'default') {
                      heatmap.clearMetric();
                      toolbar.updateLegend(null);
                      return;
                  }

                  // For standalone meshes, we can adapt the heatmap signature
                  const valuesSet = new Set();
                  currentRoot.traverse(c => {
                      if (c.isMesh && c.userData && c.userData[prop] !== undefined) {
                          valuesSet.add(String(c.userData[prop]));
                      }
                  });
                  const uniqueValues = Array.from(valuesSet).sort();
                  const palettes = [
                      0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c, 0xfabebe,
                      0x008080, 0xe6beff, 0x9a6324, 0xfffac8, 0x800000, 0xaaffc3, 0x808000, 0xffd8b1, 0x000075, 0x808080,
                  ];
                  const colorMap = new Map();
                  uniqueValues.forEach((val, idx) => {
                      colorMap.set(val, palettes[idx % palettes.length]);
                  });

                  heatmap.clearMetric();
                  currentRoot.traverse(child => {
                      if (child.isMesh && child.userData) {
                          const mats = Array.isArray(child.material) ? child.material : [child.material];
                          mats.forEach(mat => {
                              if (!mat.userData.__baseColor) {
                                  mat.userData.__baseColor = mat.color.clone();
                              }
                              const val = String(child.userData[prop]);
                              if (child.userData[prop] !== undefined && colorMap.has(val)) {
                                  mat.color.setHex(colorMap.get(val));
                              } else {
                                  mat.color.set('#666666'); // Ghosted
                              }
                          });
                      }
                  });

                  let html = '';
                  uniqueValues.forEach(val => {
                      const colorHex = '#' + colorMap.get(val).toString(16).padStart(6, '0');
                      html += `<div style="display:flex; align-items:center; margin-bottom:4px;">
                          <span style="width:12px; height:12px; background:${colorHex}; display:inline-block; margin-right:6px; border:1px solid #fff;"></span>
                          <span>${val}</span>
                      </div>`;
                  });
                  toolbar.updateLegend(html);
              });

              options.onSceneLoaded?.({ root: currentRoot, scene, gltf, sceneIndex, layerPanel });
              resolve({ root: currentRoot, scene, gltf, sceneIndex, layerPanel });
          }, undefined, reject);
      });
    },
    loadMessageSquareNodes: (nodes = []) => {
      while (msgSquareGroup.children.length) {
        msgSquareGroup.remove(msgSquareGroup.children[0]);
      }
      for (const { pos, text } of nodes) {
        if (!pos || !text) continue;
        const div = document.createElement('div');
        div.textContent = text;
        div.style.cssText = `
          font: 600 9px/1.2 "Courier New", monospace;
          color: #1a1a00;
          background: rgba(255,235,59,0.92);
          padding: 2px 5px;
          border: 1px solid rgba(161,120,0,0.6);
          border-radius: 3px;
          pointer-events: none;
          white-space: nowrap;
          transform: translate(-50%, -50%);
        `;
        const label = new CSS2DObject(div);
        label.position.set(Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.z) || 0);
        msgSquareGroup.add(label);
      }
    },
    dispose: () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      if (windowResizeHandler) window.removeEventListener('resize', windowResizeHandler);
      if (measurementListener) measurementListener(null);
      marqueeZoom?.dispose?.();
      axesHelper?.dispose?.();
      selection?.dispose?.();
      toolbar?.dispose?.();
      disposeScene(scene);
      disposeRenderer?.();
      if (css2dRenderer?.domElement?.parentNode === previewContainer) {
        previewContainer.removeChild(css2dRenderer.domElement);
      }
      if (layerPanelHost?.parentNode === previewContainer) {
        previewContainer.removeChild(layerPanelHost);
      }
    }
  };
}
