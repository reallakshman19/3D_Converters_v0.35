/**
 * viewer-3d.js Ã¢â‚¬â€ Three.js 3D visualization of PCF components (vanilla JS)
 * Ported from 3Dmodelgeneratorforpcf_Viewer.jsx (React/R3F) to raw Three.js.
 *
 * Exports:
 *   PcfViewer3D class
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from './core/state.js';
import { THEME_PALETTES, THEME_SCENE_STYLES } from './viewer-3d-defaults.js?v=20260518-statusbar-theme-12';
import { debugSupport } from './debug/support-debug.js';

// Module-level axis; set from each instance at the start of render() to handle multi-instance use.
let CURRENT_VERTICAL_AXIS = 'Z';

function _verticalVector() {
    // mapCoord() always maps the PCF elevation axis (Z or Y depending on CURRENT_VERTICAL_AXIS)
    // into Three.js Y.  The camera "up" vector must therefore always be Three.js Y (0,1,0).
    // Returning (0,0,1) for Z-up was wrong: it conflicted with mapCoord and inverted the view.
    return new THREE.Vector3(0, 1, 0);
}

function _verticalComponent(parts) {
    return CURRENT_VERTICAL_AXIS === 'Z' ? parts[2] : parts[1];
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Color palette Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const COLORS = {
    PIPE: 0x1e90ff,  // Dodger Blue
    FLANGE: 0xff4500,  // Orange Red
    VALVE: 0x32cd32,  // Lime Green
    TEE: 0xffd700,  // Gold
    OLET: 0x55aa55,  // Green
    ELBOW: 0x8a2be2,  // Blue Violet
    SUPPORT: 0x60c864,  // Unified support green
    ANCI: 0x60c864,  // Unified support green
    BEND: 0x8a2be2,
    REDUCER: 0xff69b4,  // Hot Pink
    UNKNOWN: 0xd3d3d3,  // Light Grey
};

// Ã¢â€â‚¬Ã¢â€â‚¬ Coordinate mapping (PCF Ã¢â€ â€™ Three.js) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// PCF: X=East, Y=North, Z=Up
// Three: X=right, Y=up, Z=towards viewer
const mapCoord = (p) => {
    if (!p) return null;
    if (CURRENT_VERTICAL_AXIS === 'Y') {
        // Source Y is vertical => map Y into world-Y.
        return new THREE.Vector3(-p.z, p.y, -p.x);
    }
    return new THREE.Vector3(-p.y, p.z, -p.x);
};

const OVERLAY_LAYER_IDS = Object.freeze({
    LEGEND: 'legend',
    MESSAGE_CIRCLE: 'message-circle',
    MESSAGE_SQUARE: 'message-square',
    LENGTH: 'length',
    MEASURE: 'measure',
    SPARE_1: 'spare1',
    SPARE_2: 'spare2',
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Cylinder helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function createCylinder(startVec, endVec, radius, color, materialOverride = null) {
    const diff = new THREE.Vector3().subVectors(endVec, startVec);
    const length = diff.length();
    if (length < 0.1) return null;

    const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    const axis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(axis, diff.clone().normalize());

    const geo = new THREE.CylinderGeometry(radius, radius, length, 16);
    const mat = materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.quaternion.copy(quat);
    return mesh;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Disc (flat cylinder) helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function createDisc(pos, normal, outerRadius, thickness, color, materialOverride = null) {
    const geo = new THREE.CylinderGeometry(outerRadius, outerRadius, thickness, 20);
    const mat = materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    // Align cylinder Y-axis to normal
    const axis = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(axis, normal.clone().normalize());
    return mesh;
}

function createSphere(pos, radius, color, materialOverride = null) {
    const geo = new THREE.SphereGeometry(radius, 16, 16);
    const mat = materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    return mesh;
}

function createTubeFromCurve(curve, radius, color, tubularSegments = 24, radialSegments = 14, materialOverride = null) {
    const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    const mat = materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15 });
    return new THREE.Mesh(geo, mat);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Box (for fixed support) helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function createBox(pos, hw, color, wireframe = false, materialOverride = null) {
    const geo = new THREE.BoxGeometry(hw, hw, hw);
    const mat = materialOverride || (wireframe
        ? new THREE.MeshBasicMaterial({ color, wireframe: true })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    return mesh;
}

function makeArrow(direction, offset, od, color, materialOverride = null) {
    const arrowLen = 1.5 * od;
    const shaftR = 0.075 * od;
    const headLen = 0.4 * od;
    const headR = 0.175 * od;
    const shaftLen = arrowLen - headLen;

    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 8),
        materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 })
    );
    const head = new THREE.Mesh(
        new THREE.ConeGeometry(headR, headLen, 8),
        materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 })
    );

    const arrowGroup = new THREE.Group();
    arrowGroup.add(shaft);
    arrowGroup.add(head);

    shaft.position.copy(direction).multiplyScalar(offset + shaftLen / 2);
    head.position.copy(direction).multiplyScalar(offset + shaftLen + headLen / 2);

    const up = new THREE.Vector3(0, 1, 0);
    if (up.distanceTo(direction) < 0.001) {
        // already aligned
    } else if (up.distanceTo(direction.clone().negate()) < 0.001) {
        shaft.rotateX(Math.PI);
        head.rotateX(Math.PI);
    } else {
        const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
        shaft.quaternion.copy(quat);
        head.quaternion.copy(quat);
    }

    return arrowGroup;
}

function _supportKindFromText(text = '') {
    const t = String(text).toUpperCase();
    if (/\bCA100\b/.test(t)) return 'GUIDE';
    if (/\bCA150\b|\bCA250\b/.test(t)) return 'REST';
    // Check GUIDE keywords before the FIXED/ANCHOR pattern so "FIXED GUIDE" resolves to GUIDE.
    if (/\bGDE\b|\bGUI\b|\bGD\b|GUIDE|SLIDE|SLID/.test(t)) return 'GUIDE';
    if (/(^|[^A-Z0-9])(RIGID\s+)?ANC(HOR)?([^A-Z0-9]|$)|\bFIX(ED)?\b/.test(t)) return 'ANCHOR';
    if (/\bRST\b|\bREST\b|\+Y\s*SUPPORT|\bY\s*SUPPORT\b|\+Y\b/.test(t)) return 'REST';
    if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bLIMIT\b/.test(t)) return 'STOP';
    if (/\bSTOP\b/.test(t)) return 'STOP';
    if (/\bSPRING\b|\bHANGER\b/.test(t)) return 'SPRING';
    return 'UNKNOWN';
}

function _supportKindFromToken(token = '') {
    const t = String(token).toUpperCase().trim();
    if (!t) return null;
    if (t === 'ANC' || t === 'ANCHOR' || t === 'RIGID') return 'ANCHOR';
    if (t === 'GDE' || t === 'GUI' || t === 'GUIDE') return 'GUIDE';
    if (t === 'RST' || t === 'REST') return 'REST';
    if (t === 'SPRING') return 'SPRING';
    if (t === 'STOP' || t === 'STP' || t === 'LINESTOP' || t === 'LINE STOP' || t === 'LIMIT') return 'STOP';
    return null;
}

function _supportTextFromAttributes(attrs) {
    const src = attrs && typeof attrs === 'object' ? attrs : {};
    return [
        src.SUPPORT_KIND,
        src['SUPPORT-KIND'],
        src.SUPPORT_TYPE,
        src['SUPPORT-TYPE'],
        src.SUPPORT_TAG,
        src['SUPPORT-TAG'],
        src.SUPPORT_DIRECTION,
        src['SUPPORT-DIRECTION'],
        src.SKEY,
        src.SUPPORT_NAME,
        src['SUPPORT-NAME'],
        src['<SUPPORT_NAME>'],
        src['COMPONENT-IDENTIFIER'],
        src['COMPONENT-ATTRIBUTE1'],
        src['COMPONENT-ATTRIBUTE2'],
    ].map(value => String(value || '').toUpperCase()).join(' ');
}

function _supportDirectionFromText(text = '') {
    const t = String(text || '').toUpperCase();
    if (/\bNORTHEAST\b|\bNORTH-EAST\b|\bNE\b/.test(t)) return 'NORTHEAST';
    if (/\bNORTHWEST\b|\bNORTH-WEST\b|\bNW\b/.test(t)) return 'NORTHWEST';
    if (/\bSOUTHEAST\b|\bSOUTH-EAST\b|\bSE\b/.test(t)) return 'SOUTHEAST';
    if (/\bSOUTHWEST\b|\bSOUTH-WEST\b|\bSW\b/.test(t)) return 'SOUTHWEST';
    if (/\bUP\b/.test(t)) return 'UP';
    if (/\bDOWN\b/.test(t)) return 'DOWN';
    if (/\bNORTH\b/.test(t)) return 'NORTH';
    if (/\bSOUTH\b/.test(t)) return 'SOUTH';
    if (/\bEAST\b/.test(t)) return 'EAST';
    if (/\bWEST\b/.test(t)) return 'WEST';
    return '';
}

function _axisFromSupportDirection(direction) {
    const d = String(direction || '').toUpperCase();
    if (d === 'UP') return new THREE.Vector3(0, 1, 0);
    if (d === 'DOWN') return new THREE.Vector3(0, -1, 0);
    if (d === 'NORTH') return new THREE.Vector3(0, 0, -1);
    if (d === 'SOUTH') return new THREE.Vector3(0, 0, 1);
    if (d === 'EAST') return new THREE.Vector3(1, 0, 0);
    if (d === 'WEST') return new THREE.Vector3(-1, 0, 0);
    if (d === 'NORTHEAST') return new THREE.Vector3(1, 0, -1).normalize();
    if (d === 'NORTHWEST') return new THREE.Vector3(-1, 0, -1).normalize();
    if (d === 'SOUTHEAST') return new THREE.Vector3(1, 0, 1).normalize();
    if (d === 'SOUTHWEST') return new THREE.Vector3(-1, 0, 1).normalize();
    return null;
}

function _axisFromCosinesText(text = '') {
    const parts = String(text)
        .split(/[,\s]+/)
        .map(v => Number(v))
        .filter(v => Number.isFinite(v));
    if (parts.length < 3) return null;
    const axis = CURRENT_VERTICAL_AXIS === 'Y'
        ? new THREE.Vector3(-parts[2], parts[1], -parts[0])
        : new THREE.Vector3(-parts[1], parts[2], -parts[0]);
    if (axis.length() < 0.01) return null;
    return axis.normalize();
}

function _dofsFromText(text = '') {
    return String(text)
        .split(/[,\s]+/)
        .map(v => Number(v))
        .filter(v => Number.isFinite(v))
        .map(v => Math.trunc(v));
}

function _semanticSupportKindFromAxisCosinesText(text = '') {
    const parts = String(text)
        .split(/[,\s]+/)
        .map(v => Number(v))
        .filter(v => Number.isFinite(v));
    if (parts.length < 3) return null;
    const x = parts[0];
    const y = parts[1];
    const z = parts[2];
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) return null;
    const vComp = CURRENT_VERTICAL_AXIS === 'Z' ? z : y;
    const lateralMax = CURRENT_VERTICAL_AXIS === 'Z' ? Math.max(Math.abs(x), Math.abs(y)) : Math.max(Math.abs(x), Math.abs(z));
    const verticalness = Math.abs(vComp) / len;
    if (verticalness > 0.75) return 'REST';
    if (lateralMax / len > 0.75) return 'GUIDE';
    return null;
}

function _supportMaterial(color) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
        roughness: 0.32,
        metalness: 0.08
    });
}

function createSupportAssembly(pos, parts) {
    const group = new THREE.Group();
    group.position.copy(pos);
    for (const part of parts) {
        if (part) group.add(part);
    }
    return group;
}

function createArrowBetween(start, end, color, materialOverride = null, scale = 1) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.01) return null;

    const material = materialOverride || new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 });
    const headLen = Math.min(scale * 0.45, len * 0.45);
    const shaftRadius = Math.max(scale * 0.075, 0.2);
    const headRadius = Math.max(scale * 0.175, shaftRadius * 1.8);
    const dirNorm = dir.clone().normalize();
    const shaftEnd = end.clone().addScaledVector(dirNorm, -headLen);

    const group = new THREE.Group();
    const shaft = createCylinder(start, shaftEnd, shaftRadius, color, material);
    if (shaft) group.add(shaft);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLen, 10), material);
    cone.position.copy(end).addScaledVector(dirNorm, -headLen / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirNorm);
    group.add(cone);
    return group;
}

function _buildSupportFrame(pipeAxis, supportAxis) {
    const vertical = _verticalVector();

    let pipe = pipeAxis && pipeAxis.length() >= 0.01 ? pipeAxis.clone().normalize() : null;
    if (!pipe) {
        pipe = supportAxis && Math.abs(supportAxis.dot(vertical)) < 0.95
            ? supportAxis.clone().normalize()
            : new THREE.Vector3(1, 0, 0);
    }

    let lateral = null;
    if (supportAxis && Math.abs(supportAxis.dot(vertical)) < 0.95) {
        lateral = supportAxis.clone().normalize();

        // Ã¢â€â‚¬Ã¢â€â‚¬ VISUAL GEOMETRY FIX Ã¢â€â‚¬Ã¢â€â‚¬
        // If the restriction axis is parallel to the pipe (e.g., an axial stop),
        // projecting the lateral geometry along this axis embeds arrows radially
        // inside the pipe cylinder mesh. We force it orthogonal to expose the arrows.
        if (Math.abs(lateral.dot(pipe)) > 0.95) {
            lateral = new THREE.Vector3().crossVectors(vertical, pipe);
            if (lateral.length() < 0.01) {
                const fallback = Math.abs(pipe.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
                lateral.crossVectors(vertical, fallback);
            }
            lateral.normalize();
        }
    } else {
        lateral = new THREE.Vector3().crossVectors(vertical, pipe);
        if (lateral.length() < 0.01) {
            const fallback = Math.abs(pipe.x) < 0.8
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0, 0, 1);
            lateral = new THREE.Vector3().crossVectors(vertical, fallback);
        }
        if (lateral.length() < 0.01) lateral = new THREE.Vector3(0, 0, 1);
        lateral.normalize();
    }

    const pipeOrtho = new THREE.Vector3().crossVectors(lateral, vertical).normalize();
    return { vertical, lateral, pipe: pipeOrtho };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Main class Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export class PcfViewer3D {
    /**
     * @param {HTMLElement} containerEl Ã¢â‚¬â€ DOM element to render into
     */
    constructor(containerEl, options = {}) {
        this.container = containerEl;
        this.options = options || {};
        this.viewerConfig = this.options.viewerConfig || {};
        this._onSelectionChange = typeof this.options.onSelectionChange === 'function' ? this.options.onSelectionChange : null;
        this._onMeasurementChange = typeof this.options.onMeasurementChange === 'function' ? this.options.onMeasurementChange : null;
        this._onTrace = typeof this.options.onTrace === 'function' ? this.options.onTrace : null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this._animId = null;
        this._componentGroup = null;
        this._legendLabelGroup = null;
        this._heatmapPanelEl = null;
        this.editor = null;
        this._gridHelper = null;
        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._componentMeshIndex = new Map();
        this._selectedComponentId = null;
        this._selectedOriginalMaterials = [];
        this._navMode = 'select';
        this._navModeBeforeMarquee = 'select';
        this._lastMeasurement = null;
        this._measurePoints = [];
        this._measureVisuals = [];
        this._measureLine = null;
        this._clipPlanes = [];
        this._sectionMode = 'OFF';
        this._sectionBounds = null;
        this._sectionVisual = null;
        this._heatmapState = null;
        this._overlayRaf = 0;
        this._overlayNeedsRebuild = false;
        this._overlayLayerData = new Map();
        this._overlayLayerVisibility = new Map();
        this._overlayLayerFields = new Map();
        this._overlayGroups = new Map();
        this._overlayGeometryAnchors = [];
        this._overlayModelSize = 1;
        this._overlayScaleFactor = 1;
        this._overlaySmartScaleMultiplier = Number(this.viewerConfig?.overlay?.smartScale?.multiplier || 1);
        this._projectionMode = String(this.viewerConfig?.camera?.projection || 'orthographic').toLowerCase();
        this._palette = this._resolvePalette();
        this._verticalAxis = String(this.viewerConfig?.coordinateMap?.verticalAxis || 'Z').toUpperCase() === 'Y' ? 'Y' : 'Z';
        CURRENT_VERTICAL_AXIS = this._verticalAxis;
        this._init();
    }

    /** @private */
    _init() {
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 600;

        // Scene
        this.scene = new THREE.Scene();
        const themeKey = this._getThemeKey();
        const themeStyle = this._resolveThemeStyle();
        const backgroundConfig = String(this.viewerConfig?.scene?.background || 'auto').toLowerCase();
        const background = backgroundConfig === 'auto'
            ? new THREE.Color(themeStyle.background)
            : new THREE.Color(this.viewerConfig?.scene?.background);
        this.scene.background = background;

        // Camera Ã¢â‚¬â€ Orthographic
        const aspect = w / h;
        const frustum = Number(this.viewerConfig?.camera?.orthographicFrustum || 5000);
        this._orthoCamera = new THREE.OrthographicCamera(
            -frustum * aspect, frustum * aspect,
            frustum, -frustum,
            // Orthographic cameras require negative near to see geometry behind the camera plane.
            // Do NOT apply Math.abs here — a configured near of -50000 must stay negative.
            this.viewerConfig?.camera?.near != null ? Number(this.viewerConfig.camera.near) : -50000,
            Math.max(1000, Math.abs(Number(this.viewerConfig?.camera?.far || 1000000)))
        );
        const initialPosition = this.viewerConfig?.camera?.initialPosition || [5000, 5000, 5000];
        this._orthoCamera.position.set(Number(initialPosition[0] || 5000), Number(initialPosition[1] || 5000), Number(initialPosition[2] || 5000));
        this._orthoCamera.lookAt(0, 0, 0);
        this._perspCamera = new THREE.PerspectiveCamera(
            Number(this.viewerConfig?.camera?.fov || 60),
            aspect,
            0.1,
            1000000
        );
        this._perspCamera.position.copy(this._orthoCamera.position);
        this._perspCamera.lookAt(0, 0, 0);
        this.camera = this._projectionMode === 'perspective' ? this._perspCamera : this._orthoCamera;
        this._applyUpVector();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.viewerConfig?.scene?.antialias !== false,
            alpha: false
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // CSS2D overlay renderer for all annotation layers.
        this._css2dRenderer = new CSS2DRenderer();
        this._css2dRenderer.setSize(w, h);
        this._css2dRenderer.domElement.style.position = 'absolute';
        this._css2dRenderer.domElement.style.top = '0';
        this._css2dRenderer.domElement.style.left = '0';
        this._css2dRenderer.domElement.style.right = '0';
        this._css2dRenderer.domElement.style.bottom = '0';
        this._css2dRenderer.domElement.style.width = '100%';
        this._css2dRenderer.domElement.style.height = '100%';
        this._css2dRenderer.domElement.style.pointerEvents = 'none';
        this._css2dRenderer.domElement.style.overflow = 'hidden';
        this._css2dRenderer.domElement.style.zIndex = '2';
        this.container.style.position = 'relative';
        this.container.appendChild(this._css2dRenderer.domElement);
        this._initOverlayLayers();
        this._measureOverlayGroup = new THREE.Group();
        this.scene.add(this._measureOverlayGroup);

        // Controls (OrbitControls loaded via importmap)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = this.viewerConfig?.controls?.enableDamping !== false;
        this.controls.dampingFactor = Number(this.viewerConfig?.controls?.dampingFactor || 0.1);
        this.controls.rotateSpeed = Number(this.viewerConfig?.controls?.rotateSpeed || 1);
        this.controls.panSpeed = Number(this.viewerConfig?.controls?.panSpeed || 1);
        this.controls.zoomSpeed = Number(this.viewerConfig?.controls?.zoomSpeed || 1);
        this.controls.enablePan = this.viewerConfig?.controls?.enablePan !== false;
        this.controls.enableZoom = this.viewerConfig?.controls?.enableZoom !== false;
        this.controls.enableRotate = this.viewerConfig?.controls?.enableRotate !== false;
        // OrbitControls has a single rotateSpeed for both axes; XOR the flags so
        // enabling both cancels correctly (same as no inversion).
        const _invertX = !!this.viewerConfig?.controls?.invertX;
        const _invertY = !!this.viewerConfig?.controls?.invertY;
        if (_invertX !== _invertY) this.controls.rotateSpeed *= -1;
        this.setNavMode('select');
        // C3: Refresh clipping planes on every orbit/pan so geometry never disappears
        this.controls.addEventListener('change', () => {
            this._emitTrace('orbit-change', { target: this.controls?.target?.toArray?.() || [] });
            if (this._componentGroup) {
                const box = new THREE.Box3().setFromObject(this._componentGroup);
                if (!box.isEmpty()) {
                    const sz = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(sz.x, sz.y, sz.z, 1);
                    if (this.camera instanceof THREE.OrthographicCamera) {
                        const distance = this.camera.position.distanceTo(this.controls?.target || new THREE.Vector3());
                        this.camera.near = 0.1;
                        this.camera.far = Math.max(1000, maxDim * 80, distance + maxDim * 20);
                    } else {
                        this.camera.near = 0.1;
                        this.camera.far = Math.max(1000, maxDim * 80);
                    }
                    this.camera.updateProjectionMatrix();
                    this._queueOverlayRefresh();
                }
            }
        });

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, Number(this.viewerConfig?.scene?.ambientIntensity ?? 0.6));
        this.scene.add(ambient);

        const point = new THREE.PointLight(0xffffff, Number(this.viewerConfig?.scene?.pointIntensity ?? 0.8));
        point.position.set(2000, 4000, 2000);
        this.scene.add(point);

        const dir = new THREE.DirectionalLight(0xffffff, Number(this.viewerConfig?.scene?.directionalIntensity ?? 1.0));
        dir.position.set(-1000, 5000, -2000);
        this.scene.add(dir);

        // Grid + Axes
        this._gridHelper = this._buildGridHelper(themeStyle);
        this.scene.add(this._gridHelper);

        const axes = new THREE.AxesHelper(1000);
        axes.visible = this.viewerConfig?.helpers?.showAxes !== false;
        this.scene.add(axes);

        // Resize handler
        this._onResize = () => {
            const nw = this.container.clientWidth;
            const nh = this.container.clientHeight;
            if (nh === 0) return;
            const nAspect = nw / nh;
            this._orthoCamera.left = -frustum * nAspect;
            this._orthoCamera.right = frustum * nAspect;
            this._orthoCamera.top = frustum;
            this._orthoCamera.bottom = -frustum;
            this._orthoCamera.updateProjectionMatrix();
            this._perspCamera.aspect = nAspect;
            this._perspCamera.updateProjectionMatrix();
            this.renderer.setSize(nw, nh);
            if (this._css2dRenderer) this._css2dRenderer.setSize(nw, nh);
            this._queueOverlayRefresh();
        };
        window.addEventListener('resize', this._onResize);

        // ViewCube (top-right) and Axis Gizmo (bottom-right)
        if (this.viewerConfig?.helpers?.showViewCube !== false) this._buildViewCube();
        if (this.viewerConfig?.helpers?.showAxisGizmo !== false) this._buildAxisGizmo();
        this._bindInteractions();

        // Start render loop
        this._animate();
    }

    /** @private */
    _animate() {
        this._animId = requestAnimationFrame(() => this._animate());
        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
        if (this._css2dRenderer) this._css2dRenderer.render(this.scene, this.camera);
        this._applyOverlaySmartScale();
        this._syncViewCube();
        this._syncAxisGizmo();
    }

    /** @private Ã¢â‚¬â€ Build HTML ViewCube overlay in top-right */
    _buildViewCube() {
        // AbortController lets dispose() remove all ViewCube listeners in one call.
        this._viewCubeAC = new AbortController();
        const { signal } = this._viewCubeAC;

        const size = Number(this.viewerConfig?.overlay?.viewCubeSize || 90);
        const posStyles = {
            'top-left': 'top:12px;left:12px;',
            'top-right': 'top:12px;right:12px;',
            'bottom-left': 'bottom:12px;left:12px;',
            'bottom-right': 'bottom:12px;right:12px;',
        }[this.viewerConfig?.overlay?.viewCubePosition] || 'top:12px;right:12px;';
        const cube = document.createElement('div');
        cube.id = 'pcf-view-cube';
        cube.style.cssText = `
            position:absolute;${posStyles}width:${size}px;height:${size}px;
            perspective:220px;cursor:pointer;user-select:none;z-index:10;
            opacity:${this.viewerConfig?.overlay?.viewCubeOpacity ?? 0.85};transition:opacity 0.2s;
        `;
        cube.addEventListener('mouseenter', () => { cube.style.opacity = '1'; }, { signal });
        cube.addEventListener('mouseleave', () => { cube.style.opacity = String(this.viewerConfig?.overlay?.viewCubeOpacity ?? 0.85); }, { signal });
        const inner = document.createElement('div');
        inner.style.cssText = `
            width:100%;height:100%;position:relative;transform-style:preserve-3d;
            transition:transform 0.05s linear;
        `;
        const half = size / 2;
        // The cube is rotated relative to the camera snap directions in this
        // viewer, so label the faces by the actual view they trigger.
        const FACES = [
            { label: 'Right', rot: 'rotateY(90deg) translateZ(' + half + 'px)', bg: '#2b5285', cam: [1, 0, 0], up: [0, 1, 0] },
            { label: 'Left', rot: 'rotateY(-90deg) translateZ(' + half + 'px)', bg: '#3b6ea5', cam: [-1, 0, 0], up: [0, 1, 0] },
            { label: 'Top', rot: 'rotateX(90deg) translateZ(' + half + 'px)', bg: '#3a6e85', cam: [0, 1, 0], up: [0, 0, -1] },
            { label: 'Bottom', rot: 'rotateX(-90deg) translateZ(' + half + 'px)', bg: '#3a6e85', cam: [0, -1, 0], up: [0, 0, 1] },
            { label: 'Front', rot: 'translateZ(' + half + 'px)', bg: '#4a7c95', cam: [0, 0, 1], up: [0, 1, 0] },
            { label: 'Back', rot: 'rotateY(180deg) translateZ(' + half + 'px)', bg: '#4a7c95', cam: [0, 0, -1], up: [0, 1, 0] },
        ];
        for (const f of FACES) {
            const face = document.createElement('div');
            face.textContent = f.label;
            face.style.cssText = `
                position:absolute;width:${size}px;height:${size}px;
                display:flex;align-items:center;justify-content:center;
                font-size:11px;font-weight:700;color:#fff;background:${f.bg}cc;
                border:1px solid #ffffff33;box-sizing:border-box;
                transform:${f.rot};
                backface-visibility:visible;
            `;
            face.setAttribute('role', 'button');
            face.setAttribute('aria-label', `View from ${f.label}`);
            face.setAttribute('tabindex', '0');
            face.addEventListener('mouseenter', () => { face.style.background = `${f.bg}ff`; }, { signal });
            face.addEventListener('mouseleave', () => { face.style.background = `${f.bg}cc`; }, { signal });
            face.addEventListener('click', () => this._snapCamera(f.cam, f.up), { signal });
            face.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._snapCamera(f.cam, f.up); }, { signal });
            inner.appendChild(face);
        }
        cube.appendChild(inner);
        const cornerSpecs = [
            { id: 'iso-ne-top', label: 'TR', title: 'Isometric Top-Right', style: 'top:-10px;right:-10px;', preset: 'isoNE' },
            { id: 'iso-nw-top', label: 'TL', title: 'Isometric Top-Left', style: 'top:-10px;left:-10px;', preset: 'isoNW' },
            { id: 'iso-se-bot', label: 'BR', title: 'Isometric Bottom-Right', style: 'bottom:-10px;right:-10px;', preset: 'isoSE' },
            { id: 'iso-sw-bot', label: 'BL', title: 'Isometric Bottom-Left', style: 'bottom:-10px;left:-10px;', preset: 'isoSW' },
        ];
        for (const cp of cornerSpecs) {
            const corner = document.createElement('button');
            corner.type = 'button';
            corner.id = cp.id;
            corner.title = cp.title;
            corner.setAttribute('aria-label', cp.title);
            corner.textContent = cp.label;
            corner.style.cssText = `
                position:absolute;${cp.style}width:28px;height:28px;
                border-radius:50%;border:1px solid #ffffff77;
                background:#101522dd;color:#fff;font-size:10px;font-weight:700;
                display:flex;align-items:center;justify-content:center;
                cursor:pointer;z-index:20;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.35);
            `;
            corner.addEventListener('click', (e) => {
                e.stopPropagation();
                this.snapToPreset(cp.preset);
            }, { signal });
            corner.addEventListener('mouseenter', () => {
                corner.style.background = '#20314ecc';
                corner.style.borderColor = '#ffffffcc';
            }, { signal });
            corner.addEventListener('mouseleave', () => {
                corner.style.background = '#101522dd';
                corner.style.borderColor = '#ffffff77';
            }, { signal });
            cube.appendChild(corner);
        }
        this._viewCubeInner = inner;
        this._viewCubeEl = cube;
        // Ensure container is positioned
        if (getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        this.container.appendChild(cube);
    }

    /** Re-centre camera on geometry Ã¢â‚¬â€ public, called by UI Centre button */
    fitCamera() { this._fitCamera(); }
    fitAll() { this._fitCamera(); }

    fitSelection() {
        if (!this._selectedComponentId) {
            this._fitCamera();
            return;
        }
        const meshes = this._componentMeshIndex.get(this._selectedComponentId) || [];
        const box = new THREE.Box3();
        for (const mesh of meshes) box.expandByObject(mesh);
        if (box.isEmpty()) {
            this._fitCamera();
            return;
        }
        const centre = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        this.camera.position.set(centre.x + maxDim, centre.y + maxDim, centre.z + maxDim);
        this.camera.lookAt(centre);
        this.controls.target.copy(centre);
        this.controls.update();
        this._queueOverlayRefresh();
        this._emitTrace('fit-selection', { componentId: this._selectedComponentId });
    }

    _reportMeasurement(summary) {
        this._lastMeasurement = summary || null;
        if (this._onMeasurementChange) this._onMeasurementChange(this._lastMeasurement);
    }

    setNavMode(mode = 'select') {
        const normalized = String(mode || 'select');
        if (!this.controls) return;
        const previousMode = String(this._navMode || 'select');

        // Cancel any active marquee before switching
        this._cancelMarquee();
        // Critical: marquee pointerdown handler must be removed when leaving marquee mode,
        // otherwise marquee can restart while using other tools.
        if (normalized !== 'marquee') this._detachMarqueeHandlers();

        this._navMode = normalized;
        if (normalized === 'select') {
            // In select mode: left-click = select, but allow orbit (left/right-drag) and pan (middle-drag)
            this.controls.enableRotate = true;
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,     // left-drag orbits, left-click without drag selects
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
            };
            this.container.style.cursor = '';
        } else if (normalized === 'measure') {
            this.controls.enableRotate = false;
            this.controls.enablePan = false;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: null,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
            };
            this.container.style.cursor = 'crosshair';
        } else if (normalized === 'plan') {
            this.controls.enableRotate = true;
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN,
            };
            this.container.style.cursor = '';
            if (previousMode === 'plan') {
                const step = Number(this.viewerConfig?.controls?.planRotateStepDeg || 90);
                this._rollPlanView(step);
            } else {
                this.snapToPreset('plan');
            }
        } else if (normalized === 'rotateY') {
            this.controls.enableRotate = true;
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN,
            };
            this.container.style.cursor = '';
            this._orbitAroundAxis('Y');
        } else if (normalized === 'rotateZ') {
            this.controls.enableRotate = true;
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN,
            };
            this.container.style.cursor = '';
            this._orbitAroundAxis('Z');
        } else if (normalized === 'pan') {
            this.controls.enableRotate = false;
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
            };
            this.container.style.cursor = '';
        } else if (normalized === 'marquee') {
            this._navModeBeforeMarquee = previousMode === 'marquee' ? 'select' : previousMode;
            this.controls.enableRotate = false;
            this.controls.enablePan = false;
            this.controls.enableZoom = false;
            this.controls.mouseButtons = {
                LEFT: null,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
            };
            this.container.style.cursor = 'crosshair';
            this._attachMarqueeHandlers();
        } else {
            // orbit and other modes Ã¢â‚¬â€ standard left=rotate, middle/right=pan
            this.controls.enableRotate = true;
            this.controls.enablePan = true;
            this.controls.enableZoom = true;
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN,
            };
            this.container.style.cursor = '';
        }
        if (normalized !== 'measure') this._clearMeasureOverlay();
        this._emitTrace('nav-mode', { mode: normalized });
    }

    /** Attach pointer event handlers for marquee zoom mode */
    _attachMarqueeHandlers() {
        this._detachMarqueeHandlers();
        this._marqueeDown = (e) => {
            if (e.button !== 0) return;
            this._startMarqueeZoom(e);
        };
        this.container.addEventListener('pointerdown', this._marqueeDown);
    }

    _detachMarqueeHandlers() {
        if (this._marqueeDown) {
            this.container.removeEventListener('pointerdown', this._marqueeDown);
            this._marqueeDown = null;
        }
        // Also clean up any in-progress drag listeners on window.
        if (this._marqueeMove) { window.removeEventListener('pointermove', this._marqueeMove); this._marqueeMove = null; }
        if (this._marqueeUp)   { window.removeEventListener('pointerup',   this._marqueeUp);   this._marqueeUp   = null; }
    }

    _startMarqueeZoom(e) {
        const rect = this.container.getBoundingClientRect();
        this._marqueeStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        // Create rubber-band overlay div
        if (!this._marqueeEl) {
            const el = document.createElement('div');
            el.style.cssText = [
                'position:absolute',
                'border:2px dashed #60a5fa',
                'background:rgba(59,130,246,0.08)',
                'pointer-events:none',
                'z-index:999',
                'box-shadow:0 0 0 1px rgba(59,130,246,0.25)',
                'border-radius:2px',
            ].join(';');
            this.container.appendChild(el);
            this._marqueeEl = el;
        }
        this._marqueeEl.style.display = 'block';
        this._marqueeEl.style.left   = this._marqueeStart.x + 'px';
        this._marqueeEl.style.top    = this._marqueeStart.y + 'px';
        this._marqueeEl.style.width  = '0px';
        this._marqueeEl.style.height = '0px';

        this._marqueeMove = (e2) => this._updateMarqueeRect(e2);
        this._marqueeUp   = (e2) => this._applyMarqueeZoom(e2);
        window.addEventListener('pointermove', this._marqueeMove);
        window.addEventListener('pointerup',   this._marqueeUp);
    }

    _updateMarqueeRect(e) {
        if (!this._marqueeStart || !this._marqueeEl) return;
        const rect = this.container.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const x = Math.min(cx, this._marqueeStart.x);
        const y = Math.min(cy, this._marqueeStart.y);
        const w = Math.abs(cx - this._marqueeStart.x);
        const h = Math.abs(cy - this._marqueeStart.y);
        this._marqueeEl.style.left   = x + 'px';
        this._marqueeEl.style.top    = y + 'px';
        this._marqueeEl.style.width  = w + 'px';
        this._marqueeEl.style.height = h + 'px';
    }

    _applyMarqueeZoom(e) {
        window.removeEventListener('pointermove', this._marqueeMove);
        window.removeEventListener('pointerup',   this._marqueeUp);
        this._marqueeMove = null;
        this._marqueeUp   = null;

        const start = this._marqueeStart;
        const rect  = this.container.getBoundingClientRect();
        const endX  = e.clientX - rect.left;
        const endY  = e.clientY - rect.top;

        this._cancelMarquee();

        const W = rect.width;
        const H = rect.height;
        const x1 = Math.min(start.x, endX);
        const x2 = Math.max(start.x, endX);
        const y1 = Math.min(start.y, endY);
        const y2 = Math.max(start.y, endY);

        // Ignore tiny clicks
        if ((x2 - x1) < 8 || (y2 - y1) < 8) return;

        const cam = this.camera;
        const compBox = this._componentGroup
            ? new THREE.Box3().setFromObject(this._componentGroup)
            : null;
        if (!compBox || compBox.isEmpty()) return;
        const toNdc = (sx, sy) => ({
            x: (sx / W) * 2 - 1,
            y: -((sy / H) * 2 - 1),
        });
        const raycaster = new THREE.Raycaster();
        const mapScreenToPlanePoint = (sx, sy, plane) => {
            const ndc = toNdc(sx, sy);
            raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
            const hit = new THREE.Vector3();
            const ok = raycaster.ray.intersectPlane(plane, hit);
            return ok ? hit : null;
        };

        const selectedScreenCentre = {
            x: (x1 + x2) * 0.5,
            y: (y1 + y2) * 0.5,
        };
        const canvasScreenCentre = { x: W * 0.5, y: H * 0.5 };

        const currentTarget = this.controls?.target?.clone() || compBox.getCenter(new THREE.Vector3());
        const viewNormal = cam.getWorldDirection(new THREE.Vector3()).normalize();
        const focusPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewNormal, currentTarget);

        const selectedWorldCentre = mapScreenToPlanePoint(selectedScreenCentre.x, selectedScreenCentre.y, focusPlane);
        const canvasWorldCentre = mapScreenToPlanePoint(canvasScreenCentre.x, canvasScreenCentre.y, focusPlane);

        const newTarget = currentTarget.clone();
        const newPos = cam.position.clone();
        if (selectedWorldCentre && canvasWorldCentre) {
            const delta = selectedWorldCentre.clone().sub(canvasWorldCentre);
            newTarget.add(delta);
            newPos.add(delta);
        }

        const rectWidth = Math.max(1, x2 - x1);
        const rectHeight = Math.max(1, y2 - y1);
        const fitScale = Math.max(1.0, Math.min(W / rectWidth, H / rectHeight) * 0.92);
        let nextZoom = null;
        if (cam instanceof THREE.OrthographicCamera) {
            nextZoom = THREE.MathUtils.clamp(Number(cam.zoom || 1) * fitScale, 0.05, 5000);
        } else {
            const currentDistance = Math.max(1, cam.position.distanceTo(this.controls.target));
            const nextDistance = Math.max(1, currentDistance / fitScale);
            const viewDir = cam.position.clone().sub(this.controls.target).normalize();
            newPos.copy(newTarget).addScaledVector(viewDir, nextDistance);
        }

        // Animate
        const startPos    = cam.position.clone();
        const startTarget = this.controls.target.clone();
        const startZoom   = cam instanceof THREE.OrthographicCamera ? Number(cam.zoom || 1) : null;
        const duration    = 300;
        const start0      = performance.now();
        const tick = (now) => {
            const t = Math.min((now - start0) / duration, 1);
            const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out quad
            cam.position.lerpVectors(startPos, newPos, ease);
            this.controls.target.lerpVectors(startTarget, newTarget, ease);
            if (cam instanceof THREE.OrthographicCamera && nextZoom != null && startZoom != null) {
                cam.zoom = THREE.MathUtils.lerp(startZoom, nextZoom, ease);
                cam.updateProjectionMatrix();
            }
            this.controls.update();
            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                // Restore the mode used before marquee zoom was started.
                const resumeMode = String(this._navModeBeforeMarquee || 'select');
                this.setNavMode(resumeMode);
                this._emitTrace('marquee-zoom-done', { resumeMode });
            }
        };
        requestAnimationFrame(tick);
        this._emitTrace('marquee-zoom', { x1, y1, x2, y2 });
    }

    _cancelMarquee() {
        if (this._marqueeEl) {
            this._marqueeEl.style.display = 'none';
        }
        this._marqueeStart = null;
        if (this._marqueeMove) { window.removeEventListener('pointermove', this._marqueeMove); this._marqueeMove = null; }
        if (this._marqueeUp)   { window.removeEventListener('pointerup',   this._marqueeUp);   this._marqueeUp   = null; }
    }

    getNavMode() {
        return this._navMode;
    }

    getProjectionMode() {
        return this._projectionMode;
    }

    getSectionMode() {
        return this._sectionMode;
    }

    /**
     * Nudge the PLANE_UP section plane by `delta` mm along the vertical axis.
     * No-op if section mode is not PLANE_UP.
     */
    nudgeSectionPlane(delta) {
        if (this._sectionMode !== 'PLANE_UP') return;
        if (!this._clipPlanes || this._clipPlanes.length === 0) return;
        // Plane equation: normalÃ‚Â·x + constant = 0
        // For Z-up: normal=(0,0,-1), constant=cut  Ã¢â€ â€™ plane is at z=cut
        // Increasing cut moves the plane up (shows less of the model)
        this._clipPlanes[0].constant += delta;
        this._applyCurrentSectionClipping();
        this._renderSectionPlaneVisual?.(
            this._clipPlanes[0].normal.clone(),
            this._clipPlanes[0].constant,
            this._sectionBounds,
        );
        this._queueOverlayRefresh();
    }

    /**
     * Set PLANE_UP section plane to an absolute offset from the model centre.
     * Called by the UI slider in the section panel.
     */
    setSectionPlaneOffset(offset) {
        if (this._sectionMode !== 'PLANE_UP') return;
        if (!this._clipPlanes || this._clipPlanes.length === 0) return;
        if (!this._sectionBounds) return;
        const centre = this._sectionBounds.getCenter(new THREE.Vector3());
        const base = centre.y;
        this._clipPlanes[0].constant = base + Number(offset || 0);
        this._applyCurrentSectionClipping();
    }

    /**
     * Shrink or expand the BOX section planes by `padding` mm inward.
     * Called by the UI slider in the section panel.
     */
    setSectionBoxPadding(padding) {
        if (this._sectionMode !== 'BOX') return;
        if (!this._sectionBounds) return;
        const pad = Number(padding || 0);
        const box = this._sectionBounds.clone();
        box.expandByScalar(-pad);
        this._applyBoxPlanes(box);
    }

    toggleProjection() {
        this._projectionMode = this._projectionMode === 'orthographic' ? 'perspective' : 'orthographic';
        const next = this._projectionMode === 'perspective' ? this._perspCamera : this._orthoCamera;
        if (next && this.camera) {
            next.position.copy(this.camera.position);
            next.up.copy(this.camera.up);
            if (this.controls) {
                next.lookAt(this.controls.target);
                this.controls.object = next;
            }
            this.camera = next;
            this.camera.updateProjectionMatrix();
        }
        this._queueOverlayRefresh();
        this._emitTrace('projection-toggle', { mode: this._projectionMode });
    }

    snapToPreset(presetId = 'isoNE') {
        CURRENT_VERTICAL_AXIS = this._verticalAxis;
        if (String(presetId).toLowerCase() === 'plan') {
            const up = CURRENT_VERTICAL_AXIS === 'Z' ? [0, 1, 0] : [0, 0, -1];
            this._snapCamera([0, 1, 0], up);
            this._emitTrace('snap-preset', { preset: 'plan' });
            return;
        }
        const preset = this.viewerConfig?.presets?.[presetId];
        if (!preset) return;
        this._snapCamera(preset.cam || [1, 1, -1], preset.up || [0, 1, 0]);
        this._emitTrace('snap-preset', { preset: presetId });
    }

    _orbitAroundAxis(axis) {
        if (!this.controls || !this.camera) return;
        const target = this.controls.target.clone();
        const offset = this.camera.position.clone().sub(target);
        if (offset.lengthSq() < 1e-8) return;
        const axisKey = String(axis || 'Y').toUpperCase();
        const axisVector = axisKey === 'Z'
            ? new THREE.Vector3(0, 0, 1)
            : axisKey === 'X'
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0, 1, 0);
        const stepDeg = Number(this.viewerConfig?.controls?.rotateStepDeg || 30);
        const rotation = new THREE.Quaternion().setFromAxisAngle(axisVector, THREE.MathUtils.degToRad(stepDeg));
        const nextOffset = offset.clone().applyQuaternion(rotation);
        const nextUp = this.camera.up.clone().applyQuaternion(rotation).normalize();

        this.camera.position.copy(target.clone().add(nextOffset));
        this.camera.up.copy(nextUp);
        this.controls.target.copy(target);
        this.camera.lookAt(target);
        this.controls.update();
        this._queueOverlayRefresh();
        this._emitTrace('camera-orbit-axis', {
            axis: axisKey,
            stepDeg,
            cameraPosition: this.camera.position.toArray(),
            target: this.controls.target.toArray(),
            up: this.camera.up.toArray(),
        });
    }

    _rollPlanView(stepDeg = 90) {
        if (!this.controls || !this.camera) return;
        const target = this.controls.target.clone();
        const viewDir = target.clone().sub(this.camera.position);
        if (viewDir.lengthSq() < 1e-8) return;
        viewDir.normalize();
        const rotation = new THREE.Quaternion().setFromAxisAngle(viewDir, THREE.MathUtils.degToRad(Number(stepDeg || 90)));
        this.camera.up.applyQuaternion(rotation).normalize();
        this.camera.lookAt(target);
        this.controls.target.copy(target);
        this.controls.update();
        this._queueOverlayRefresh();
        this._emitTrace('camera-plan-roll', {
            stepDeg: Number(stepDeg || 90),
            cameraPosition: this.camera.position.toArray(),
            target: this.controls.target.toArray(),
            up: this.camera.up.toArray(),
        });
    }

    /** @private Ã¢â‚¬â€ Snap camera to axis-aligned view */
    _snapCamera([cx, cy, cz], [ux, uy, uz]) {
        if (!this.controls) return;
        const box = new THREE.Box3();
        if (this._componentGroup) box.setFromObject(this._componentGroup);
        const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        const size = box.isEmpty() ? 5000 : Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.5;
        this.camera.position.set(
            centre.x + cx * size,
            centre.y + cy * size,
            centre.z + cz * size
        );
        this.camera.up.set(ux, uy, uz);
        this.camera.lookAt(centre);
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(centre);
        this.controls.update();
        this._queueOverlayRefresh();
        this._emitTrace('camera-snap', { cx, cy, cz, ux, uy, uz });
    }

    /** @private Ã¢â‚¬â€ Sync ViewCube rotation with camera */
    _syncViewCube() {
        if (!this._viewCubeInner || !this.camera) return;
        const q = this.camera.quaternion.clone().invert();
        const mat = new THREE.Matrix4().makeRotationFromQuaternion(q);
        const els = mat.elements;
        // Transform the Y axis to match CSS coordinate system (Y is down)
        const cssMat = [
            els[0], -els[1], els[2], els[3],
            -els[4], els[5], -els[6], els[7],
            els[8], -els[9], els[10], els[11],
            els[12], els[13], els[14], els[15]
        ];
        this._viewCubeInner.style.transform = `translateZ(-220px) matrix3d(${cssMat.join(',')})`;
    }

    /** @private Ã¢â‚¬â€ Build axis gizmo in bottom-right */
    _buildAxisGizmo() {
        const container = document.createElement('div');
        container.id = 'pcf-axis-gizmo';
        const pos = this.viewerConfig?.helpers?.axisGizmoPosition || 'bottom-right';
        const posStyles = {
            'top-left': 'top:12px;left:12px;',
            'top-right': 'top:12px;right:12px;',
            'bottom-left': 'bottom:12px;left:12px;',
            'bottom-right': 'bottom:12px;right:12px;',
        }[pos] || 'bottom:12px;right:12px;';
        container.style.cssText = `
            position:absolute;${posStyles}width:${Number(this.viewerConfig?.helpers?.axisGizmoSize || 80)}px;height:${Number(this.viewerConfig?.helpers?.axisGizmoSize || 80)}px;
            z-index:10;pointer-events:none;
        `;
        const canvas = document.createElement('canvas');
        const gizmoSize = Number(this.viewerConfig?.helpers?.axisGizmoSize || 80);
        canvas.width = gizmoSize;
        canvas.height = gizmoSize;
        container.appendChild(canvas);
        this.container.appendChild(container);
        this._axisGizmoEl = container;
        this._axisGizmoCtx = canvas.getContext('2d');
    }

    /** @private Ã¢â‚¬â€ Redraw axis gizmo every frame */
    _syncAxisGizmo() {
        const ctx = this._axisGizmoCtx;
        if (!ctx || !this.camera) return;
        const W = ctx.canvas.width, H = ctx.canvas.height, cx = W / 2, cy = H / 2, len = Math.round(Math.min(W, H) * 0.35);
        ctx.clearRect(0, 0, W, H);
        const axes = [
            { src: { x: 1, y: 0, z: 0 }, color: '#ff4444', label: 'X' },
            { src: { x: 0, y: 1, z: 0 }, color: '#44cc44', label: 'Y' },
            { src: { x: 0, y: 0, z: 1 }, color: '#4488ff', label: 'Z' },
        ];
        for (const { src, color, label } of axes) {
            const dir = mapCoord(src);
            if (!dir) continue;
            const proj = dir.clone().applyQuaternion(this.camera.quaternion.clone().invert());
            const ex = cx + proj.x * len;
            const ey = cy - proj.y * len;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(label, ex + (ex > cx ? 2 : -10), ey + (ey > cy ? 10 : -2));
        }
    }


    /** @private */
    _wireFullscreen() {
        // Fullscreen is now handled by viewer-tab.js Ã¢â‚¬â€ kept for backward compatibility
    }

    /**
     * Initialize the unified CSS2D overlay layer stack used by MESSAGE, Length, Measure, and Spare labels.
     * Layer data is fed through `setOverlayLayerData` and rebuilt via `rebuildOverlayLayers`.
     */
    _initOverlayLayers() {
        const layerIds = Object.values(OVERLAY_LAYER_IDS);
        for (const layerId of layerIds) {
            const group = new THREE.Group();
            group.name = `overlay-layer-${layerId}`;
            this._overlayGroups.set(layerId, group);
            this._overlayLayerData.set(layerId, []);
            this._overlayLayerVisibility.set(layerId, this._defaultOverlayLayerVisibility(layerId));
            this.scene.add(group);
        }
        this._overlayLayerFields.set(OVERLAY_LAYER_IDS.SPARE_1, String(this.viewerConfig?.spareOverlays?.spare1?.selectedField || ''));
        this._overlayLayerFields.set(OVERLAY_LAYER_IDS.SPARE_2, String(this.viewerConfig?.spareOverlays?.spare2?.selectedField || ''));
    }

    _defaultOverlayLayerVisibility(layerId) {
        if (layerId === OVERLAY_LAYER_IDS.MESSAGE_CIRCLE) return !!this.viewerConfig?.nodes?.enabled;
        if (layerId === OVERLAY_LAYER_IDS.MESSAGE_SQUARE) return this.viewerConfig?.overlay?.annotations?.messageSquareEnabled !== false;
        if (layerId === OVERLAY_LAYER_IDS.LENGTH) return !!this.viewerConfig?.lengthLabels?.enabled;
        if (layerId === OVERLAY_LAYER_IDS.SPARE_1) return !!this.viewerConfig?.spareOverlays?.spare1?.enabled;
        if (layerId === OVERLAY_LAYER_IDS.SPARE_2) return !!this.viewerConfig?.spareOverlays?.spare2?.enabled;
        return true;
    }

    /**
     * Set or replace one overlay layer's source rows.
     * @param {string} layerId
     * @param {Array<object>} rows
     */
    setOverlayLayerData(layerId, rows) {
        if (!this._overlayLayerData.has(layerId)) return;
        this._overlayLayerData.set(layerId, Array.isArray(rows) ? rows.slice() : []);
        this._queueOverlayRefresh(true);
    }

    /**
     * Toggle one overlay layer's visibility without mutating other layers.
     * @param {string} layerId
     * @param {boolean} enabled
     */
    setOverlayLayerVisibility(layerId, enabled) {
        if (!this._overlayLayerVisibility.has(layerId)) return;
        this._overlayLayerVisibility.set(layerId, !!enabled);
        const group = this._overlayGroups.get(layerId);
        if (group) group.visible = !!enabled;
        this._queueOverlayRefresh(true);
    }

    /**
     * Set the field key used for a data-driven layer (Spare 1 / Spare 2).
     * @param {string} layerId
     * @param {string} fieldKey
     */
    setOverlayLayerField(layerId, fieldKey) {
        if (!this._overlayLayerData.has(layerId)) return;
        this._overlayLayerFields.set(layerId, String(fieldKey || ''));
        this._queueOverlayRefresh(true);
    }

    /**
     * Rebuild all overlay layer nodes from current layer data + visibility state.
     * This call is safe to run repeatedly and used after model/config/camera changes.
     */
    rebuildOverlayLayers() {
        this._overlayNeedsRebuild = false;
        const layerIds = Object.values(OVERLAY_LAYER_IDS);
        for (const layerId of layerIds) {
            const group = this._overlayGroups.get(layerId);
            if (!group) continue;
            while (group.children.length) group.remove(group.children[0]);

            const visible = this._overlayLayerVisibility.get(layerId) !== false;
            group.visible = visible;
            if (!visible) continue;

            const rows = this._overlayLayerData.get(layerId) || [];
            const labelRows = layerId === OVERLAY_LAYER_IDS.SPARE_1 || layerId === OVERLAY_LAYER_IDS.SPARE_2
                ? this._resolveSpareLayerRows(layerId, rows)
                : rows;

            for (const row of labelRows) {
                const text = String(row?.text || '').trim();
                if (!text) continue;
                const worldPos = this._overlayRowToWorld(layerId, row);
                if (!worldPos) continue;
                const label = this._buildOverlayLabel(layerId, text, row?.styleKey);
                const lift = Number(row?.lift || 0);
                label.position.copy(worldPos);
                label.position.addScaledVector(_verticalVector().clone().normalize(), lift);
                group.add(label);
            }
        }
        this._applyOverlaySmartScale();
    }

    _overlayRowToWorld(layerId, row) {
        if (!row) return null;
        if (row.worldPos?.isVector3) return row.worldPos.clone();
        if (row.worldPos && Number.isFinite(Number(row.worldPos.x)) && Number.isFinite(Number(row.worldPos.y)) && Number.isFinite(Number(row.worldPos.z))) {
            return new THREE.Vector3(Number(row.worldPos.x), Number(row.worldPos.y), Number(row.worldPos.z));
        }
        if (layerId === OVERLAY_LAYER_IDS.SPARE_1 || layerId === OVERLAY_LAYER_IDS.SPARE_2) {
            const mapped = mapCoord(row);
            if (!mapped) return null;
            if (this.viewerConfig?.spareOverlays?.snapToNearest !== false) {
                const tolerance = Number(this.viewerConfig?.spareOverlays?.snapToleranceMm || 180);
                const nearest = this._findNearestOverlayAnchor(mapped);
                if (nearest && nearest.distance <= tolerance) return nearest.point.clone();
            }
            return mapped;
        }
        const sourcePos = row.pos || row.position || row.point || row;
        const mapped = mapCoord(sourcePos);
        return mapped || null;
    }

    _resolveSpareLayerRows(layerId, rows) {
        const fieldKey = String(this._overlayLayerFields.get(layerId) || '');
        const resolved = [];
        for (const row of rows || []) {
            const fields = row?.fields && typeof row.fields === 'object' ? row.fields : {};
            const fallbackField = Object.keys(fields)[0] || '';
            const key = fieldKey || fallbackField;
            if (!key) continue;
            const value = fields[key];
            if (value == null || String(value).trim() === '') continue;
            resolved.push({
                ...row,
                text: String(value),
                lift: Number(row?.lift ?? 26),
            });
        }
        return resolved;
    }

    _buildOverlayLabel(layerId, text, styleKey = '') {
        const div = document.createElement('div');
        const style = this._overlayStyleForLayer(layerId, styleKey);
        div.textContent = text;
        div.style.pointerEvents = 'none';
        div.style.whiteSpace = 'nowrap';
        div.style.maxWidth = `${style.maxWidth}px`;
        div.style.overflow = 'hidden';
        div.style.textOverflow = 'ellipsis';
        div.style.boxShadow = style.shadow;
        div.style.color = style.color;
        div.style.background = style.background;
        div.style.border = `${style.borderWidth}px solid ${style.borderColor}`;
        div.style.borderRadius = `${style.borderRadius}px`;
        div.style.letterSpacing = `${style.letterSpacing}em`;
        const obj = new CSS2DObject(div);
        obj.userData.overlayScaleBase = style;
        this._applyScaleToOverlayObject(obj, this._overlayScaleFactor || 1);
        return obj;
    }

    _overlayStyleForLayer(layerId, styleKey = '') {
        if (layerId === OVERLAY_LAYER_IDS.MESSAGE_CIRCLE) {
            return { fontSize: 10, fontWeight: 700, padX: 5, padY: 2, borderWidth: 2, borderRadius: 999, maxWidth: 180, letterSpacing: 0.02, color: '#ffffff', background: '#1a56db', borderColor: '#93c5fd', shadow: '0 1px 4px rgba(0,0,0,0.4)' };
        }
        if (layerId === OVERLAY_LAYER_IDS.MESSAGE_SQUARE) {
            return { fontSize: 9, fontWeight: 600, padX: 5, padY: 2, borderWidth: 1, borderRadius: 3, maxWidth: 220, letterSpacing: 0.01, color: '#1a1a00', background: 'rgba(255,235,59,0.92)', borderColor: 'rgba(161,120,0,0.6)', shadow: '0 1px 3px rgba(0,0,0,0.3)' };
        }
        if (layerId === OVERLAY_LAYER_IDS.LENGTH) {
            return { fontSize: 11, fontWeight: 600, padX: 6, padY: 2, borderWidth: 1, borderRadius: 6, maxWidth: 170, letterSpacing: 0.01, color: '#f8fbff', background: 'rgba(10, 23, 41, 0.9)', borderColor: 'rgba(156, 197, 255, 0.55)', shadow: '0 2px 6px rgba(0,0,0,0.25)' };
        }
        if (layerId === OVERLAY_LAYER_IDS.MEASURE) {
            return { fontSize: 12, fontWeight: 700, padX: 10, padY: 6, borderWidth: 1, borderRadius: 999, maxWidth: 420, letterSpacing: 0.01, color: '#eef6ff', background: 'rgba(10, 21, 38, 0.92)', borderColor: 'rgba(125, 211, 252, 0.36)', shadow: '0 8px 24px rgba(0, 0, 0, 0.28)' };
        }
        if (layerId === OVERLAY_LAYER_IDS.SPARE_2 || styleKey === 'spare2') {
            return { fontSize: 10, fontWeight: 700, padX: 6, padY: 3, borderWidth: 1, borderRadius: 5, maxWidth: 240, letterSpacing: 0.01, color: '#ffeef8', background: 'rgba(128, 22, 70, 0.88)', borderColor: 'rgba(255, 145, 203, 0.65)', shadow: '0 3px 8px rgba(0,0,0,0.28)' };
        }
        return { fontSize: 10, fontWeight: 700, padX: 6, padY: 3, borderWidth: 1, borderRadius: 5, maxWidth: 240, letterSpacing: 0.01, color: '#ecfffa', background: 'rgba(14, 94, 79, 0.88)', borderColor: 'rgba(94, 234, 212, 0.68)', shadow: '0 3px 8px rgba(0,0,0,0.28)' };
    }

    _updateOverlayGeometryAnchors(components = []) {
        const anchors = [];
        const dedupe = new Set();
        const pushPoint = (p) => {
            if (!p) return;
            const wp = mapCoord(p);
            if (!wp) return;
            const key = `${Math.round(wp.x)}|${Math.round(wp.y)}|${Math.round(wp.z)}`;
            if (dedupe.has(key)) return;
            dedupe.add(key);
            anchors.push(wp);
        };
        for (const comp of components || []) {
            if (Array.isArray(comp?.points)) {
                for (const pt of comp.points) pushPoint(pt);
            }
            pushPoint(comp?.centrePoint);
            pushPoint(comp?.branch1Point);
            pushPoint(comp?.coOrds);
        }
        this._overlayGeometryAnchors = anchors;
        if (this._componentGroup) {
            const box = new THREE.Box3().setFromObject(this._componentGroup);
            if (!box.isEmpty()) {
                this._overlayModelSize = Math.max(1, box.getSize(new THREE.Vector3()).length());
            }
        }
    }

    _findNearestOverlayAnchor(worldPoint) {
        if (!worldPoint || !this._overlayGeometryAnchors.length) return null;
        let best = null;
        let bestDist = Infinity;
        for (const anchor of this._overlayGeometryAnchors) {
            const d = anchor.distanceTo(worldPoint);
            if (d < bestDist) {
                bestDist = d;
                best = anchor;
            }
        }
        return best ? { point: best, distance: bestDist } : null;
    }

    _queueOverlayRefresh(rebuild = false) {
        if (rebuild) this._overlayNeedsRebuild = true;
        if (this._overlayRaf) return;
        this._overlayRaf = requestAnimationFrame(() => {
            this._overlayRaf = 0;
            if (this._overlayNeedsRebuild) {
                this._overlayNeedsRebuild = false;
                this.rebuildOverlayLayers();
                return;
            }
            this._applyOverlaySmartScale();
        });
    }

    _computeOverlayScaleFactor() {
        const smart = this.viewerConfig?.overlay?.smartScale || {};
        const enabled = smart.enabled !== false;
        const multiplier = Number.isFinite(Number(this._overlaySmartScaleMultiplier))
            ? Number(this._overlaySmartScaleMultiplier)
            : Number(smart.multiplier || 1);
        const sensitivity = THREE.MathUtils.clamp(Number(smart.scrollSensitivity ?? 0.2), 0.05, 2.5);
        const min = Number.isFinite(Number(smart.min)) ? Number(smart.min) : 0.65;
        const max = Number.isFinite(Number(smart.max)) ? Number(smart.max) : 1.9;
        if (!enabled || !this.camera) return THREE.MathUtils.clamp(multiplier, min, max);

        const modelSize = Math.max(1, Number(this._overlayModelSize || 1));
        const target = this.controls?.target || new THREE.Vector3();
        const distance = Math.max(1, this.camera.position.distanceTo(target));
        const cameraFactor = this.camera instanceof THREE.OrthographicCamera
            ? Math.pow(Math.max(0.05, Number(this.camera.zoom || 1)), 0.28 * sensitivity)
            : Math.pow(THREE.MathUtils.clamp(modelSize / distance, 0.2, 3), 0.34 * sensitivity);
        const modelFactor = Math.pow(THREE.MathUtils.clamp(modelSize / 2500, 0.5, 2.2), 0.16);
        const raw = multiplier * cameraFactor * modelFactor;
        return THREE.MathUtils.clamp(raw, min, max);
    }

    _applyScaleToOverlayObject(obj, scale) {
        if (!obj?.element || !obj.userData?.overlayScaleBase) return;
        const base = obj.userData.overlayScaleBase;
        const scaledFont = Math.max(8, base.fontSize * scale);
        const scaledPadY = Math.max(1, base.padY * scale);
        const scaledPadX = Math.max(2, base.padX * scale);
        const scaledBorder = Math.max(1, base.borderWidth * Math.min(1.6, scale));
        const scaledRadius = Math.max(2, base.borderRadius * Math.min(1.5, scale));
        obj.element.style.font = `${base.fontWeight} ${scaledFont.toFixed(2)}px/1.1 "Segoe UI", Arial, sans-serif`;
        obj.element.style.padding = `${scaledPadY.toFixed(2)}px ${scaledPadX.toFixed(2)}px`;
        obj.element.style.borderWidth = `${scaledBorder.toFixed(2)}px`;
        obj.element.style.borderRadius = `${scaledRadius.toFixed(2)}px`;
    }

    _applyOverlaySmartScale() {
        const nextScale = this._computeOverlayScaleFactor();
        if (Math.abs(nextScale - this._overlayScaleFactor) < 0.005) return;
        this._overlayScaleFactor = nextScale;
        for (const group of this._overlayGroups.values()) {
            for (const child of group.children) {
                this._applyScaleToOverlayObject(child, nextScale);
            }
        }
    }

    /**
     * Runtime smart-scale multiplier update used by UI slider without forcing full viewer rerender.
     * @param {number} multiplier
     */
    setOverlaySmartScaleMultiplier(multiplier) {
        const next = Number(multiplier);
        if (!Number.isFinite(next)) return;
        this._overlaySmartScaleMultiplier = THREE.MathUtils.clamp(next, 0.2, 4);
        this._overlayScaleFactor = Number.NaN;
        this._applyOverlaySmartScale();
    }

    /**
     * Public refresh hook used when length-related UI changes without a full geometry rerender.
     * Rebuilds the cached length label rows from the latest component set and keeps the overlay layer visible state in sync.
     * @param {object[]|null} components
     */
    refreshLengthLabels(components = null) {
        const source = Array.isArray(components)
            ? components
            : Array.isArray(this._lastComponentsCache)
                ? this._lastComponentsCache
                : [];

        this._rebuildLengthLabels(source);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.LENGTH, !!this.viewerConfig?.lengthLabels?.enabled);
        this.rebuildOverlayLayers();
        this._emitTrace('length-labels-refresh', {
            enabled: !!this.viewerConfig?.lengthLabels?.enabled,
            sourceCount: source.length,
        });
    }
    /**
     * Clear old components and render new ones.
     * @param {object[]} components Ã¢â‚¬â€ from stitcher output
     */
    render(components) {
        // Sync the module-level axis to this instance's config before any coordinate mapping.
        CURRENT_VERTICAL_AXIS = this._verticalAxis;
        this._emitTrace('render-start', { components: Array.isArray(components) ? components.length : 0 });

        // Sync palette and scene styling dynamically
        this._palette = this._resolvePalette();
        this._applyThemeAppearance();

        // Remove old component group
        if (this._componentGroup) {
            this.scene.remove(this._componentGroup);
            this._componentGroup.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
        }
        if (this._sectionVisual) {
            this.scene.remove(this._sectionVisual);
            this._sectionVisual = null;
        }

        this._componentGroup = new THREE.Group();
        this._lastComponentsCache = components; // Cache for radius fallback references
        this._componentMeshIndex = new Map();
        this._clearSelection();
        this._reportMeasurement(null);
        this._clearMeasureOverlay();

        if (this._legendLabelGroup) {
            this.scene.remove(this._legendLabelGroup);
            this._legendLabelGroup.traverse(obj => {
                if (obj.isSprite && obj.material?.map) obj.material.map.dispose();
            });
            this._legendLabelGroup = null;
        }

        for (const comp of components) {
            const meshes = this._buildComponent(comp);
            const visibleMeshes = meshes.filter(Boolean);
            if (!visibleMeshes.length) continue;
            const componentId = comp.id || `${String(comp.type || 'UNKNOWN').toUpperCase()}-${this._componentMeshIndex.size + 1}`;
            this._componentMeshIndex.set(componentId, visibleMeshes);
            visibleMeshes.forEach((m) => {
                m.userData = {
                    ...m.userData,
                    ...comp,
                    componentId,
                };
                this._componentGroup.add(m);
            });
        }

        this.scene.add(this._componentGroup);
        // Snap grid to the bottom of the model so it sits at the model's base, not a fixed y=-500.
        if (this._gridHelper && !this._componentGroup.children.length === false) {
            const modelBox = new THREE.Box3().setFromObject(this._componentGroup);
            if (!modelBox.isEmpty()) this._gridHelper.position.y = modelBox.min.y;
        }
        this._applyCurrentSectionClipping();
        if (this._onSelectionChange) this._onSelectionChange(null);
        // Auto-fit camera before placing overlay labels so screen-space projection is accurate.
        if (components.length > 0) this._fitCamera();
        this._updateOverlayGeometryAnchors(components);
        this._rebuildLegendLabels(components);
        this._rebuildLengthLabels(components);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.MESSAGE_CIRCLE, !!this.viewerConfig?.nodes?.enabled);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.MESSAGE_SQUARE, this.viewerConfig?.overlay?.annotations?.messageSquareEnabled !== false);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.LENGTH, !!this.viewerConfig?.lengthLabels?.enabled);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.SPARE_1, !!this.viewerConfig?.spareOverlays?.spare1?.enabled);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.SPARE_2, !!this.viewerConfig?.spareOverlays?.spare2?.enabled);
        this.setOverlayLayerField(OVERLAY_LAYER_IDS.SPARE_1, this.viewerConfig?.spareOverlays?.spare1?.selectedField || '');
        this.setOverlayLayerField(OVERLAY_LAYER_IDS.SPARE_2, this.viewerConfig?.spareOverlays?.spare2?.selectedField || '');
        this._renderHeatmapPanel();
        this.rebuildOverlayLayers();
        this._emitTrace('render-complete', { rendered: this._componentMeshIndex.size });
    }

    /** @private */
    _buildComponent(comp) {
        const { type, points, centrePoint, branch1Point, bore, coOrds } = comp;
        const radius = (bore || 50) / 2;
        const color = this._palette[type] ?? this._palette.UNKNOWN;

        let meshes = [];

        switch (type) {
            case 'PIPE':
                meshes = this._buildPipe(points, radius, color);
                break;
            case 'ELBOW':
            case 'BEND':
                meshes = this._buildElbow(points, centrePoint, radius, color);
                break;
            case 'TEE':
                meshes = this._buildTee(points, centrePoint, branch1Point, radius, color);
                break;
            case 'OLET':
                meshes = this._buildOlet(points, centrePoint, branch1Point, radius, color, comp);
                break;
            case 'SUPPORT':
            case 'ANCI': {
                const pt = coOrds || (points && points[0]);
                if (pt) {
                    const pos = mapCoord(pt);

                    // Critical Fix: Supports often have bore=0 in PCF. 
                    // This causes radius=25, which hides the support *inside* a large pipe (e.g., bore=400).
                    // We must inherit a realistic radius so the support geometry wraps outside the pipe.
                    let supportRadius = radius;
                    if (bore === 0 || !bore) {
                        let maxR = 25;
                        if (this._lastComponentsCache) {
                            for (const c of this._lastComponentsCache) {
                                if (c.bore && c.bore > maxR * 2) maxR = c.bore / 2;
                            }
                        }
                        supportRadius = maxR;
                    }
                    meshes = this._buildSupport(pos, supportRadius, comp);
                }
                break;
            }
            case 'FLANGE':
                meshes = this._buildFlange(points, radius, color);
                break;
            case 'VALVE':
                meshes = this._buildValve(points, radius, color);
                break;
            case 'REDUCER':
            case 'REDU':
                meshes = this._buildReducer(points, bore, color, comp);
                break;
            default:
                meshes = this._buildGeneric(points, radius, color, type);
        }

        return meshes;
    }

    /** @private */
    _buildPipe(points, radius, color) {
        if (!points || points.length < 2) return [];
        const s = mapCoord(points[0]);
        const e = mapCoord(points[1]);
        const cyl = createCylinder(s, e, radius, color);
        return cyl ? [cyl] : [];
    }

    /** @private */
    _buildElbow(points, centrePoint, radius, color) {
        if (!points || points.length < 2) return [];
        const p1 = mapCoord(points[0]);
        const p2 = mapCoord(points[1]);
        const c = centrePoint ? mapCoord(centrePoint) : null;
        if (!c) {
            console.warn(`[Viewer3D] System Log: Centre point missing for ELBOW/BEND between ${p1.x},${p1.y},${p1.z} and ${p2.x},${p2.y},${p2.z}`);
            const cyl = createCylinder(p1, p2, radius, color);
            return cyl ? [cyl] : [];
        }
        const v1 = p1.clone().sub(c);
        const v2 = p2.clone().sub(c);
        if (v1.length() < 0.1 || v2.length() < 0.1) {
            const cyl = createCylinder(p1, p2, radius, color);
            return cyl ? [cyl] : [];
        }
        const d1 = v1.clone().normalize();
        const d2 = v2.clone().normalize();
        const dot = THREE.MathUtils.clamp(d1.dot(d2), -1, 1);
        const angle = Math.acos(dot);

        // Degenerate or almost straight/opposed geometry: render as a straight run.
        if (angle < 0.05 || Math.abs(Math.PI - angle) < 0.05) {
            const cyl = createCylinder(p1, p2, radius, color);
            return cyl ? [cyl] : [];
        }

        const normal = new THREE.Vector3().crossVectors(d1, d2);
        if (normal.length() < 1e-4) {
            const cyl = createCylinder(p1, p2, radius, color);
            return cyl ? [cyl] : [];
        }
        normal.normalize();

        const arcRadius = Math.min(v1.length(), v2.length());
        if (arcRadius < radius * 0.5) {
            // Arc radius too small to form a visible curve Ã¢â‚¬â€ render as straight line
            const cyl = createCylinder(p1, p2, radius, color);
            return cyl ? [cyl] : [];
        }

        // Tangent points on the arc: where the straight pipe legs meet the curved section
        const arcStart = c.clone().addScaledVector(d1, arcRadius);
        const arcEnd   = c.clone().addScaledVector(d2, arcRadius);

        // Cubic Bezier arc approximation for a circular arc of sweep angle ÃŽÂ¸:
        //   alpha = (4/3) * tan(ÃŽÂ¸/4)
        // This is the established formula for circle-quadrant Bezier approximation.
        // sweepAngle is the interior bend angle seen at the elbow centreline.
        const sweepAngle = Math.PI - angle;   // supplement of the angle between leg directions
        const alpha = (4 / 3) * Math.tan(sweepAngle / 4);

        // Control points: start at tangent point, move inward along the leg direction toward c
        const cp1 = arcStart.clone().addScaledVector(d1, -alpha * arcRadius);
        const cp2 = arcEnd.clone().addScaledVector(d2, -alpha * arcRadius);
        const bendCurve = new THREE.CubicBezierCurve3(arcStart, cp1, cp2, arcEnd);

        const straight1 = p1.distanceTo(arcStart) > 0.1 ? createCylinder(p1, arcStart, radius, color) : null;
        const straight2 = arcEnd.distanceTo(p2)   > 0.1 ? createCylinder(arcEnd, p2,   radius, color) : null;
        const bend      = createTubeFromCurve(bendCurve, radius, color, 32, 16);

        return [straight1, bend, straight2].filter(Boolean);
    }


    /** @private */
    _buildTee(points, centrePoint, branch1Point, radius, color) {
        if (!centrePoint) return this._buildGeneric(points, radius, color, 'TEE');
        const c = mapCoord(centrePoint);
        const meshes = [];

        if (points && points[0]) {
            const p1 = mapCoord(points[0]);
            const leg = createCylinder(p1, c, radius, color);
            if (leg) meshes.push(leg);
        }
        if (points && points[1]) {
            const p2 = mapCoord(points[1]);
            const leg = createCylinder(c, p2, radius, color);
            if (leg) meshes.push(leg);
        }
        if (branch1Point) {
            const b = mapCoord(branch1Point);
            const leg = createCylinder(c, b, radius * 0.8, color);
            if (leg) meshes.push(leg);
        }

        // Sphere at junction
        meshes.push(createSphere(c, radius * 1.2, color));
        return meshes;
    }



    /** @private Ã¢â‚¬â€ OLET: centre point with a single branch leg */
    _buildOlet(points, centrePoint, branch1Point, radius, color, comp) {
        const c = centrePoint ? mapCoord(centrePoint) : null;
        const b = branch1Point ? mapCoord(branch1Point) : null;

        // Base is STRICTLY the centre point. Do not guess from ep1/ep2 fallbacks.
        const base = c;
        if (!base) return this._buildGeneric(points, radius, color, 'OLET');

        // Use branch bore from branch1Point.bore (PCF 4th column) if available
        const runRadius = Math.max(radius, 1);
        const branchBore = (branch1Point?.bore && branch1Point.bore > 0) ? branch1Point.bore : (comp?.bore || radius * 2);
        const branchRadius = Math.max(branchBore / 2, runRadius * 0.15);

        let branch = b;

        // Resolve branch from neighboring connected pipes if missing
        if (!branch && this._lastComponentsCache && comp) {
            const p1 = points && points[0] ? mapCoord(points[0]) : null;
            const p2 = points && points[1] ? mapCoord(points[1]) : null;
            for (const other of this._lastComponentsCache) {
                if (other === comp || !other.points) continue;
                const pt1 = other.points[0] ? mapCoord(other.points[0]) : null;
                const pt2 = other.points[1] ? mapCoord(other.points[1]) : null;

                if (pt1 && pt2) {
                    let dir = null;
                    if (pt1.distanceTo(base) < 0.1) {
                        dir = pt2.clone().sub(pt1).normalize();
                    } else if (pt2.distanceTo(base) < 0.1) {
                        dir = pt1.clone().sub(pt2).normalize();
                    }

                    if (dir) {
                        let isRun = false;
                        if (p1 && p2) {
                            const runDir = p2.clone().sub(p1).normalize();
                            if (Math.abs(dir.dot(runDir)) > 0.95) isRun = true;
                        }
                        if (!isRun) {
                            branch = base.clone().add(dir.multiplyScalar(branchRadius * 3));
                            break;
                        }
                    }
                }
            }
        }

        const meshes = [];
        if (branch && base.distanceTo(branch) > 0.1) {
            const stubLen = base.distanceTo(branch);
            // Main branch cylinder
            const leg = createCylinder(base, branch, branchRadius, color);
            if (leg) meshes.push(leg);

            // Flange ring at the base (run pipe connection weldolet)
            const dir = branch.clone().sub(base).normalize();
            const flange = createDisc(base, dir, Math.max(branchRadius * 1.5, runRadius * 0.6), Math.min(branchRadius * 0.3, stubLen * 0.15), color);
            if (flange) meshes.push(flange);

            // End cap sphere at branch tip
            const tipSphere = createSphere(branch, branchRadius * 0.8, color);
            meshes.push(tipSphere);
        } else {
            // Unresolved branch Ã¢â‚¬â€ show red marker sphere
            meshes.push(createSphere(base, runRadius * 0.9, 0xff0000));
        }

        // Connection sphere at run-pipe centre
        meshes.push(createSphere(base, Math.max(branchRadius * 1.1, runRadius * 0.55), color));

        return meshes;
    }

    /** @private Ã¢â‚¬â€ Reducer: tapered cone between EP1 (large bore) and EP2 (small bore) */
    _buildReducer(points, bore, color, comp) {
        if (!points || points.length < 2) return this._buildGeneric(points, bore / 2 || 25, color, 'REDUCER');
        const s = mapCoord(points[0]);
        const e = mapCoord(points[1]);
        if (!s || !e) return [];
        const diff = new THREE.Vector3().subVectors(e, s);
        const len = diff.length();
        if (len < 0.1) return [];

        // Determine start bore (large) and end bore (small) from per-point bore data
        const r1 = Math.max((points[0]?.bore ?? bore) / 2, 1);
        const r2 = Math.max((points[1]?.bore ?? bore * 0.6) / 2, 1);
        const rLarge = Math.max(r1, r2);
        const rSmall = Math.min(r1, r2);

        // If the bores are essentially the same it degenerates to a pipe Ã¢â‚¬â€ guard against it
        const radiusRatio = rSmall / rLarge;
        const isTapered = radiusRatio < 0.98;

        const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
        const axis = new THREE.Vector3(0, 1, 0);
        const dir = diff.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(axis, dir);

        const meshes = [];

        if (isTapered) {
            // Main tapered cone body
            const geo = new THREE.CylinderGeometry(
                r2,    // top radius (small end)
                r1,    // bottom radius (large end)
                len,
                20,    // radial segments Ã¢â‚¬â€ smooth
                1,     // height segments
                false  // open ended
            );
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.18 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(mid);
            mesh.quaternion.copy(quat);
            meshes.push(mesh);

            // End caps Ã¢â‚¬â€ flat discs to close the cone
            const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
            const capLarge = new THREE.Mesh(new THREE.CircleGeometry(r1, 20), capMat);
            capLarge.position.copy(s);
            capLarge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate());
            meshes.push(capLarge);
            const capSmall = new THREE.Mesh(new THREE.CircleGeometry(r2, 20), capMat);
            capSmall.position.copy(e);
            capSmall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            meshes.push(capSmall);
        } else {
            // Effectively a uniform pipe section
            const cyl = createCylinder(s, e, rLarge, color);
            if (cyl) meshes.push(cyl);
        }

        return meshes;
    }

    /** @private Ã¢â‚¬â€ Flange: two thick discs + thin web between EP1 and EP2 */
    _buildFlange(points, radius, color) {
        if (!points || points.length < 2) return [];
        const s = mapCoord(points[0]);
        const e = mapCoord(points[1]);
        const diff = new THREE.Vector3().subVectors(e, s);
        const len = diff.length();
        if (len < 0.1) return [];
        const normal = diff.clone().normalize();
        const discR = radius * 2.0;    // flange rim wider than pipe
        // Disc thickness: fixed visual size (half-bore), capped so discs never exceed 40% of span.
        // This prevents stretched-disc artefacts when EP1Ã¢â€ â€™EP2 span is large (e.g. pass-0 raw data).
        const discT = Math.min(radius * 0.5, len * 0.4);
        const webT  = Math.max(len - discT * 2, radius * 0.1); // web fills remaining gap
        const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
        const q1 = s.clone().lerp(mid, 0.15);
        const q2 = e.clone().lerp(mid, 0.15);
        const meshes = [
            createDisc(q1, normal, discR, discT, color),
            createDisc(q2, normal, discR, discT, color),
            createCylinder(q1, q2, radius * 0.85, 0xaaaaaa),  // web (lighter)
        ];
        return meshes.filter(Boolean);
    }

    /** @private Ã¢â‚¬â€ Valve: two flanges + central sphere (ball valve silhouette) */
    _buildValve(points, radius, color) {
        if (!points || points.length < 2) return [];
        const s = mapCoord(points[0]);
        const e = mapCoord(points[1]);
        const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
        const normal = new THREE.Vector3().subVectors(e, s).normalize();
        const fColor = COLORS.FLANGE;
        const discR = radius * 1.8;
        const discT = radius * 0.5;
        const q1 = s.clone().lerp(mid, 0.25);
        const q2 = e.clone().lerp(mid, 0.25);
        return [
            createDisc(q1, normal, discR, discT, fColor),
            createDisc(q2, normal, discR, discT, fColor),
            createSphere(mid, radius * 1.5, color),   // ball body
            createCylinder(q1, q2, radius * 0.7, 0xaaaaaa), // body tube
        ].filter(Boolean);
    }

    /** @private Ã¢â‚¬â€ Support graphic based on subtype */
    _buildSupport(pos, radius, comp) {
        const supportScale = Number(this.viewerConfig?.supportGeometry?.symbolScale || 2);
        const r = radius * (Number.isFinite(supportScale) ? supportScale : 2);
        const color = this._palette.SUPPORT;
        const anchorColor = this._palette.ANCI;
        const supportMat = _supportMaterial(color);
        const anchorMat = _supportMaterial(anchorColor);
        const up = new THREE.Vector3(0, 1, 0);
        const attrs = comp.attributes || {};
        const supportText = _supportTextFromAttributes(attrs);
        const supportDirection = _supportDirectionFromText(supportText);

        const declaredKind = _supportKindFromToken(attrs.SUPPORT_KIND || attrs['SUPPORT-KIND'] || '');
        let supportKind = declaredKind || _supportKindFromText(supportText);
        const explicitRest = /\bRST\b|\bREST\b|\+Y\s*(SUPPORT|RESTRAINT)\b|\bY\s*(SUPPORT|RESTRAINT)\b|\+Y\b/.test(supportText);
        const supportDofs = _dofsFromText(attrs.SUPPORT_DOFS || attrs['SUPPORT-DOFS'] || '');
        const dofSet = new Set(supportDofs);
        const dofRest = dofSet.size === 1 && dofSet.has(2);
        const dofAnchor = dofSet.size >= 6;
        const dofGuide = dofSet.size > 0 && [...dofSet].every(v => v === 1 || v === 3);
        const axisSemanticKind = _semanticSupportKindFromAxisCosinesText(attrs.AXIS_COSINES || attrs['AXIS-COSINES'] || '');

        if (dofAnchor) supportKind = 'ANCHOR';
        else if (dofRest) supportKind = 'REST';
        else if (dofGuide && supportKind === 'UNKNOWN') supportKind = 'GUIDE';
        else if (axisSemanticKind === 'REST' && supportKind !== 'ANCHOR') supportKind = 'REST';
        else if (axisSemanticKind === 'GUIDE' && supportKind === 'UNKNOWN') supportKind = 'GUIDE';
        if (explicitRest && supportKind !== 'ANCHOR') supportKind = 'REST';

        const isFixed = supportKind === 'ANCHOR';
        let supportAxis = _axisFromCosinesText(attrs.AXIS_COSINES || attrs['AXIS-COSINES'] || '');

        if (!supportAxis) {
            supportAxis = _axisFromSupportDirection(supportDirection);
            if (supportAxis && supportKind === 'UNKNOWN') {
                supportKind = supportDirection === 'UP' || supportDirection === 'DOWN' ? 'REST' : 'GUIDE';
            }
        }

        const pipeAxis = _axisFromCosinesText(attrs.PIPE_AXIS_COSINES || attrs['PIPE-AXIS-COSINES'] || '');

        if (supportAxis && !isFixed) {
            const verticalness = Math.abs(supportAxis.dot(up));
            if (supportKind === 'UNKNOWN' && pipeAxis && verticalness < 0.75) {
                const axialness = Math.abs(supportAxis.dot(pipeAxis.clone().normalize()));
                supportKind = axialness >= 0.75 ? 'STOP' : 'GUIDE';
            }
            if (supportKind === 'REST' || supportKind === 'SPRING') {
                // keep explicit rest vertical
            } else if (verticalness > 0.75) {
                if (supportKind === 'GUIDE' || supportKind === 'STOP') {
                    debugSupport({
                        stage: 'viewer-build-support',
                        componentId: comp.id,
                        supportName: attrs.SUPPORT_NAME,
                        supportKind,
                        supportDirection: attrs.SUPPORT_DIRECTION,
                        axisCosines: attrs.AXIS_COSINES,
                        pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                        dropped: true,
                        dropReason: 'guide-or-stop-axis-too-vertical',
                        renderBranch: 'dropped',
                    });
                    return [];
                }
                if (supportKind === 'UNKNOWN') supportKind = 'REST';
            } else if (verticalness < 0.35) {
                if (supportKind === 'UNKNOWN' && !pipeAxis) {
                    debugSupport({
                        stage: 'viewer-build-support',
                        componentId: comp.id,
                        supportName: attrs.SUPPORT_NAME,
                        supportKind,
                        supportDirection: attrs.SUPPORT_DIRECTION,
                        axisCosines: attrs.AXIS_COSINES,
                        pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                        dropped: true,
                        dropReason: 'missing-pipe-axis-for-cardinal-support',
                        renderBranch: 'dropped',
                    });
                    return [];
                }
                if (supportKind === 'UNKNOWN') supportKind = 'GUIDE';
            } else {
                debugSupport({
                    stage: 'viewer-build-support',
                    componentId: comp.id,
                    supportName: attrs.SUPPORT_NAME,
                    supportKind,
                    supportDirection: attrs.SUPPORT_DIRECTION,
                    axisCosines: attrs.AXIS_COSINES,
                    pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                    dropped: true,
                    dropReason: 'axis-mid-tilt-unsupported',
                    renderBranch: 'dropped',
                });
                return [];
            }
        } else if (supportKind === 'UNKNOWN') {
            supportKind = 'REST';
        }

        if (supportKind === 'RIGID') supportKind = 'ANCHOR';
        const frame = _buildSupportFrame(pipeAxis, supportAxis);
        const lateralAxis = frame.lateral;
        const verticalAxis = frame.vertical;
        const pipeDir = frame.pipe;
        const gravityOnPipe = verticalAxis.clone().negate().projectOnPlane(pipeDir);
        const bottomDir = gravityOnPipe.length() >= 0.01
            ? gravityOnPipe.normalize()
            : verticalAxis.clone().negate();
        const sideNudge = lateralAxis ? lateralAxis.clone().multiplyScalar(r * 0.18) : new THREE.Vector3();
        const bottomTip = bottomDir.clone().multiplyScalar(r * 1.02).add(sideNudge);
        const bottomStart = bottomDir.clone().multiplyScalar(r * 2.1).add(sideNudge);
        const verticalTip = verticalAxis.clone().multiplyScalar(-r * 1.02);
        const verticalStart = verticalAxis.clone().multiplyScalar(-r * 2.1);

        let renderBranch = 'unknown';
        let warning = '';

        if (supportKind === 'ANCHOR') {
            renderBranch = 'anchor';
            debugSupport({
                stage: 'viewer-build-support',
                componentId: comp.id,
                supportName: attrs.SUPPORT_NAME,
                supportKind,
                supportDirection: attrs.SUPPORT_DIRECTION,
                axisCosines: attrs.AXIS_COSINES,
                pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                bore: comp.bore,
                renderBranch,
            });

            const plateSize = r * 1.7;
            const thickness = Math.max(r * 0.24, 0.08 * r);
            const plate = new THREE.Mesh(new THREE.BoxGeometry(plateSize, plateSize, thickness), anchorMat);
            plate.position.copy(verticalAxis).multiplyScalar(-r * 0.1);
            const normal = supportAxis && supportAxis.length() >= 0.01 ? supportAxis.clone().normalize() : verticalAxis;
            plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            return [createSupportAssembly(pos, [plate])];
        }

        if (supportKind === 'GUIDE') {
            renderBranch = 'guide';
            if (!lateralAxis) {
                debugSupport({
                    stage: 'viewer-build-support',
                    componentId: comp.id,
                    supportName: attrs.SUPPORT_NAME,
                    supportKind,
                    supportDirection: attrs.SUPPORT_DIRECTION,
                    dropped: true,
                    dropReason: 'missing-lateral-axis',
                    renderBranch: 'dropped',
                });
                return [];
            }

            debugSupport({
                stage: 'viewer-build-support',
                componentId: comp.id,
                supportName: attrs.SUPPORT_NAME,
                supportKind,
                supportDirection: attrs.SUPPORT_DIRECTION,
                axisCosines: attrs.AXIS_COSINES,
                pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                bore: comp.bore,
                renderBranch,
            });

            const lateral = lateralAxis.clone().normalize();
            return [createSupportAssembly(pos, [
                createArrowBetween(
                    lateral.clone().multiplyScalar(r * 2.0),
                    lateral.clone().multiplyScalar(r * 1.02),
                    color,
                    supportMat,
                    r
                ),
                createArrowBetween(
                    lateral.clone().multiplyScalar(-r * 2.0),
                    lateral.clone().multiplyScalar(-r * 1.02),
                    color,
                    supportMat,
                    r
                ),
                createArrowBetween(bottomStart, bottomTip, color, supportMat, r),
            ].filter(Boolean))];
        }

        if (supportKind === 'REST') {
            renderBranch = 'rest';
            if ((attrs.SUPPORT_TAG || '').toUpperCase().includes('GUIDE') || (attrs.SUPPORT_TAG || '').toUpperCase().includes('STOP')) {
                warning = 'renderer-fallback';
            }

            debugSupport({
                stage: 'viewer-build-support',
                componentId: comp.id,
                supportName: attrs.SUPPORT_NAME,
                supportKind,
                supportDirection: attrs.SUPPORT_DIRECTION,
                axisCosines: attrs.AXIS_COSINES,
                pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                bore: comp.bore,
                renderBranch,
                warning,
            });

            return [createSupportAssembly(pos, [
                createArrowBetween(verticalStart, verticalTip, color, supportMat, r),
            ].filter(Boolean))];
        }

        if (supportKind === 'SPRING') {
            renderBranch = 'spring';

            debugSupport({
                stage: 'viewer-build-support',
                componentId: comp.id,
                supportName: attrs.SUPPORT_NAME,
                supportKind,
                supportDirection: attrs.SUPPORT_DIRECTION,
                axisCosines: attrs.AXIS_COSINES,
                pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                bore: comp.bore,
                renderBranch,
            });

            const headLen = 0.4 * r;
            const pts = [];
            pts.push(verticalStart.clone());
            pts.push(verticalTip.clone().addScaledVector(verticalAxis, -headLen));
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
                color,
                linewidth: 2,
                scale: 1,
                dashSize: 3,
                gapSize: 3,
            }));
            line.computeLineDistances();
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.175 * r, headLen, 8), supportMat);
            head.position.copy(verticalTip).addScaledVector(verticalAxis, -headLen / 2);
            head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), verticalAxis.clone().normalize());
            return [createSupportAssembly(pos, [line, head])];
        }

        if (supportKind === 'STOP') {
            renderBranch = 'stop';
            if (!lateralAxis) {
                debugSupport({
                    stage: 'viewer-build-support',
                    componentId: comp.id,
                    supportName: attrs.SUPPORT_NAME,
                    supportKind,
                    supportDirection: attrs.SUPPORT_DIRECTION,
                    dropped: true,
                    dropReason: 'missing-lateral-axis',
                    renderBranch: 'dropped',
                });
                return [];
            }

            debugSupport({
                stage: 'viewer-build-support',
                componentId: comp.id,
                supportName: attrs.SUPPORT_NAME,
                supportKind,
                supportDirection: attrs.SUPPORT_DIRECTION,
                axisCosines: attrs.AXIS_COSINES,
                pipeAxisCosines: attrs.PIPE_AXIS_COSINES,
                bore: comp.bore,
                renderBranch,
            });

            const lateral = lateralAxis.clone().normalize();
            return [createSupportAssembly(pos, [
                createArrowBetween(
                    lateral.clone().multiplyScalar(r * 2.0),
                    lateral.clone().multiplyScalar(r * 1.02),
                    color,
                    supportMat,
                    r
                ),
                createArrowBetween(
                    lateral.clone().multiplyScalar(-r * 2.0),
                    lateral.clone().multiplyScalar(-r * 1.02),
                    color,
                    supportMat,
                    r
                ),
            ].filter(Boolean))];
        }

        debugSupport({
            stage: 'viewer-build-support',
            componentId: comp.id,
            supportName: attrs.SUPPORT_NAME,
            supportKind,
            supportDirection: attrs.SUPPORT_DIRECTION,
            dropped: true,
            dropReason: 'unknown-kind',
            renderBranch: 'dropped',
        });

        return [];
    }



    /** @private */
    _buildGeneric(points, radius, color, type) {
        if (!points || points.length < 2) return [];
        const s = mapCoord(points[0]);
        const e = mapCoord(points[1]);
        const r = radius;
        const cyl = createCylinder(s, e, r, color);
        return cyl ? [cyl] : [];
    }

    /** @private Ã¢â‚¬â€ auto-fit camera to scene bounds */
    _fitCamera() {
        const box = new THREE.Box3().setFromObject(this._componentGroup);
        if (box.isEmpty()) return;

        const centre = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        // Update orthographic frustum
        const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
        const fitPadding = Number(this.viewerConfig?.camera?.fitPadding || 0.8);
        const half = maxDim * fitPadding;
        this._orthoCamera.left = -half * aspect;
        this._orthoCamera.right = half * aspect;
        this._orthoCamera.top = half;
        this._orthoCamera.bottom = -half;

        const dist = maxDim * 1.5;
        this._orthoCamera.near = 0.1;
        this._orthoCamera.far = Math.max(1000, maxDim * 80, dist + maxDim * 20);
        this._orthoCamera.zoom = 1;
        this._orthoCamera.up.copy(_verticalVector());
        this._orthoCamera.position.set(
            centre.x + dist,
            centre.y + dist,
            centre.z + dist
        );
        this._orthoCamera.lookAt(centre);
        this._orthoCamera.updateProjectionMatrix();

        this._perspCamera.near = 0.1;
        this._perspCamera.far = Math.max(1000, maxDim * 80);
        this._perspCamera.up.copy(_verticalVector());
        this._perspCamera.position.set(
            centre.x + dist,
            centre.y + dist,
            centre.z + dist
        );
        this._perspCamera.lookAt(centre);
        this._perspCamera.updateProjectionMatrix();

        if (this._projectionMode === 'perspective') {
            this.camera = this._perspCamera;
        } else {
            this.camera = this._orthoCamera;
        }

        if (this.controls) {
            this.controls.object = this.camera;
            this.controls.target.copy(centre);
            this.controls.update();
        }
        this._queueOverlayRefresh();
        this._emitTrace('fit-all', { maxDim });
    }

    _bindInteractions() {
        this._onPointerDown = (event) => {
            if (!this._componentGroup || !this.camera || !this.renderer) return;
            const rect = this.renderer.domElement.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this._raycaster.setFromCamera(this._pointer, this.camera);
            const hits = this._raycaster.intersectObject(this._componentGroup, true);
            let picked = null;
            for (const entry of hits) {
                let obj = entry.object || null;
                while (obj && !obj.userData?.componentId) obj = obj.parent || null;
                if (obj?.userData?.componentId) {
                    picked = {
                        componentId: obj.userData.componentId,
                        point: entry.point?.clone?.() || null,
                    };
                    break;
                }
            }
            if (!picked) {
                if (this._navMode === 'measure') {
                    this._emitTrace('measure-miss', {});
                }
                return;
            }
            if (this._navMode === 'measure') {
                this._captureMeasurePoint(picked.point, picked.componentId);
                this._emitTrace('pointer-measure', {
                    componentId: picked.componentId || null,
                    point: picked.point?.toArray?.() || [],
                });
                return;
            }
            this._selectComponent(picked.componentId);
            this._emitTrace('pointer-select', { componentId: picked.componentId || null });
        };
        this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    }

    _clearSelection() {
        if (!this._selectedOriginalMaterials.length) {
            this._selectedComponentId = null;
            return;
        }
        for (const entry of this._selectedOriginalMaterials) {
            const current = entry.mesh?.material;
            if (Array.isArray(current)) current.forEach((m) => m?.dispose?.());
            else current?.dispose?.();
            if (entry.mesh) entry.mesh.material = entry.material;
        }
        this._selectedOriginalMaterials = [];
        this._selectedComponentId = null;
    }

    clearSelection() {
        this._clearSelection();
        if (this._onSelectionChange) this._onSelectionChange(null);
        this._emitTrace('selection-clear', {});
    }

    selectComponent(componentOrId) {
        const componentId = typeof componentOrId === 'string'
            ? componentOrId
            : componentOrId?.id;
        if (!componentId) return;
        this._selectComponent(componentId);
    }

    _selectComponent(componentId) {
        if (!componentId || this._selectedComponentId === componentId) return;
        this._clearSelection();
        const meshes = this._componentMeshIndex.get(componentId);
        if (!meshes?.length) return;
        this._selectedComponentId = componentId;
        for (const mesh of meshes) {
            const originalMaterial = mesh.material;
            const selectedMaterial = Array.isArray(originalMaterial)
                ? originalMaterial.map((m) => this._makeSelectedMaterial(m))
                : this._makeSelectedMaterial(originalMaterial);
            this._selectedOriginalMaterials.push({ mesh, material: originalMaterial });
            mesh.material = selectedMaterial;
        }
        const box = new THREE.Box3();
        meshes.forEach((mesh) => box.expandByObject(mesh));
        const selected = meshes[0]?.userData || null;
        if (this._onSelectionChange) this._onSelectionChange(selected);
        this._emitTrace('selection-change', { componentId, componentType: selected?.type || null });
    }

    _measurementAxisBasis() {
        const srcX = mapCoord({ x: 1, y: 0, z: 0 }) || new THREE.Vector3(1, 0, 0);
        const srcY = mapCoord({ x: 0, y: 1, z: 0 }) || new THREE.Vector3(0, 1, 0);
        const srcZ = mapCoord({ x: 0, y: 0, z: 1 }) || new THREE.Vector3(0, 0, 1);
        return {
            x: srcX.clone().normalize(),
            y: srcY.clone().normalize(),
            z: srcZ.clone().normalize(),
        };
    }

    _axisAlignedDelta(start, end) {
        const delta = end.clone().sub(start);
        const basis = this._measurementAxisBasis();
        return {
            dx: delta.dot(basis.x),
            dy: delta.dot(basis.y),
            dz: delta.dot(basis.z),
            basis,
        };
    }

    _captureMeasurePoint(point, componentId) {
        if (!point) return;
        if (this._measurePoints.length >= 2) {
            this._clearMeasureOverlay();
        }
        this._measurePoints.push(point.clone());
        const index = this._measurePoints.length;
        this._renderMeasurePoint(point, index);
        this._emitTrace('measure-point', {
            componentId: componentId || null,
            index,
            point: point.toArray(),
        });
        if (index === 2) {
            const start = this._measurePoints[0];
            const end = this._measurePoints[1];
            const distance = start.distanceTo(end);
            const aligned = this._axisAlignedDelta(start, end);
            const dx = aligned.dx;
            const dy = aligned.dy;
            const dz = aligned.dz;
            this._renderMeasureSegment(start, end, {
                distance,
                dx,
                dy,
                dz,
                basisX: aligned.basis.x.toArray(),
                basisY: aligned.basis.y.toArray(),
                basisZ: aligned.basis.z.toArray(),
            });
            this._reportMeasurement({
                componentId: componentId || null,
                distance,
                dx,
                dy,
                dz,
                absDx: Math.abs(dx),
                absDy: Math.abs(dy),
                absDz: Math.abs(dz),
                axisMode: CURRENT_VERTICAL_AXIS,
                start: start.toArray(),
                end: end.toArray(),
            });
            this._emitTrace('measure-complete', {
                componentId: componentId || null,
                distance,
                dx,
                dy,
                dz,
                absDx: Math.abs(dx),
                absDy: Math.abs(dy),
                absDz: Math.abs(dz),
                axisMode: CURRENT_VERTICAL_AXIS,
                start: start.toArray(),
                end: end.toArray(),
            });
        } else {
            this._reportMeasurement(null);
        }
    }

    _renderMeasurePoint(point, index) {
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(18, 18, 18),
            new THREE.MeshBasicMaterial({ color: index === 1 ? 0x7dd3fc : 0xfbbf24, depthTest: false })
        );
        marker.position.copy(point);
        this._measureOverlayGroup.add(marker);
        this._measureVisuals.push(marker);
    }

    _renderMeasureSegment(start, end, summary) {
        const distance = Number(summary?.distance || 0);
        const dx = Number(summary?.dx || 0);
        const dy = Number(summary?.dy || 0);
        const dz = Number(summary?.dz || 0);
        const basisX = Array.isArray(summary?.basisX)
            ? new THREE.Vector3().fromArray(summary.basisX).normalize()
            : new THREE.Vector3(1, 0, 0);
        const basisY = Array.isArray(summary?.basisY)
            ? new THREE.Vector3().fromArray(summary.basisY).normalize()
            : new THREE.Vector3(0, 1, 0);
        const basisZ = Array.isArray(summary?.basisZ)
            ? new THREE.Vector3().fromArray(summary.basisZ).normalize()
            : new THREE.Vector3(0, 0, 1);

        const addLine = (from, to, color, dashed = false, dashSize = 70, gapSize = 36) => {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([from, to]);
            const lineMaterial = dashed
                ? new THREE.LineDashedMaterial({
                    color,
                    dashSize,
                    gapSize,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                })
                : new THREE.LineBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.9,
                    depthTest: false,
                });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            if (dashed) line.computeLineDistances();
            this._measureOverlayGroup.add(line);
            this._measureVisuals.push(line);
            return line;
        };

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const lineMaterial = new THREE.LineDashedMaterial({
            color: 0xf8fafc,
            dashSize: 85,
            gapSize: 42,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.computeLineDistances();
        this._measureOverlayGroup.add(line);
        this._measureLine = line;

        const dir = end.clone().sub(start);
        const length = dir.length();
        if (length > 0.1) {
            const unitDir = dir.clone().normalize();
            const arrowLength = Math.max(24, Math.min(100, length * 0.14));
            const arrowRadius = Math.max(7, Math.min(20, arrowLength * 0.34));
            const coneGeometry = new THREE.ConeGeometry(arrowRadius, arrowLength, 12);
            const coneMaterial = new THREE.MeshBasicMaterial({ color: 0xf8fafc, depthTest: false });
            const headA = new THREE.Mesh(coneGeometry, coneMaterial);
            headA.position.copy(start.clone().addScaledVector(unitDir, arrowLength * 0.5));
            headA.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unitDir);
            const headB = new THREE.Mesh(coneGeometry, coneMaterial.clone());
            headB.position.copy(end.clone().addScaledVector(unitDir, -arrowLength * 0.5));
            headB.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unitDir.clone().negate());
            this._measureOverlayGroup.add(headA);
            this._measureOverlayGroup.add(headB);
            this._measureVisuals.push(headA);
            this._measureVisuals.push(headB);
        }

        // Axis component lines for CAD-like dimensional reading.
        const xPoint = start.clone().addScaledVector(basisX, dx);
        const xyPoint = xPoint.clone().addScaledVector(basisY, dy);
        const xyzPoint = xyPoint.clone().addScaledVector(basisZ, dz);
        if (Math.abs(dx) > 0.001) addLine(start, xPoint, 0xff7373, false);
        if (Math.abs(dy) > 0.001) addLine(xPoint, xyPoint, 0x84f5a3, false);
        if (Math.abs(dz) > 0.001) addLine(xyPoint, xyzPoint, 0x7dbdff, false);

        const midpoint = start.clone().lerp(end, 0.5);
        this.setOverlayLayerData(OVERLAY_LAYER_IDS.MEASURE, [{
            worldPos: midpoint,
            text: `${distance.toFixed(1)} mm | dx ${dx.toFixed(1)} dy ${dy.toFixed(1)} dz ${dz.toFixed(1)}`,
            lift: 0,
        }]);
        this.setOverlayLayerVisibility(OVERLAY_LAYER_IDS.MEASURE, true);
    }

    _clearMeasureOverlay() {
        const hadMeasure =
            this._measurePoints.length > 0 ||
            this._measureVisuals.length > 0 ||
            !!this._measureLine;
        this._measurePoints = [];
        this._reportMeasurement(null);
        this.setOverlayLayerData(OVERLAY_LAYER_IDS.MEASURE, []);
        if (this._measureLine) {
            if (this._measureLine.geometry) this._measureLine.geometry.dispose();
            if (this._measureLine.material) this._measureLine.material.dispose();
            this._measureOverlayGroup.remove(this._measureLine);
            this._measureLine = null;
        }
        for (const visual of this._measureVisuals) {
            if (visual.geometry) visual.geometry.dispose();
            if (visual.material) visual.material.dispose();
            this._measureOverlayGroup.remove(visual);
        }
        this._measureVisuals = [];
        if (hadMeasure) this._emitTrace('measure-cleared', {});
    }

    _makeSelectedMaterial(material) {
        if (!material?.clone) return material;
        const next = material.clone();
        if ('emissive' in next && next.emissive) {
            next.emissive = new THREE.Color(0x5dade2);
            next.emissiveIntensity = 0.45;
        }
        if ('color' in next && next.color) {
            next.color = next.color.clone().lerp(new THREE.Color(0xffffff), 0.18);
        }
        return next;
    }

    _resolvePalette() {
        const themeKey = state.viewerSettings?.themePreset || this.viewerConfig?.scene?.themePreset || 'NavisDark';
        const themePalette = THEME_PALETTES[themeKey] || THEME_PALETTES.NavisDark;
        const palette = { ...COLORS };
        for (const [k, hex] of Object.entries(themePalette)) {
            palette[k.toUpperCase()] = Number.parseInt(hex.slice(1), 16);
        }
        return palette;
    }

    _getThemeKey() {
        // _runtimeThemeKey takes precedence so setTheme() works even when viewerConfig is frozen.
        return this._runtimeThemeKey
            || state.viewerSettings?.themePreset
            || this.viewerConfig?.scene?.themePreset
            || 'NavisDark';
    }

    _resolveThemeStyle() {
        const themeKey = this._getThemeKey();
        return THEME_SCENE_STYLES[themeKey] || THEME_SCENE_STYLES.NavisDark;
    }

    _buildGridHelper(themeStyle) {
        const gridMajor = Number.parseInt(String(themeStyle.gridMajor || '#3a4255').replace('#', ''), 16);
        const gridMinor = Number.parseInt(String(themeStyle.gridMinor || '#252a3a').replace('#', ''), 16);

        const grid = new THREE.GridHelper(
            Number(this.viewerConfig?.helpers?.gridSize || 10000),
            Number(this.viewerConfig?.helpers?.gridDivisions || 20),
            gridMajor,
            gridMinor
        );
        grid.visible = this.viewerConfig?.helpers?.showGrid !== false;
        grid.rotation.x = 0;
        grid.position.y = -500;
        return grid;
    }

    _rebuildGridHelper(themeStyle) {
        if (this._gridHelper) {
            this.scene.remove(this._gridHelper);
            if (this._gridHelper.geometry) this._gridHelper.geometry.dispose();
            if (Array.isArray(this._gridHelper.material)) {
                this._gridHelper.material.forEach((m) => m?.dispose?.());
            } else if (this._gridHelper.material) {
                this._gridHelper.material.dispose();
            }
            this._gridHelper = null;
        }

        this._gridHelper = this._buildGridHelper(themeStyle);
        this.scene.add(this._gridHelper);
    }

    _applyThemeAppearance() {
        const themeStyle = this._resolveThemeStyle();
        const bgConfig = String(this.viewerConfig?.scene?.background || 'auto').toLowerCase();

        if (bgConfig === 'auto') {
            this.scene.background = new THREE.Color(themeStyle.background);
            if (this.renderer) this.renderer.setClearAlpha(1);
        } else {
            this.scene.background = new THREE.Color(this.viewerConfig?.scene?.background);
            if (this.renderer) this.renderer.setClearAlpha(1);
        }

        if (this._gridHelper) {
            this._rebuildGridHelper(themeStyle);
        }

        if (this._heatmapPanelEl) {
            this._heatmapPanelEl.style.background = themeStyle.panelBg;
            this._heatmapPanelEl.style.color = themeStyle.panelText;
        }

        this._queueOverlayRefresh();
    }

    setTheme(themeKey) {
        const next = String(themeKey || 'NavisDark');
        // Store on a mutable instance property instead of mutating the (possibly frozen) viewerConfig.
        this._runtimeThemeKey = next;

        // Update scene-level styling immediately.
        this._palette = this._resolvePalette();
        this._applyThemeAppearance();

        // Re-render cached components so mesh materials are rebuilt with the new palette.
        if (Array.isArray(this._lastComponentsCache)) {
            this.render(this._lastComponentsCache);
        }
    }

    _emitTrace(type, payload = {}) {
        if (typeof this._onTrace === 'function') {
            this._onTrace({ type, category: 'viewer3d', payload });
        }
    }

    setSectionMode(mode = 'OFF') {
        const normalized = String(mode || 'OFF').toUpperCase();
        this._sectionMode = normalized;
        this._removeSectionVisual();
        if (normalized === 'BOX') {
            this._buildBoxSectionPlanes();
        } else if (normalized === 'PLANE_UP') {
            this._buildPlaneUpSection();
        } else {
            this._clipPlanes = [];
        }
        this._applyCurrentSectionClipping();
        this._queueOverlayRefresh();
        this._emitTrace('section-mode', { mode: normalized });
    }

    disableSection() {
        this._sectionMode = 'OFF';
        this._clipPlanes = [];
        this._removeSectionVisual();
        this._applyCurrentSectionClipping();
        this._queueOverlayRefresh();
        this._emitTrace('section-disable', {});
    }

    _buildBoxSectionPlanes() {
        if (!this._componentGroup) return;
        const box = new THREE.Box3().setFromObject(this._componentGroup);
        if (box.isEmpty()) return;
        this._sectionBounds = box.clone();
        this._applyBoxPlanes(box);
        this._renderSectionBoxVisual(box);
    }

    _buildPlaneUpSection() {
        if (!this._componentGroup) return;
        const box = new THREE.Box3().setFromObject(this._componentGroup);
        if (box.isEmpty()) return;
        this._sectionBounds = box.clone();
        const centre = box.getCenter(new THREE.Vector3());
        const cut = centre.y;
        const normal = new THREE.Vector3(0, -1, 0);
        this._clipPlanes = [new THREE.Plane(normal, cut)];
        this._renderSectionPlaneVisual(normal, cut, box);
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
        if (!this._componentGroup || !this.renderer) return;
        const enabled = this._sectionMode !== 'OFF' && this._clipPlanes.length > 0;
        this.renderer.localClippingEnabled = enabled;
        this._componentGroup.traverse((obj) => {
            if (!obj?.material) return;
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of materials) {
                m.clippingPlanes = enabled ? this._clipPlanes : null;
                m.clipIntersection = this.viewerConfig?.supportGeometry?.clipIntersection === true;
                m.needsUpdate = true;
            }
        });
    }

    _removeSectionVisual() {
        if (this._sectionVisual) {
            this.scene.remove(this._sectionVisual);
            this._sectionVisual = null;
        }
    }

    getSectionBounds() {
        return this._sectionBounds ? this._sectionBounds.clone() : null;
    }

    setSectionBoxPadding(padding = 0) {
        if (this._sectionMode !== 'BOX' || !this._sectionBounds) this.setSectionMode('BOX');
        if (!this._sectionBounds) return;
        const sectionSize = this._sectionBounds.getSize(new THREE.Vector3());
        const minExtent = Math.max(1, Math.min(sectionSize.x, sectionSize.y, sectionSize.z));
        const maxExtent = Math.max(1, Math.max(sectionSize.x, sectionSize.y, sectionSize.z));
        const requested = Number(padding || 0);
        const minPad = -Math.max(1, minExtent * 0.45);
        const maxPad = Math.max(100, maxExtent * 2.5);
        const clamped = THREE.MathUtils.clamp(requested, minPad, maxPad);
        const box = this._sectionBounds.clone();
        box.expandByScalar(clamped);
        this._applyBoxPlanes(box);
        this._renderSectionBoxVisual(box);
        this._queueOverlayRefresh();
        this._emitTrace('section-box-adjust', { padding: clamped, requested });
    }

    setSectionPlaneOffset(offset = 0) {
        if (this._sectionMode !== 'PLANE_UP' || !this._sectionBounds) this.setSectionMode('PLANE_UP');
        if (!this._sectionBounds) return;
        const sectionSize = this._sectionBounds.getSize(new THREE.Vector3());
        const maxExtent = Math.max(1, Math.max(sectionSize.x, sectionSize.y, sectionSize.z));
        const requested = Number(offset || 0);
        const clamped = THREE.MathUtils.clamp(requested, -maxExtent * 2.5, maxExtent * 2.5);
        const centre = this._sectionBounds.getCenter(new THREE.Vector3());
        const cut = centre.y + clamped;
        const normal = new THREE.Vector3(0, -1, 0);
        this._clipPlanes = [new THREE.Plane(normal, cut)];
        this._renderSectionPlaneVisual(normal, cut, this._sectionBounds);
        this._applyCurrentSectionClipping();
        this._queueOverlayRefresh();
        this._emitTrace('section-plane-adjust', { offset: clamped, requested });
    }

    _renderSectionBoxVisual(box) {
        this._removeSectionVisual();
        const helper = new THREE.Box3Helper(box, new THREE.Color(0xffa500));
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.material.opacity = 0.35;
        this._sectionVisual = helper;
        this.scene.add(helper);
    }

    _renderSectionPlaneVisual(normal, constant, box) {
        this._removeSectionVisual();
        const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1000);
        const plane = new THREE.Plane(normal.clone().normalize(), constant);
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthTest: false });
        const mesh = new THREE.Mesh(geometry, material);
        const coplanarPoint = plane.coplanarPoint(new THREE.Vector3());
        const focal = new THREE.Vector3().copy(coplanarPoint).add(plane.normal);
        mesh.position.copy(coplanarPoint);
        mesh.lookAt(focal);
        this._sectionVisual = mesh;
        this.scene.add(mesh);
    }

    _applyUpVector() {
        CURRENT_VERTICAL_AXIS = this._verticalAxis;
        const upVec = _verticalVector();
        this.scene.up.copy(upVec);
        if (this._orthoCamera) {
            this._orthoCamera.up.copy(upVec);
        }
        if (this._perspCamera) {
            this._perspCamera.up.copy(upVec);
        }
        if (this.controls?.object) {
            this.controls.object.up.copy(upVec);
            this.controls.update();
        }
        this._queueOverlayRefresh();
    }

    applyHeatmap(options = {}) {
        if (!this._componentGroup) return;
        const metric = String(options.metric || 'T1');
        const palette = Array.isArray(options.palette) && options.palette.length
            ? options.palette
            : ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444'];
        let bucketCount = Math.max(2, Number(options.bucketCount || 5));
        if (bucketCount > palette.length) {
            console.warn(`[PcfViewer3D] heatmap bucketCount (${bucketCount}) exceeds palette length (${palette.length}); clamping.`);
            bucketCount = palette.length;
        }
        const nullColor = String(options.nullColor || '#6b7280');

        const values = [];
        const groups = new Map();
        for (const [componentId, meshes] of this._componentMeshIndex.entries()) {
            const source = meshes?.[0]?.userData?.source || {};
            const attrs = meshes?.[0]?.userData?.attributes || {};
            const value = this._metricValueFromSource(source, attrs, metric);
            groups.set(componentId, { meshes, value: Number.isFinite(value) ? value : null });
            if (Number.isFinite(value)) values.push(value);
        }

        if (!values.length) {
            this._emitTrace('heatmap-empty', { metric });
            return;
        }

        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = Math.max(1e-9, max - min);
        if (span < 1e-9) bucketCount = 1;

        for (const { meshes, value } of groups.values()) {
            const ratio = value === null ? null : (value - min) / span;
            const index = ratio === null
                ? -1
                : Math.min(palette.length - 1, Math.max(0, Math.floor(ratio * bucketCount)));
            const colorObj = new THREE.Color(index < 0 ? nullColor : palette[index]);
            for (const mesh of meshes) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                    if (mat?.color) mat.color.copy(colorObj);
                }
            }
        }

        this._heatmapState = { metric, min, max, bucketCount, palette };
        this._emitTrace('heatmap-apply', { metric, min, max, bucketCount });
        this._renderHeatmapPanel();
    }

    _metricValueFromSource(source = {}, attrs = {}, metric = 'T1') {
        let value = Number(source?.[metric]);
        if (!Number.isFinite(value)) value = Number(attrs?.[metric]);
        if (!Number.isFinite(value) && metric === 'T1') value = Number(source?.T1);
        if (!Number.isFinite(value) && metric === 'T2') value = Number(source?.T2);
        if (!Number.isFinite(value) && metric === 'P1') value = Number(source?.P1);
        if (!Number.isFinite(value) && metric === 'P2') value = Number(source?.P2);
        return value;
    }

    _rebuildLegendLabels(components) {
        const cfg = this.viewerConfig || {};
        if (this._legendLabelGroup) {
            this.scene.remove(this._legendLabelGroup);
            this._legendLabelGroup.traverse(obj => {
                if (obj.isSprite && obj.material?.map) obj.material.map.dispose();
            });
            this._legendLabelGroup = null;
        }
        if (cfg.disableAllSettings || cfg.legend?.canvasLabels?.enabled === false) return;
        const mode = cfg.legend?.mode || 'none';
        const wantLegendLabels = mode !== 'none';
        const wantNodeLabels = !!cfg.legend?.canvasLabels?.showNodeIds;
        if (!wantLegendLabels && !wantNodeLabels) return;
        const maxPerLabel = Number(cfg.legend?.canvasLabels?.maxPerLabel || 3);
        const maxLegendLabels = Number(cfg.legend?.canvasLabels?.maxLegendLabels || 36);
        const fontSize = Number(cfg.legend?.canvasLabels?.fontSize || 16);
        const textColor = cfg.legend?.canvasLabels?.textColor || '#ffffff';
        const bg = cfg.legend?.canvasLabels?.background || '#111827cc';
        const pad = Number(cfg.legend?.canvasLabels?.padding || 4);
        const vert = _verticalVector();

        const labels = new Map();
        const addCandidate = (label, pos) => {
            if (!label || !pos) return;
            if (!labels.has(label)) labels.set(label, []);
            labels.get(label).push(pos);
        };

        // legend-driven labels
        if (wantLegendLabels) {
            for (const comp of components || []) {
                const label = this._labelForComponent(comp, mode);
                if (!label) continue;
                const pos = this._componentLabelPosition(comp, vert);
                addCandidate(label, pos);
            }
        }

        // optional node IDs
        if (wantNodeLabels) {
            let count = 0;
            const maxNodes = Number(cfg.legend?.canvasLabels?.maxNodeLabels || 80);
            for (const comp of components || []) {
                if (count >= maxNodes) break;
                const src = comp?.source || {};
                const pts = comp?.points || [];
                const nodePairs = [];
                if (src.FROM_NODE !== undefined && pts[0]) nodePairs.push([`N${src.FROM_NODE}`, pts[0]]);
                if (src.TO_NODE !== undefined && pts[1]) nodePairs.push([`N${src.TO_NODE}`, pts[1]]);
                for (const [nid, p] of nodePairs) {
                    const pos = mapCoord(p);
                    if (pos) {
                        addCandidate(nid, pos.clone().add(vert.clone().normalize().multiplyScalar((comp?.bore || 25) * 0.7)));
                        count += 1;
                        if (count >= maxNodes) break;
                    }
                }
                if (count >= maxNodes) break;
            }
        }

        if (!labels.size || maxLegendLabels <= 0) return;
        const sampledEntries = [];
        for (const [label, positions] of labels.entries()) {
            // Stable: take the first maxPerLabel positions (insertion order) for deterministic output.
            const dedup = positions.slice(0, maxPerLabel);
            for (const p of dedup) {
                sampledEntries.push({ label, pos: p });
            }
        }
        // Sort by label for a stable, predictable legend order before capping.
        sampledEntries.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
        const finalEntries = sampledEntries.slice(0, maxLegendLabels);
        if (!finalEntries.length) return;
        this._legendLabelGroup = new THREE.Group();
        for (const entry of finalEntries) {
            const sprite = this._makeTextSprite(entry.label, { fontSize, textColor, background: bg, padding: pad });
            sprite.position.copy(entry.pos);
            this._legendLabelGroup.add(sprite);
        }
        if (this._legendLabelGroup.children.length) {
            this.scene.add(this._legendLabelGroup);
        } else {
            this._legendLabelGroup = null;
        }
    }

    _labelForComponent(comp, mode) {
        const src = comp?.source || {};
        const attrs = comp?.attributes || {};
        if (mode === 'od') {
            const od = Number(comp?.bore || src?.DIAMETER || 0) * 2;
            return od ? `OD ${Math.round(od)}` : null;
        }
        if (mode === 'material') {
            const m = attrs.MATERIAL || src.MATERIAL;
            return m ? String(m) : null;
        }
        if (mode === 'supportKind') {
            if (String(comp?.type).toUpperCase() !== 'SUPPORT') return null;
            const k = attrs.SUPPORT_KIND || src.SUPPORT_KIND;
            return k ? String(k) : null;
        }
        if (mode === 'heatmap' && this._heatmapState) {
            const metric = this._heatmapState.metric;
            const value = this._metricValueFromSource(src, attrs, metric);
            if (!Number.isFinite(value)) return 'null';
            const { min, max, bucketCount } = this._heatmapState;
            const span = Math.max(1e-9, max - min);
            const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(((value - min) / span) * bucketCount)));
            const start = min + (span * idx) / bucketCount;
            const end = min + (span * (idx + 1)) / bucketCount;
            return `${metric} ${start.toFixed(1)}Ã¢â‚¬â€œ${end.toFixed(1)}`;
        }
        return null;
    }

    _componentLabelPosition(comp, vertical) {
        const pts = comp?.points || [];
        let base = null;
        if (comp?.coOrds) base = mapCoord(comp.coOrds);
        else if (pts.length) {
            const sum = pts.reduce((acc, p) => ({
                x: acc.x + Number(p.x || 0),
                y: acc.y + Number(p.y || 0),
                z: acc.z + Number(p.z || 0),
            }), { x: 0, y: 0, z: 0 });
            const mid = { x: sum.x / pts.length, y: sum.y / pts.length, z: sum.z / pts.length };
            base = mapCoord(mid);
        } else if (comp?.centrePoint) {
            base = mapCoord(comp.centrePoint);
        }
        if (!base) return null;
        const offset = (comp?.bore ? comp.bore / 2 : 25);
        return base.clone().add(vertical.clone().normalize().multiplyScalar(offset * 1.2));
    }

    _componentLengthMm(comp) {
        const sourceLength = Number(comp?.source?.LENGTH ?? comp?.source?.L ?? comp?.source?.LEN);
        if (Number.isFinite(sourceLength) && sourceLength > 0) return sourceLength;

        const mapPoint = (point) => {
            if (!point) return null;
            return mapCoord(point);
        };
        const segmentLength = (a, b) => {
            const av = mapPoint(a);
            const bv = mapPoint(b);
            if (!av || !bv) return 0;
            return av.distanceTo(bv);
        };

        const type = String(comp?.type || '').toUpperCase();
        const pts = Array.isArray(comp?.points) ? comp.points : [];

        if ((type === 'ELBOW' || type === 'BEND') && comp?.centrePoint && pts[0] && pts[1]) {
            const p1 = mapPoint(pts[0]);
            const p2 = mapPoint(pts[1]);
            const c = mapPoint(comp.centrePoint);
            if (p1 && p2 && c) {
                const v1 = p1.clone().sub(c);
                const v2 = p2.clone().sub(c);
                const r1 = v1.length();
                const r2 = v2.length();
                if (r1 > 0.001 && r2 > 0.001) {
                    const dot = THREE.MathUtils.clamp(v1.clone().normalize().dot(v2.clone().normalize()), -1, 1);
                    const angle = Math.acos(dot);
                    const radius = (r1 + r2) / 2;
                    if (Number.isFinite(angle) && angle > 0.001 && angle < Math.PI - 0.001) {
                        return radius * angle;
                    }
                }
            }
        }

        if (type === 'TEE' && comp?.centrePoint) {
            let total = 0;
            if (pts[0]) total += segmentLength(pts[0], comp.centrePoint);
            if (pts[1]) total += segmentLength(comp.centrePoint, pts[1]);
            if (comp?.branch1Point) total += segmentLength(comp.centrePoint, comp.branch1Point);
            if (total > 0.001) return total;
        }

        if (type === 'OLET' && comp?.centrePoint && comp?.branch1Point) {
            const total = segmentLength(comp.centrePoint, comp.branch1Point);
            if (total > 0.001) return total;
        }

        if (pts.length >= 2) {
            let total = 0;
            for (let i = 1; i < pts.length; i += 1) {
                total += segmentLength(pts[i - 1], pts[i]);
            }
            if (total > 0.001) return total;
        }

        return null;
    }

    _rebuildLengthLabels(components) {
        const cfg = this.viewerConfig || {};
        if (cfg.disableAllSettings || !cfg.lengthLabels?.enabled) {
            this.setOverlayLayerData(OVERLAY_LAYER_IDS.LENGTH, []);
            this._emitTrace('length-labels-built', { count: 0 });
            return;
        }

        const precision = Math.max(0, Number(cfg.lengthLabels?.precision ?? 1));
        const maxLabels = Math.max(0, Number(cfg.lengthLabels?.maxLabels ?? 500));
        const minGap = Math.max(10, Number(cfg.lengthLabels?.minWorldGap ?? 90));
        const offsetScale = Math.max(0.2, Number(cfg.lengthLabels?.offsetScale ?? 1));
        const minScreenGap = Math.max(10, Math.round(minGap * 0.18));
        const vertical = _verticalVector().clone().normalize();
        const placedPositions = [];
        const placedScreens = [];
        let count = 0;
        const viewport = new THREE.Vector2(
            Number(this.container?.clientWidth || 0),
            Number(this.container?.clientHeight || 0)
        );
        const projectToScreen = (worldPos) => {
            if (!this.camera || !worldPos || viewport.x <= 0 || viewport.y <= 0) return null;
            const ndc = worldPos.clone().project(this.camera);
            if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) return null;
            return {
                x: (ndc.x * 0.5 + 0.5) * viewport.x,
                y: (-ndc.y * 0.5 + 0.5) * viewport.y,
                z: ndc.z,
            };
        };

        const rows = [];
        for (const comp of components || []) {
            if (count >= maxLabels) break;
            const length = this._componentLengthMm(comp);
            if (!Number.isFinite(length) || length <= 0.001) continue;

            const basePos = this._componentLabelPosition(comp, vertical);
            if (!basePos) continue;

            const bore = Number(comp?.bore || 25);
            const baseLift = Math.max(8, bore * 0.35) * offsetScale;
            const liftVector = vertical.clone();
            const candidate = basePos.clone().add(liftVector.clone().multiplyScalar(baseLift));
            const liftStep = Math.max(12, minGap * 0.55);
            let tries = 0;
            let screenPoint = projectToScreen(candidate);
            if (!screenPoint || screenPoint.z < -1.05 || screenPoint.z > 1.05) continue;
            while (tries < 8) {
                const worldOverlap = placedPositions.some((p) => p.distanceTo(candidate) < minGap);
                const screenOverlap = placedScreens.some((p) => {
                    const dx = p.x - screenPoint.x;
                    const dy = p.y - screenPoint.y;
                    return (dx * dx) + (dy * dy) < (minScreenGap * minScreenGap);
                });
                if (!worldOverlap && !screenOverlap) break;
                candidate.add(liftVector.clone().multiplyScalar(liftStep));
                screenPoint = projectToScreen(candidate);
                if (!screenPoint || screenPoint.z < -1.05 || screenPoint.z > 1.05) break;
                tries += 1;
            }
            if (!screenPoint || screenPoint.z < -1.05 || screenPoint.z > 1.05) continue;
            const stillScreenOverlap = placedScreens.some((p) => {
                const dx = p.x - screenPoint.x;
                const dy = p.y - screenPoint.y;
                return (dx * dx) + (dy * dy) < (minScreenGap * minScreenGap);
            });
            if (stillScreenOverlap) continue;
            placedPositions.push(candidate.clone());
            placedScreens.push(screenPoint);
            rows.push({
                worldPos: candidate,
                text: `L ${length.toFixed(precision)} mm`,
                lift: 0,
            });
            count += 1;
        }
        this.setOverlayLayerData(OVERLAY_LAYER_IDS.LENGTH, rows);
        this._emitTrace('length-labels-built', { count });
    }

    _makeTextSprite(text, { fontSize = 16, textColor = '#fff', background = '#111827cc', padding = 4 } = {}) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = `bold ${fontSize}px Inter, Arial, sans-serif`;
        ctx.font = font;
        const textWidth = ctx.measureText(text).width;
        const width = Math.ceil(textWidth + padding * 2);
        const height = Math.ceil(fontSize + padding * 2);
        canvas.width = width;
        canvas.height = height;
        ctx.font = font;
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, padding, height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true });
        const sprite = new THREE.Sprite(material);
        const scaleFactor = Number(this.viewerConfig?.legend?.canvasLabels?.scale || 1);
        sprite.scale.set(width, height, 1).multiplyScalar(0.25 * scaleFactor);
        return sprite;
    }

    _shuffleArray(arr = []) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    _escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    _renderHeatmapPanel() {
        const cfg = this.viewerConfig || {};
        if (cfg.disableAllSettings || cfg.heatmap?.canvasPanel?.enabled === false || !this._heatmapState) {
            if (this._heatmapPanelEl?.parentNode === this.container) this.container.removeChild(this._heatmapPanelEl);
            this._heatmapPanelEl = null;
            return;
        }
        if (!this._heatmapPanelEl) {
            this._heatmapPanelEl = document.createElement('div');
            this._heatmapPanelEl.className = 'heatmap-panel-overlay';
            this._heatmapPanelEl.style.position = 'absolute';
            this._heatmapPanelEl.style.zIndex = '12';
            this._heatmapPanelEl.style.pointerEvents = 'none';
            this._heatmapPanelEl.style.font = '12px Inter, Arial, sans-serif';
            this._heatmapPanelEl.style.background = '#111827cc';
            this._heatmapPanelEl.style.color = '#f8fafc';
            this._heatmapPanelEl.style.padding = '8px';
            this._heatmapPanelEl.style.borderRadius = '6px';
            this._heatmapPanelEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.35)';
            this.container.style.position = this.container.style.position === 'static' ? 'relative' : this.container.style.position;
            this.container.appendChild(this._heatmapPanelEl);
        }
        const pos = cfg.heatmap?.canvasPanel?.position || 'top-right';
        this._heatmapPanelEl.style.top = pos.startsWith('top') ? '12px' : 'unset';
        this._heatmapPanelEl.style.bottom = pos.startsWith('bottom') ? '12px' : 'unset';
        this._heatmapPanelEl.style.left = pos.endsWith('left') ? '12px' : 'unset';
        this._heatmapPanelEl.style.right = pos.endsWith('right') ? '12px' : 'unset';

        const { metric, min, max, bucketCount, palette } = this._heatmapState;
        const span = Math.max(1e-9, max - min);
        const rows = [];
        const values = [];
        this._componentMeshIndex.forEach((meshes) => {
            const source = meshes?.[0]?.userData?.source || {};
            const attrs = meshes?.[0]?.userData?.attributes || {};
            const v = this._metricValueFromSource(source, attrs, metric);
            if (Number.isFinite(v)) values.push(v);
        });
        const uniqueBuckets = new Map();
        for (const v of values) {
            const ratio = (v - min) / span;
            const idx = bucketCount === 1 ? 0 : Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
            if (!uniqueBuckets.has(idx)) uniqueBuckets.set(idx, { color: palette[Math.min(idx, palette.length - 1)], sample: v });
        }
        uniqueBuckets.forEach((entry, idx) => {
            const label = bucketCount === 1 ? `${metric} ${entry.sample.toFixed(2)}` : `${metric} Ã¢â€°Ë† ${entry.sample.toFixed(2)}`;
            rows.push(`<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">
              <span style="width:14px;height:14px;background:${entry.color};display:inline-block;border:1px solid #ffffff55;border-radius:2px;"></span>
              <span style="font-variant-numeric:tabular-nums;">${label}</span>
            </div>`);
        });
        this._heatmapPanelEl.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">Heatmap (${this._escapeHtml(metric)})</div>${rows.join('')}`;
    }

    /**
     * Render MESSAGE-CIRCLE node labels as CSS2D overlays.
     * @param {Array<{pos:{x,y,z}, text:string}>} nodes
     */
    loadMessageCircleNodes(nodes = []) {
        const rows = [];
        for (const node of nodes || []) {
            if (!node?.pos || !node?.text) continue;
            rows.push({ pos: node.pos, text: String(node.text), lift: 8 });
        }
        this.setOverlayLayerData(OVERLAY_LAYER_IDS.MESSAGE_CIRCLE, rows);
    }

    /**
     * Render MESSAGE-SQUARE annotation labels as CSS2D overlays.
     * @param {Array<{pos:{x,y,z}, text:string}>} nodes
     */
    loadMessageSquareNodes(nodes = []) {
        const rows = [];
        for (const node of nodes || []) {
            if (!node?.pos || !node?.text) continue;
            rows.push({ pos: node.pos, text: String(node.text), lift: 14 });
        }
        this.setOverlayLayerData(OVERLAY_LAYER_IDS.MESSAGE_SQUARE, rows);
    }

    /** Tear down Ã¢â‚¬â€ clean up all resources */
    dispose() {
        if (this._animId) cancelAnimationFrame(this._animId);
        if (this._overlayRaf) cancelAnimationFrame(this._overlayRaf);
        this._overlayRaf = 0;
        window.removeEventListener('resize', this._onResize);
        if (this.controls) this.controls.dispose();
        // Drop all ViewCube event listeners at once (M5).
        if (this._viewCubeAC) { this._viewCubeAC.abort(); this._viewCubeAC = null; }
        // Clean up any in-progress marquee window listeners (M6).
        this._detachMarqueeHandlers();
        this._clearMeasureOverlay();
        if (this.renderer?.domElement && this._onPointerDown) {
            this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
        }

        // Dispose all geometries/materials
        this.scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });

        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement?.parentNode === this.container) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
        if (this._css2dRenderer) {
            if (this._css2dRenderer.domElement?.parentNode === this.container) {
                this.container.removeChild(this._css2dRenderer.domElement);
            }
        }
        if (this._viewCubeEl?.parentNode === this.container) {
            this.container.removeChild(this._viewCubeEl);
        }
        if (this._axisGizmoEl?.parentNode === this.container) {
            this.container.removeChild(this._axisGizmoEl);
        }
        if (this._heatmapPanelEl?.parentNode === this.container) {
            this.container.removeChild(this._heatmapPanelEl);
        }
        this._overlayGroups.clear();
        this._overlayLayerData.clear();
        this._overlayLayerVisibility.clear();
        this._overlayLayerFields.clear();
        this._reportMeasurement(null);
        this._emitTrace('dispose', {});
    }

    /**
     * Render an XML diff overlay: A-components in blue, B-components in orange.
     * Lines are drawn in world space on top of whatever model is loaded.
     * @param {Array} componentsA
     * @param {Array} componentsB
     */
    setXmlDiffOverlay(componentsA, componentsB) {
        this.clearXmlDiffOverlay();

        const group = new THREE.Group();
        group.name = 'xml-diff-overlay';

        const matA = new THREE.LineBasicMaterial({ color: 0x3b82f6, depthTest: false });
        const matB = new THREE.LineBasicMaterial({ color: 0xf97316, depthTest: false });

        const addLines = (components, mat) => {
            for (const comp of (Array.isArray(components) ? components : [])) {
                const pts = comp?.points;
                if (!Array.isArray(pts) || pts.length < 2) continue;
                const v0 = mapCoord(pts[0]);
                const v1 = mapCoord(pts[1]);
                if (!v0 || !v1) continue;
                const geo = new THREE.BufferGeometry().setFromPoints([v0, v1]);
                group.add(new THREE.Line(geo, mat));
            }
        };

        addLines(componentsA, matA);
        addLines(componentsB, matB);

        this.scene.add(group);
        this._xmlDiffOverlayGroup = group;
    }

    /** Remove the XML diff overlay from the scene. */
    clearXmlDiffOverlay() {
        if (this._xmlDiffOverlayGroup) {
            this.scene.remove(this._xmlDiffOverlayGroup);
            this._xmlDiffOverlayGroup.traverse((obj) => {
                obj.geometry?.dispose();
                obj.material?.dispose();
            });
            this._xmlDiffOverlayGroup = null;
        }
    }
}
