import * as THREE from 'three';

export class RvmSectioning {
    constructor(modelGroup, scene, renderer) {
        this.modelGroup = modelGroup;
        this.scene = scene;
        this.renderer = renderer;

        this._sectionMode = 'OFF';
        this._clipPlanes = [];
        this._sectionBounds = null;
        this._padding = 0;
        this._offset = 0;

        // Visual helpers (lines/planes) can be added here
        this._helpersGroup = new THREE.Group();
        this.scene.add(this._helpersGroup);
    }

    updateModelGroup(modelGroup) {
        this.modelGroup = modelGroup;
        if (this._sectionMode !== 'OFF') {
            this.setSectionMode(this._sectionMode);
        }
    }

    setSectionMode(mode, upAxis = 'Y') {
        const normalized = mode?.toUpperCase() || 'OFF';
        this._sectionMode = normalized;
        this._upAxis = upAxis;

        if (normalized === 'BOX') {
            this.buildBoxSection(this.modelGroup);
        } else if (normalized === 'PLANE_UP') {
            this.buildPlaneUpSection(this.modelGroup, this._upAxis);
        } else {
            this.disableSection();
        }
    }

    disableSection() {
        this._sectionMode = 'OFF';
        this._clipPlanes = [];
        this._helpersGroup.clear();
        this._applyCurrentSectionClipping();
    }

    getSectionState() {
        return { mode: this._sectionMode, padding: this._padding, offset: this._offset };
    }


    buildBoxSection(modelGroup, selectionBounds) {
        if (!modelGroup && !selectionBounds) return null;
        const box = selectionBounds ? selectionBounds.clone() : new THREE.Box3().setFromObject(modelGroup);
        if (box.isEmpty()) return null;
        return this.applyBoxSection(box, this._padding);
    }

    applyBoxSection(selectionBounds, padding = this._padding) {
        if (!selectionBounds) return null;
        const box = selectionBounds.clone();
        if (box.isEmpty()) return null;

        const safePadding = Number.isFinite(Number(padding)) ? Math.max(0, Number(padding)) : 0;
        box.expandByScalar(safePadding);

        this._sectionMode = 'BOX';
        this._sectionBounds = box.clone();

        this._applyBoxPlanes(box);
        this._renderSectionBoxVisual(box);
        return box.clone();
    }

    setClipBounds({ minX, maxX, minY, maxY, minZ, maxZ }) {
        if (this._sectionMode !== 'BOX') return;
        const box = new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ)
        );
        this.applyBoxSection(box, 0);
    }


    buildPlaneUpSection(modelGroup, upAxis = 'Y') {
        if (!modelGroup) return;
        const box = new THREE.Box3().setFromObject(modelGroup);
        if (box.isEmpty()) return;
        this._sectionBounds = box.clone();

        const centre = box.getCenter(new THREE.Vector3());
        // Use the correct axis component based on the model's up axis.
        const isZUp = String(upAxis).toUpperCase() === 'Z';
        const cut = (isZUp ? centre.z : centre.y) + this._offset;
        const normal = isZUp ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);
        this._clipPlanes = [new THREE.Plane(normal, cut)];

        this._applyCurrentSectionClipping();
        this._renderSectionPlaneVisual(normal, cut, box);
    }

    setSectionBoxPadding(n) {
        this._padding = Math.max(0, Number(n) || 0);
        if (this._sectionMode === 'BOX') {
            this.buildBoxSection(this.modelGroup);
        }
    }

    setSectionPlaneOffset(n) {
        this._offset = n;
        if (this._sectionMode === 'PLANE_UP') {
            this.buildPlaneUpSection(this.modelGroup, this._upAxis || 'Y');
        }
    }

    _applyBoxPlanes(box) {
        const min = box.min;
        const max = box.max;
        this._clipPlanes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x),
            new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y),
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z),
            new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z),
        ];
        this._applyCurrentSectionClipping();
    }

    _applyCurrentSectionClipping() {
        if (!this.modelGroup || !this.renderer) return;
        const enabled = this._sectionMode !== 'OFF' && this._clipPlanes.length > 0;


        // Ensure local clipping is true
        this.renderer.localClippingEnabled = true;

        this.modelGroup.traverse((obj) => {
            if (!obj?.material) return;
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of materials) {
                m.clippingPlanes = enabled ? this._clipPlanes : [];
                m.clipIntersection = false;
                m.needsUpdate = true;
            }
        });
    }

    _renderSectionBoxVisual(box) {
        this._helpersGroup.clear();
        const helper = new THREE.Box3Helper(box, 0xffff00);
        this._helpersGroup.add(helper);
    }

    _renderSectionPlaneVisual(normal, constant, box) {
        this._helpersGroup.clear();
        const plane = new THREE.Plane(normal, constant);
        const size = box.getSize(new THREE.Vector3()).length();
        const helper = new THREE.PlaneHelper(plane, size, 0xffff00);
        this._helpersGroup.add(helper);
    }

    dispose() {
        this.disableSection();
    }
}
