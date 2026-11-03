import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { THEME_SCENE_STYLES } from '../viewer-3d-defaults.js?v=20260518-statusbar-theme-12';

import { RvmSectioning } from './RvmSectioning.js';
import { RvmVisibilityController } from './RvmVisibilityController.js';
import { RvmSelectionAdapter } from './RvmSelectionAdapter.js';

export class RvmViewer3D {
    constructor(container, ctx) {
        this.container = container;
        this.ctx = ctx; // ctx might contain capabilities, identityMap, etc.

        this._disposed = false;
        this._themeKey = 'NavisDark';

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x08111c);

        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;

        // Camera setup
        this.perspCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
        this.perspCamera.position.set(100, 100, 100);
        this.perspCamera.lookAt(0, 0, 0);
        this.perspCamera.up.set(0, 1, 0);

        // Orthographic Camera setup
        const aspect = width / height;
        const frustumSize = 1000;
        this.orthoCamera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2, frustumSize * aspect / 2,
            frustumSize / 2, -frustumSize / 2,
            0.1, 100000
        );
        this.orthoCamera.position.set(100, 100, 100);
        this.orthoCamera.lookAt(0, 0, 0);
        this.orthoCamera.up.set(0, 1, 0);

        this.camera = this.perspCamera;
        this._isOrthographic = false;

        // WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.localClippingEnabled = true; // Critical for section planes
        this.container.appendChild(this.renderer.domElement);

        // CSS2D Renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(width, height);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.container.appendChild(this.labelRenderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 1.1;
        this.controls.rotateSpeed = 1.0;
        this.controls.minDistance = 0.05;
        this.controls.maxDistance = 10000000;
        this.renderer.domElement.style.touchAction = 'none';

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 1, 1).normalize();
        this.scene.add(dirLight);

        // The model group
        this.modelGroup = new THREE.Group();
        this.scene.add(this.modelGroup);

        // Nav mode
        this._navMode = 'orbit';

        // Modules
        this.sectioning = new RvmSectioning(this.modelGroup, this.scene, this.renderer);
        this.visibility = new RvmVisibilityController(this.modelGroup, this.ctx?.identityMap);
        this.selection = new RvmSelectionAdapter(this.modelGroup, this.camera, this.renderer.domElement, this.ctx?.identityMap);

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this.container.addEventListener('pointerdown', this._onPointerDown);
        this.container.addEventListener('pointermove', this._onPointerMove);
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('pointerup', this._onPointerUp);
        }


        // Resize Observer
        this._resizeObserver = new ResizeObserver((entries) => {
            if (this._disposed) return;
            for (const entry of entries) {
                if (entry.target === this.container) {
                    this._onResize();
                }
            }
        });
        this._resizeObserver.observe(this.container);

        // Animation Loop
        this._animate = this._animate.bind(this);
        this._animationFrameId = requestAnimationFrame(this._animate);

        // Save views config
        this._savedView = null;
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.measureModeEnabled = false;
        this.marqueeModeEnabled = false;
        this._marqueeStart = null;
        this.marqueeElement = null;
        this._measureStart = null;
        this._measureObjects = null;
        this._measurePointMesh = null;

        this.setThemePreset(this.ctx?.themePreset || 'NavisDark');
    }

    _resolveThemeStyle(themeKey) {
        const next = String(themeKey || 'NavisDark');
        return THEME_SCENE_STYLES[next] || THEME_SCENE_STYLES.NavisDark;
    }

    setThemePreset(themeKey) {
        const next = String(themeKey || 'NavisDark');
        this._themeKey = next;
        const themeStyle = this._resolveThemeStyle(next);
        const background = new THREE.Color(themeStyle.background || '#08111c');
        this.scene.background = background;
        this.renderer.setClearColor(background, 1);
    }

    // ── Model Loading ──────────────────────────────────────────────────

    // We assume the model loaded is a Three.js Group/Object3D.

    // We assume the model loaded is a Three.js Group/Object3D.
    // And coordinate system normalization based on upAxis.
    setModel(model, upAxis = 'Y') {
        this.modelGroup.clear();
        this._stpGroup = null; // reset so appendStpMembers re-creates it after clear
        this._upAxis = upAxis;
        this.modelGroup.add(model);

        if (upAxis === 'Z') {
            // Rotate model group by -90° on X at load time
            this.modelGroup.rotation.x = -Math.PI / 2;
            this.modelGroup.updateMatrixWorld(true);
        } else {
            this.modelGroup.rotation.set(0,0,0);
            this.modelGroup.updateMatrixWorld(true);
        }

        // Force visible materials — brighten any mesh that is near-black
        this.modelGroup.traverse(child => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                if (mat.color) {
                    const hsl = { h: 0, s: 0, l: 0 };
                    mat.color.getHSL(hsl);
                    // If luminance is very low, it's too dark to see against dark background
                    if (hsl.l < 0.15) {
                        mat.color.setHex(0x6eb5e0); // Steel blue
                    }
                }
                if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.3);
                if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.45);
                mat.needsUpdate = true;
            });
        });

        // Initialize modules
        this.sectioning.updateModelGroup(this.modelGroup);
        this.visibility.updateModelGroup(this.modelGroup);
        this.selection.updateModelGroup(this.modelGroup);


        this.fitAll();
        // Store model diagonal for STP sphere sizing (computed before any STP geometry is added).
        const _box = new THREE.Box3().setFromObject(this.modelGroup);
        this._modelDiag = _box.isEmpty() ? 5000 : Math.max(_box.getSize(new THREE.Vector3()).length(), 1);
        // Pre-compute bounding spheres once so the marquee loop can read cached values.
        this.modelGroup.traverse(obj => {
            if (obj.isMesh && obj.geometry) obj.geometry.computeBoundingSphere();
        });
    }

    _onResize() {
        if (!this.container || this._disposed) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;


        if (this._isOrthographic) {
            const aspect = width / height;
            const frustumSize = (this.orthoCamera.top - this.orthoCamera.bottom); // roughly maintain height
            this.orthoCamera.left = -frustumSize * aspect / 2;
            this.orthoCamera.right = frustumSize * aspect / 2;
            this.orthoCamera.top = frustumSize / 2;
            this.orthoCamera.bottom = -frustumSize / 2;
            this.orthoCamera.updateProjectionMatrix();
        } else {
            this.perspCamera.aspect = width / height;
            this.perspCamera.updateProjectionMatrix();
        }
        this.renderer.setSize(width, height);
        this.labelRenderer.setSize(width, height);
    }

    _animate() {
        if (this._disposed) return;
        this._animationFrameId = requestAnimationFrame(this._animate);


        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    // ── Command Interfaces (must satisfy dispatchViewerCommand) ────────

    fitAll() {
        if (this.modelGroup.children.length === 0) return;
        const box = new THREE.Box3().setFromObject(this.modelGroup);
        if (box.isEmpty()) return;
        this._fitBox(box);
    }


    fitSelection() {
        const selectionIds = this.selection.getSelectionRenderIds();
        if (selectionIds.length === 0) return this.fitAll();

        const box = new THREE.Box3();
        let hasObj = false;

        const selectionSet = new Set(selectionIds);

        this.modelGroup.traverse((obj) => {
            const name = obj.userData?.name || obj.name || obj.uuid;
            if (obj.isMesh && selectionSet.has(name)) {
                box.expandByObject(obj);
                hasObj = true;
            }
        });

        if (hasObj) {
            this._fitBox(box);
        }
    }

    _fitBox(box) {
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const modelBox = new THREE.Box3().setFromObject(this.modelGroup);
        const modelSize = modelBox.getSize(new THREE.Vector3());
        const modelDiagonal = Math.max(modelSize.length(), 1);
        const minFitSize = Math.max(1, modelDiagonal * 0.02);
        const maxSize = Math.max(size.x, size.y, size.z, minFitSize);
        let fitHeightDistance;
        if (this._isOrthographic) {
            fitHeightDistance = maxSize * 1.2;
        } else {
            fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this.camera.fov / 360));
        }
        const aspect = this._isOrthographic ? (this.orthoCamera.right - this.orthoCamera.left) / (this.orthoCamera.top - this.orthoCamera.bottom) : this.perspCamera.aspect;
        const fitWidthDistance = fitHeightDistance / aspect;
        const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

        const direction = this.controls.target.clone().sub(this.camera.position).normalize().multiplyScalar(-1);
        if(direction.lengthSq() < 0.0001) direction.set(0, 0, 1);

        this.controls.target.copy(center);
        this.camera.position.copy(center).add(direction.multiplyScalar(distance));

        if (this._isOrthographic) {
            this.orthoCamera.left = -distance * aspect / 2;
            this.orthoCamera.right = distance * aspect / 2;
            this.orthoCamera.top = distance / 2;
            this.orthoCamera.bottom = -distance / 2;
        }
        this.camera.near = Math.max(0.01, distance / 1000);
        this.camera.far = Math.max(1000, distance * 150, modelDiagonal * 8);
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }


    setSectionMode(mode) {
        if (mode === 'BOX' && this.selection.getSelectionRenderIds().length > 0) {
            const box = new THREE.Box3();
            let hasObj = false;
            const rIds = new Set(this.selection.getSelectionRenderIds());
            this.modelGroup.traverse(obj => {
                if (obj.isMesh && rIds.has(obj.name || obj.uuid)) {
                    box.expandByObject(obj);
                    hasObj = true;
                }
            });
            if (hasObj) {
                 this.sectioning.buildBoxSection(this.modelGroup, box);
                 this.sectioning._sectionMode = 'BOX';
                 return;
            }
        }
        this.sectioning.setSectionMode(mode, this._upAxis || 'Y');
    }


    disableSection() {
        this.sectioning.disableSection();
    }

    setSectionClipBounds(bounds) {
        if (this.sectioning) this.sectioning.setClipBounds(bounds);
    }

    getModelBounds() {
        if (this.modelGroup.children.length === 0) return null;
        return new THREE.Box3().setFromObject(this.modelGroup);
    }

    resetSectionToModel() {
        if (this.sectioning && this.sectioning._sectionMode === 'BOX') {
            this.sectioning.buildBoxSection(this.modelGroup);
        }
    }


    setNavMode(mode) {
        const normalized = String(mode || 'orbit').toLowerCase();
        this._navMode = normalized;

        // Reset modes
        this.controls.enabled = false;
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        this.measureModeEnabled = false;
        this.marqueeModeEnabled = false;
        this.container.style.cursor = 'default';
        this.clearMeasurement();

        if (normalized === 'orbit') {
            this.controls.enabled = true;
            this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        } else if (normalized === 'pan') {
            this.controls.enabled = true;
            this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
        } else if (normalized === 'select') {
            this.controls.enabled = true;
            this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        } else if (normalized === 'measure' || normalized === 'measure_tool') {
            this.controls.enabled = false;
            this.measureModeEnabled = true;
            this.container.style.cursor = 'crosshair';
        } else if (normalized === 'zoom' || normalized === 'view_marquee_zoom') {
            this.controls.enabled = false;
            this.marqueeModeEnabled = true;
            this.marqueeMode = 'zoom';
            this.container.style.cursor = 'zoom-in';
        } else if (normalized === 'marquee_select') {
            this.controls.enabled = false;
            this.marqueeModeEnabled = true;
            this.marqueeMode = 'select';
            this.container.style.cursor = 'crosshair';
        } else {
            this.controls.enabled = true;
            this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
            this._navMode = 'orbit';
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('app:tool-changed', { detail: { mode: this._navMode } }));
        }
    }

    _onPointerDown(event) {
        if (event.button !== 0) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.marqueeModeEnabled) {
            this._marqueeStart = { x: event.clientX, y: event.clientY, ndcx: this.mouse.x, ndcy: this.mouse.y };
            this._lastPointerDownCtrl = event.ctrlKey || event.metaKey;
            if (!this.marqueeElement) {
                this.marqueeElement = document.createElement('div');
                this.marqueeElement.style.position = 'absolute';
                this.marqueeElement.style.pointerEvents = 'none';
                this.marqueeElement.style.zIndex = '1000';
                this.container.appendChild(this.marqueeElement);
            }
            // Distinct visual for select vs zoom mode
            if (this.marqueeMode === 'select') {
                this.marqueeElement.style.border = '2px dashed #60a5fa';
                this.marqueeElement.style.backgroundColor = 'rgba(59,130,246,0.12)';
            } else {
                this.marqueeElement.style.border = '1px dashed #fff';
                this.marqueeElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            }
            this.marqueeElement.style.left = event.clientX - rect.left + 'px';
            this.marqueeElement.style.top = event.clientY - rect.top + 'px';
            this.marqueeElement.style.width = '0px';
            this.marqueeElement.style.height = '0px';
            this.marqueeElement.style.display = 'block';
            return;
        }

        if (this.measureModeEnabled) {
             this.raycaster.setFromCamera(this.mouse, this.camera);
             const intersects = this.raycaster.intersectObjects(this.scene.children, true);
             const valid = intersects.filter(i => i.object.isMesh && i.object.visible);
             if (valid.length > 0) {
                 const pt = valid[0].point;
                 if (!this._measureStart) {
                     this._measureStart = pt;
                     // Draw point
                     // Use a model-relative radius so the sphere stays visible across zoom levels.
                     const geo = new THREE.SphereGeometry(Math.max(1, (this._modelDiag || 5000) * 0.005));
                     const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                     this._measurePointMesh = new THREE.Mesh(geo, mat);
                     this._measurePointMesh.position.copy(pt);
                     this.scene.add(this._measurePointMesh);
                 } else {
                     // Draw line
                     const geo = new THREE.BufferGeometry().setFromPoints([this._measureStart, pt]);
                     const mat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2, depthTest: false });
                     const line = new THREE.Line(geo, mat);
                     this.scene.add(line);

                     const dist = this._measureStart.distanceTo(pt);
                     const mid = this._measureStart.clone().lerp(pt, 0.5);

                     const div = document.createElement('div');
                     div.className = 'rvm-tag-label';
                     div.textContent = dist.toFixed(2) + 'mm';
                     div.style.background = '#aa0000';
                     div.style.color = 'white';
                     div.style.padding = '2px 4px';
                     div.style.borderRadius = '4px';

                     // CSS2DObject is always imported at the top of this file; no runtime fallback needed.
                     const label = new CSS2DObject(div);
                     label.position.copy(mid);
                     this.scene.add(label);

                     this._measureObjects = [this._measurePointMesh, line, label];
                     this._measureStart = null;
                 }
             }
             return;
        }

        // ... selection is handled by selection adapter if not in tools
    }

    _onPointerMove(event) {
        if (this.marqueeModeEnabled && this._marqueeStart) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const currentX = event.clientX - rect.left;
            const currentY = event.clientY - rect.top;
            const startX = this._marqueeStart.x - rect.left;
            const startY = this._marqueeStart.y - rect.top;

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            this.marqueeElement.style.left = left + 'px';
            this.marqueeElement.style.top = top + 'px';
            this.marqueeElement.style.width = width + 'px';
            this.marqueeElement.style.height = height + 'px';
        }
    }

    _onPointerUp(event) {
        if (this.marqueeModeEnabled && this._marqueeStart) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            if (this.marqueeElement) this.marqueeElement.style.display = 'none';

            const minX = Math.min(this._marqueeStart.ndcx, this.mouse.x);
            const maxX = Math.max(this._marqueeStart.ndcx, this.mouse.x);
            const minY = Math.min(this._marqueeStart.ndcy, this.mouse.y);
            const maxY = Math.max(this._marqueeStart.ndcy, this.mouse.y);

            this._marqueeStart = null;

            if (Math.abs(maxX - minX) < 0.01 || Math.abs(maxY - minY) < 0.01) return;

            // Collect all objects in frustum defined by marquee
            const frustum = new THREE.Frustum();
            const projScreenMatrix = new THREE.Matrix4();
            projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projScreenMatrix);

            // Actually, zooming to objects in frustum is hard because we need to build a custom frustum.
            // Simpler: find all objects whose center projects into the 2D bounding box
            const box = new THREE.Box3();
            let hasObj = false;

            this.modelGroup.traverse(obj => {
                if (obj.isMesh && obj.visible) {
                    // Bounding spheres are pre-computed at model load time; no recompute needed.
                    if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
                    const center = obj.geometry.boundingSphere.center.clone();
                    center.applyMatrix4(obj.matrixWorld);
                    center.project(this.camera);

                    if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) {
                        box.expandByObject(obj);
                        hasObj = true;
                    }
                }
            });

            if (hasObj) {
                if (this.marqueeMode === 'select') {
                    // Collect all visible mesh render IDs within the marquee
                    const selectedRenderIds = [];
                    this.modelGroup.traverse(obj => {
                        if (obj.isMesh && obj.visible) {
                            if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
                            const center = obj.geometry.boundingSphere.center.clone();
                            center.applyMatrix4(obj.matrixWorld);
                            center.project(this.camera);
                            if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) {
                                const renderId = obj.userData?.name || obj.name || obj.uuid;
                                if (renderId) selectedRenderIds.push(renderId);
                            }
                        }
                    });

                    if (selectedRenderIds.length > 0) {
                        // Resolve to canonical IDs
                        const canonicalIds = [...new Set(selectedRenderIds.map(rid => {
                            if (this.ctx?.identityMap?.canonicalFromRender) {
                                return this.ctx.identityMap.canonicalFromRender(rid) || rid;
                            }
                            return this.selection?.identityMap?.canonicalFromRender?.(rid) || rid;
                        }))].filter(Boolean);

                        const isAdditive = this._lastPointerDownCtrl || false;
                        this.selection.selectCanonicalIds(canonicalIds, { additive: isAdditive });
                    }

                    this.setNavMode('select');
                } else {
                    this._fitBox(box);
                    // Switch back to orbit
                    this.setNavMode('orbit');
                }
            } else {
                if (this.marqueeMode !== 'select') {
                    // fallback if nothing strictly inside: zoom camera forward
                    const dir = new THREE.Vector3(0,0,-1).transformDirection(this.camera.matrixWorld);
                    const dist = this.controls.target.distanceTo(this.camera.position);
                    this.camera.position.add(dir.multiplyScalar(dist * 0.5));
                    this.controls.update();
                }

                // Switch back to orbit/select
                this.setNavMode(this.marqueeMode === 'select' ? 'select' : 'orbit');
            }
        }
    }

    clearMeasurement() {
        if (this._measureObjects) {
            this._measureObjects.forEach(obj => {
                this.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            this._measureObjects = null;
        }
        if (this._measurePointMesh) {
            this.scene.remove(this._measurePointMesh);
            this._measurePointMesh.geometry.dispose();
            this._measurePointMesh.material.dispose();
            this._measurePointMesh = null;
        }
        this._measureStart = null;
    }


    toggleProjection() {
        this._isOrthographic = !this._isOrthographic;

        const oldCamera = this.camera;
        this.camera = this._isOrthographic ? this.orthoCamera : this.perspCamera;

        this.camera.position.copy(oldCamera.position);
        this.camera.quaternion.copy(oldCamera.quaternion);

        if (this._isOrthographic) {
            // Estimate frustum size based on distance to target to keep apparent size roughly similar
            const distance = this.controls.target.distanceTo(this.perspCamera.position);
            const fov = this.perspCamera.fov * Math.PI / 180;
            const frustumHeight = 2 * distance * Math.tan(fov / 2);
            const aspect = this.container.clientWidth / this.container.clientHeight;

            this.orthoCamera.left = -frustumHeight * aspect / 2;
            this.orthoCamera.right = frustumHeight * aspect / 2;
            this.orthoCamera.top = frustumHeight / 2;
            this.orthoCamera.bottom = -frustumHeight / 2;
        }

        this.camera.updateProjectionMatrix();

        this.controls.object = this.camera;
        this.controls.update();
        this.selection.camera = this.camera;
    }

    snapToPreset(preset) {
        const box = new THREE.Box3().setFromObject(this.modelGroup);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y, size.z) * 1.5;

        this.controls.target.copy(center);


        switch(preset) {
            case 'TOP': this.camera.position.set(center.x, center.y + dist, center.z); break;
            case 'BOTTOM': this.camera.position.set(center.x, center.y - dist, center.z); break;
            case 'FRONT': this.camera.position.set(center.x, center.y, center.z + dist); break;
            case 'BACK': this.camera.position.set(center.x, center.y, center.z - dist); break;
            case 'LEFT': this.camera.position.set(center.x - dist, center.y, center.z); break;
            case 'RIGHT': this.camera.position.set(center.x + dist, center.y, center.z); break;
            case 'ISO_NW': this.camera.position.set(center.x - dist, center.y + dist, center.z - dist); break;
            case 'ISO_NE': this.camera.position.set(center.x + dist, center.y + dist, center.z - dist); break;
            case 'ISO_SW': this.camera.position.set(center.x - dist, center.y + dist, center.z + dist); break;
            case 'ISO_SE': this.camera.position.set(center.x + dist, center.y + dist, center.z + dist); break;
        }


        this.camera.lookAt(center);
        this.controls.update();
    }

    clearSelection() {
        this.selection.clearSelection();
    }

    getNavMode() {
        return this._navMode;
    }

    onResize() {
        this._onResize();
    }

    // ── Recommended Additions ──────────────────────────────────────────

    isolateSelection() {
        const selectedRenderIds = this.selection.getSelectionRenderIds();
        if (selectedRenderIds.length === 0) return;
        this.visibility.isolateByRenderIds(selectedRenderIds);
    }

    showAll() {
        this.visibility.showAll();
    }

    selectByCanonicalId(id) {
        this.selection.selectByCanonicalId(id);
    }

    selectCanonicalIds(ids, options) {
        this.selection.selectCanonicalIds(ids, options);
    }

    toggleCanonicalId(id) {
        this.selection.toggleCanonicalId(id);
    }

    getSelection() {
        return {
            canonicalObjectId: this.selection.getSelectedCanonicalId(),
            renderObjectIds: this.selection.getSelectionRenderIds()
        };
    }

    getSelectionAnchor() {
        const selectionIds = this.selection.getSelectionRenderIds();
        if (!selectionIds || selectionIds.length === 0) return null;
        const targetSet = new Set(selectionIds);
        const box = new THREE.Box3();
        let found = false;
        this.modelGroup.traverse((obj) => {
            if (!obj.isMesh) return;
            const renderId = obj.userData?.name || obj.name || obj.uuid;
            if (!targetSet.has(renderId)) return;
            box.expandByObject(obj);
            found = true;
        });
        if (!found || box.isEmpty()) return null;
        return box.getCenter(new THREE.Vector3());
    }

    setSavedView(view) {
        this._savedView = view;
        // Apply camera
        if (view.camera && view.camera.position) {
            this.camera.position.copy(view.camera.position);
            this.controls.target.copy(view.camera.target);
            this.controls.update();
        }
        // Apply section state
        if (view.sectionState && view.sectionState.mode) {
            this.setSectionMode(view.sectionState.mode);
        } else {
            this.disableSection();
        }
        // Apply hidden/isolated
        if (view.isolatedCanonicalObjectIds && view.isolatedCanonicalObjectIds.length > 0) {
            this.visibility.isolate(view.isolatedCanonicalObjectIds);
        } else if (view.hiddenCanonicalObjectIds && view.hiddenCanonicalObjectIds.length > 0) {
             this.visibility.hide(view.hiddenCanonicalObjectIds);
        } else {
            this.visibility.showAll();
        }
        // Apply selection
        if (view.selectedCanonicalObjectId) {
            this.selectByCanonicalId(view.selectedCanonicalObjectId);
        } else {
            this.clearSelection();
        }
    }

    getSavedView() {
        return {
            camera: {
                position: this.camera.position.clone(),
                target: this.controls.target.clone()
            },
            navMode: this._navMode,
            sectionState: this.sectioning.getSectionState(),
            hiddenCanonicalObjectIds: this.visibility.getHiddenCanonicalIds(),
            isolatedCanonicalObjectIds: this.visibility.getIsolatedCanonicalIds(),
            selectedCanonicalObjectId: this.selection.getSelectedCanonicalId()
        };
    }

    getCameraState() {
        return {
            position: this.camera.position.clone(),
            target: this.controls.target.clone()
        };
    }

    setCameraState(state) {
        if (!state) return;
        if (state.position) this.camera.position.copy(state.position);
        if (state.target) this.controls.target.copy(state.target);
        this.controls.update();
    }

    addTag(tag) {
        if (!tag || !tag.worldPosition) return;
        this.removeTag(tag.id);
        const div = document.createElement('div');
        div.className = 'rvm-tag-label';
        div.textContent = tag.text || tag.id;
        div.dataset.tagId = tag.id;
        const sev = String(tag.severity || 'info').toLowerCase();
        div.classList.add(`severity-${sev}`);

        // Use global CSS2DObject constructor if available, else omit (e.g. headless tests)
        if (typeof CSS2DObject !== 'undefined') {
            const label = new CSS2DObject(div);
            label.position.set(tag.worldPosition.x, tag.worldPosition.y, tag.worldPosition.z);
            label.name = `TAG_${tag.id}`;
            this.scene.add(label);
        } else if (window.THREE && window.THREE.CSS2DObject) {
            const label = new window.THREE.CSS2DObject(div);
            label.position.set(tag.worldPosition.x, tag.worldPosition.y, tag.worldPosition.z);
            label.name = `TAG_${tag.id}`;
            this.scene.add(label);
        } else {
            // Stub for node environments
            const label = new THREE.Object3D();
            label.position.set(tag.worldPosition.x, tag.worldPosition.y, tag.worldPosition.z);
            label.name = `TAG_${tag.id}`;
            label.isCSS2DObject = true;
            this.scene.add(label);
        }
    }

    removeTag(tagId) {
        const targets = [];
        this.scene.traverse((obj) => {
            if (obj.name === `TAG_${tagId}`) targets.push(obj);
        });
        targets.forEach((obj) => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }

    jumpToTag(tagId) {
        if (!this.tagStore) return;
        const tag = this.tagStore.getTag(tagId);
        if (tag && tag.cameraState) {
            this.setCameraState(tag.cameraState);
        }
        if (tag && tag.canonicalObjectId) {
            this.selectByCanonicalId(tag.canonicalObjectId);
            this.fitSelection();
        }
    }

    dispose() {

        this.container.removeEventListener('pointerdown', this._onPointerDown);
        this.container.removeEventListener('pointermove', this._onPointerMove);
        if (typeof window !== 'undefined' && window.removeEventListener) { window.removeEventListener('pointerup', this._onPointerUp); }
        if (this.marqueeElement && this.marqueeElement.parentNode) {
            this.marqueeElement.parentNode.removeChild(this.marqueeElement);
        }
        this.clearMeasurement();
        this._disposed = true;

        cancelAnimationFrame(this._animationFrameId);


        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        // Dispose Three.js objects
        this.scene.traverse((object) => {
            if (object.isMesh) {
                object.geometry.dispose();
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach(m => {
                        for (const key in m) {
                            if (m[key] && m[key].isTexture) {
                                m[key].dispose();
                            }
                        }
                        m.dispose();
                    });
                }
            }
        });

        this.controls.dispose();
        this.renderer.dispose();


        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        if (this.labelRenderer.domElement.parentNode) {
            this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
        }

        this.sectioning.dispose();
        this.visibility.dispose();
        this.selection.dispose();


        // Nullify internal refs
        this.scene = null;
        this.camera = null;
        this.perspCamera = null;
        this.orthoCamera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.controls = null;
        this.modelGroup = null;
        this.container = null;

        // Disposal contract explicitly requested these nullifications
        this.searchIndex = null;
        this.tagStore = null;
        this.workerBridges = null;
        this.pendingLoadTasks = null;
    }

    // ── STP Support Member Overlay ─────────────────────────────────────

    appendStpMembers(members) {
        if (!this.modelGroup) return;
        if (!this._stpGroup) {
            this._stpGroup = new THREE.Group();
            this._stpGroup.name = 'stpOverlay';
        }
        if (!this._stpGroup.parent) {
            this.modelGroup.add(this._stpGroup);
        }

        // STP parser outputs coords as (x=E, y=N, z=U) — PDMS Z-up convention.
        // When upAxis='Z', modelGroup is rotated -90° on X, so local (E,N,U) → world Y-up correctly.
        // When upAxis='Y', modelGroup has no rotation, so we must remap to (E,U,-N) in local space.
        const needsRemap = (this._upAxis || 'Z') === 'Y';
        const remap = (pt) => needsRemap ? { x: pt.x, y: pt.z, z: -pt.y } : { x: pt.x, y: pt.y, z: pt.z };

        const positions = [];
        for (const member of members) {
            const s = remap(member.start);
            const e = remap(member.end);
            positions.push(s.x, s.y, s.z, e.x, e.y, e.z);
        }
        if (!positions.length) return;

        const lineGeom = new THREE.BufferGeometry();
        lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0x60c864, depthTest: false });
        this._stpGroup.add(new THREE.LineSegments(lineGeom, lineMat));

        // Use stored model diagonal (computed before STP added) to avoid inflated box.
        const diag = this._modelDiag || 5000;
        const radius = Math.max(diag * 0.002, 20);
        const sphereGeom = new THREE.SphereGeometry(radius, 8, 6);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x60c864, depthTest: false });
        for (const member of members) {
            const s = remap(member.start);
            const e = remap(member.end);
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.set((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2);
            sphere.userData = {
                isStp: true,
                displayName: member.label || 'STP Member',
                supportTag: member.label || '',
                supportKind: member.kind || '',
                attrs: {
                    LABEL: member.label || '',
                    KIND: member.kind || '',
                    START: `E ${member.start.x.toFixed(1)} N ${member.start.y.toFixed(1)} U ${member.start.z.toFixed(1)}`,
                    END: `E ${member.end.x.toFixed(1)} N ${member.end.y.toFixed(1)} U ${member.end.z.toFixed(1)}`,
                    ...(member.attributes || {}),
                },
            };
            this._stpGroup.add(sphere);
        }
    }

    clearStpMembers() {
        if (!this._stpGroup) return;
        const sharedGeoms = new Set();
        const sharedMats = new Set();
        for (const child of [...this._stpGroup.children]) {
            this._stpGroup.remove(child);
            if (child.geometry) sharedGeoms.add(child.geometry);
            if (child.material) sharedMats.add(child.material);
        }
        for (const g of sharedGeoms) { try { g.dispose(); } catch {} }
        for (const m of sharedMats) { try { m.dispose(); } catch {} }
    }
}
