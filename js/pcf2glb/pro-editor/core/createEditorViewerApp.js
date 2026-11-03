import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRenderer } from '../../advanced/createRenderer.js';
import { createCameraController } from './createEditorCameraController.js';
import { createToolbar } from '../../advanced/createToolbar.js';
import { buildSceneIndex } from './sceneIndex.js';
import { createSelection, resolveInspectableObject } from './createEditorSelection.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createPropertyPanel } from '../../advanced/createPropertyPanel.js';
import { createHeatmap } from '../../advanced/createHeatmap.js';
import { createSectionBox } from '../../advanced/createSectionBox.js';
import { createMarqueeZoom } from '../../advanced/createMarqueeZoom.js';
import { disposeScene } from '../../advanced/disposeRuntime.js';
import { createAxisHelper } from '../../advanced/createAxisHelper.js';
import { createDebugPanel } from '../../advanced/createDebugPanel.js';
import { createCommandStack } from './commandStack.js';
import { computeBoundingMeasurement } from './measureUtils.js';

export function createEditorViewerApp(previewContainer, toolbarContainer, propPanel, propContent, debugLogsContainer, options = {}) {

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // Defer initialization to first frame to ensure container has size
  let initialized = false;
  let renderer, domElement, disposeRenderer, camera, controller, axesHelper, dirLight, pointLight, toolbar;
  let currentRoot = null;
  let animationId;
  let sceneIndex = null;
  let propertyPanel = null;
  let heatmap = null;
  let sectionBox = null;
  let debugPanel = null;
  let transformControls = null;
  let currentSelection = null;
  let activeToolMode = 'select';
  let previousEmissive = null;
  let resizeObserver = null;
  const commandStack = createCommandStack(options.logger);

  const init = () => {
    if (initialized || !previewContainer.clientWidth) return;
    initialized = true;

    const renderData = createRenderer(previewContainer);
    renderer = renderData.renderer;
    domElement = renderData.domElement;
    disposeRenderer = renderData.dispose;

    camera = new THREE.PerspectiveCamera(60, previewContainer.clientWidth / previewContainer.clientHeight, 0.1, 10000000);

    controller = createCameraController(camera, domElement);

    axesHelper = createAxisHelper(camera, domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-100, -200, -50);
    scene.add(backLight);

    pointLight = new THREE.PointLight(0xffffff, 0.5);
    camera.add(pointLight);
    scene.add(camera);

    if (toolbarContainer) {
        toolbar = createToolbar(toolbarContainer, controller);
        toolbar.setFitHandler(() => {
           if (currentRoot) controller.fitScene(currentRoot);
        });
    }

    propertyPanel = createPropertyPanel(propPanel, propContent);
    heatmap = createHeatmap(scene);
    sectionBox = createSectionBox(scene, renderer);

    debugPanel = createDebugPanel(debugLogsContainer);

    transformControls = new TransformControls(camera, domElement);
    let startState = null;
    transformControls.addEventListener('dragging-changed', (event) => {
        controller.controls.enabled = !event.value;
        const obj = transformControls.object;
        if (!obj) return;
        
        if (event.value) {
            // Drag started
            startState = {
                position: obj.position.clone(),
                quaternion: obj.quaternion.clone(),
                scale: obj.scale.clone()
            };
        } else {
            // Drag ended
            const endState = {
                position: obj.position.clone(),
                quaternion: obj.quaternion.clone(),
                scale: obj.scale.clone()
            };
            
            // Push command if anything actually changed
            if (startState) {
                const posChanged = !startState.position.equals(endState.position);
                const quatChanged = !startState.quaternion.equals(endState.quaternion);
                const scaleChanged = !startState.scale.equals(endState.scale);
                
                if (posChanged || quatChanged || scaleChanged) {
                    const cmd = {
                        name: 'Transform Edit',
                        do() {
                            obj.position.copy(endState.position);
                            obj.quaternion.copy(endState.quaternion);
                            obj.scale.copy(endState.scale);
                        },
                        undo() {
                            obj.position.copy(startState.position);
                            obj.quaternion.copy(startState.quaternion);
                            obj.scale.copy(startState.scale);
                        }
                    };
                    commandStack.exec(cmd);
                }
            }
            startState = null;
        }
    });
    scene.add(transformControls);

    const selection = createSelection(() => controller.getActiveCamera(), scene, domElement);
    selection.onSelect((clickedObj) => {
        if (currentSelection && currentSelection.object3D && previousEmissive) {
            currentSelection.object3D.traverse((child) => {
                if (child.isMesh && child.material && previousEmissive.has(child.uuid)) {
                    child.material.emissive.copy(previousEmissive.get(child.uuid));
                }
            });
            previousEmissive = null;
        }

        if (!clickedObj || !sceneIndex) {
            controller.resetTarget();
            propertyPanel.hide();
            transformControls.detach();
            currentSelection = null;
            options.onSelectionChange?.(null, null);
            return;
        }

        const id = clickedObj.userData.pcfId || clickedObj.userData.REF_NO || clickedObj.name || clickedObj.uuid;
        const item = sceneIndex.byId.get(id);

        if (item) {
            currentSelection = item;
            
            // Highlight logic
            previousEmissive = new Map();
            const highlightColor = new THREE.Color(0x3b82f6); // Primary blue
            item.object3D.traverse((child) => {
                if (child.isMesh && child.material) {
                    previousEmissive.set(child.uuid, child.material.emissive.clone());
                    child.material.emissive.copy(highlightColor);
                    child.material.emissiveIntensity = 0.5;
                }
            });

            controller.fitObject(item.object3D);
            propertyPanel.show(item);

            if (sectionBox && sectionBox.isEnabled()) {
                sectionBox.fitToSelection(item.object3D, currentRoot);
            }

            if (activeToolMode === 'move' || activeToolMode === 'rotate') {
                transformControls.attach(item.object3D);
            }
            
            if (activeToolMode === 'measure') {
                const stats = computeBoundingMeasurement(item.object3D);
                const msg = `Width=${stats.width.toFixed(3)} Height=${stats.height.toFixed(3)} Depth=${stats.depth.toFixed(3)} Diagonal=${stats.diagonal.toFixed(3)}`;
                debugPanel?.log('measure', 'info', msg);
                options.onMeasure?.(item, stats);
            }
            
            options.onSelectionChange?.(item, clickedObj);
        }
    });

    domElement.addEventListener('pointerup', (event) => {
      if (axesHelper && axesHelper.handleClick(event)) {
          // Handled by view helper
      }
    });

    domElement.addEventListener('dblclick', (event) => {
      if (!renderer || !currentRoot) return;
      const rect = domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, controller.getActiveCamera());
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find(h => h.object?.isMesh || h.object?.type === 'Mesh');
      
      if (hit && hit.object) {
        const resolved = resolveInspectableObject(hit.object);
        if (resolved) controller.fitObject(resolved);
      } else {
        controller.fitScene(currentRoot);
      }
    });

    const createMarqueeZoomData = createMarqueeZoom(() => controller.getActiveCamera(), scene, domElement, controller);

    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries?.[0]?.contentRect;
      const width = rect?.width || previewContainer.clientWidth;
      const height = rect?.height || previewContainer.clientHeight;
    
      if (renderer) renderer.setSize(width, height, false);
      controller.onResize?.(width, height);
    });
    resizeObserver.observe(previewContainer);

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controller.update();
      renderer.autoClear = true;
      renderer.render(scene, controller.getActiveCamera ? controller.getActiveCamera() : camera);
      if (axesHelper) {
          renderer.autoClear = false;
          axesHelper.render(renderer);
          renderer.autoClear = true;
      }
      
      options.onFrame?.({
        camera: controller.getActiveCamera ? controller.getActiveCamera() : camera,
        scene,
        currentRoot,
        selection: currentSelection,
        renderer
      });
    };
    animate();
  };

  setTimeout(init, 100);

  return {
    loadGLB: async (url) => {
      init();
      const loader = new GLTFLoader();
      return new Promise((resolve, reject) => {
          loader.load(url, (gltf) => {
              if (currentRoot) {
                  scene.remove(currentRoot);
                  disposeScene(currentRoot);
                  currentSelection = null;
              }
              currentRoot = gltf.scene;
              scene.add(currentRoot);

              sceneIndex = buildSceneIndex(currentRoot);

              controller.fitScene(currentRoot);
              dirLight.position.copy(camera.position);

              debugPanel.log('system', 'info', `Loaded scene with ${sceneIndex.items.length} indexed objects`);

              const propSet = new Set();
              currentRoot.traverse(c => {
                  if (c.isMesh && c.userData) {
                      Object.keys(c.userData).forEach(k => {
                          if (k !== 'pcfId' && k !== 'pcfType') propSet.add(k);
                      });
                  }
              });
              if (toolbar) {
                  toolbar.setProperties(Array.from(propSet).sort());
    
                  toolbar.setHeatmapHandler((prop) => {
                      if (prop === 'default') {
                          heatmap.clearMetric();
                          toolbar.updateLegend(null);
                          return;
                      }
    
                      const valuesSet = new Set();
                      currentRoot.traverse(c => {
                          if (c.isMesh && c.userData && c.userData[prop] !== undefined) {
                              valuesSet.add(String(c.userData[prop]));
                          }
                      });
                      const uniqueValues = Array.from(valuesSet).sort();
                      if (uniqueValues.length === 0) return;
    
                      const colorMap = new Map();
                      uniqueValues.forEach((val, i) => {
                          const hue = i / uniqueValues.length;
                          const c = new THREE.Color().setHSL(hue, 1.0, 0.5);
                          colorMap.set(val, c.getHex());
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
              }

              options.onSceneLoaded?.({ scene: currentRoot, sceneIndex });
              resolve();
          }, undefined, reject);
      });
    },
    fitAll: () => {
      if (currentRoot) controller.fitScene(currentRoot);
    },
    home: () => {
      controller.resetHome();
    },
    setProjection: (mode) => {
      controller.setProjection?.(mode);
    },
    toggleProjection: () => {
      controller.toggleProjection?.();
    },
    getProjectionMode: () => {
      return controller?.getProjectionMode?.() || 'PERSPECTIVE';
    },
    getController: () => {
      return controller;
    },
    setTheme: (themeName) => {
        if (themeName === 'DARK') scene.background = new THREE.Color(0x222222);
        else if (themeName === 'LIGHT') scene.background = new THREE.Color(0xf0f4f8);
        else if (themeName === 'BLUE') scene.background = new THREE.Color(0x1e2d42);
        else scene.background = new THREE.Color(0x222222);
    },
    getCurrentSelection: () => {
      return currentSelection;
    },
    pickAtClient: (clientX, clientY) => {
      if (!renderer || !currentRoot) return null;
    
      const rect = domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
    
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, controller.getActiveCamera());
      const intersects = raycaster.intersectObjects(scene.children, true);
    
      for (const hit of intersects) {
        if (!hit.object || (!hit.object.isMesh && hit.object.type !== 'Mesh')) continue;
        const resolved = resolveInspectableObject(hit.object);
        const id = resolved?.userData?.pcfId || resolved?.userData?.REF_NO || resolved?.name || resolved?.uuid;
        const item = sceneIndex?.byId?.get(id) ?? null;
        return { hit, object: resolved, item };
      }
    
      return null;
    },
    setToolMode: (mode) => {
        activeToolMode = mode;
        if (!transformControls) return;
        if (mode === 'select') {
            transformControls.detach();
        } else if (mode === 'move') {
            transformControls.setMode('translate');
            if (currentSelection) transformControls.attach(currentSelection.object3D);
        } else if (mode === 'rotate') {
            transformControls.setMode('rotate');
            if (currentSelection) transformControls.attach(currentSelection.object3D);
        } else if (mode === 'measure' || mode === 'break' || mode === 'connect' || mode === 'stretch' || mode === 'marquee') {
            transformControls.detach();
        }
    },
    undo: () => {
      commandStack.undo();
    },
    redo: () => {
      commandStack.redo();
    },
    canUndo: () => commandStack.canUndo(),
    canRedo: () => commandStack.canRedo(),
    setSnapSettings: (enabled, translationSnap, rotationSnap) => {
        if (!transformControls) return;
        transformControls.setTranslationSnap(enabled ? translationSnap : null);
        transformControls.setRotationSnap(enabled ? THREE.MathUtils.degToRad(rotationSnap) : null);
    },
    dispose: () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      if (disposeRenderer) disposeRenderer();
      if (controller) controller.dispose();
      if (transformControls) {
          transformControls.detach();
          scene.remove(transformControls);
          transformControls.dispose();
      }
    }
  };
}
