import * as THREE from 'three';

export const COLORS = {
  pipe: 0xd7dce1,
  rigid: 0x12bfae,
  bend: 0xe2e5e8,
  rest: 0xf2c744,
  guide: 0x00b8b2,
  lineStop: 0x1ec9c3,
  holddown: 0xd76fe9,
  spring: 0xd76fe9,
  warning: 0xff9bb2,
  isonote: 0xe36af2,
  node: 0xffe45c,
  text: 0xffffff
};

const MAX_TEXT_TEXTURE_SIZE = 2048;
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l9G9TQAAAABJRU5ErkJggg==';

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, side: THREE.DoubleSide, ...opts });
}

export function vectorFrom(p, scale = 0.01) {
  return new THREE.Vector3((p?.x || 0) * scale, (p?.y || 0) * scale, (p?.z || 0) * scale);
}

export function cylinderBetween(a, b, radius, material, radialSegments = 16, name = 'cylinder') {
  const start = a.clone();
  const end = b.clone();
  const delta = end.clone().sub(start);
  const length = delta.length();
  const geom = new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.0001), radialSegments, 1, false);
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  if (length > 1e-8) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  return mesh;
}

export function coneArrow(start, dir, length, radius, material, name = 'arrow') {
  const group = new THREE.Group();
  group.name = name;
  const d = dir.clone().normalize();
  const stemLen = length * 0.68;
  const headLen = length * 0.32;
  const stem = cylinderBetween(start, start.clone().add(d.clone().multiplyScalar(stemLen)), radius * 0.35, material, 12, `${name}_stem`);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, headLen, 18), material);
  cone.name = `${name}_head`;
  cone.position.copy(start).add(d.clone().multiplyScalar(stemLen + headLen / 2));
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  group.add(stem, cone);
  return group;
}

export function arrowToward(tip, dirTowardTip, length, radius, material, name = 'arrowToward') {
  const d = dirTowardTip.clone().normalize();
  const start = tip.clone().sub(d.clone().multiplyScalar(length));
  return coneArrow(start, d, length, radius, material, name);
}

function hasCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function textLines(value, maxLineLength = 34) {
  const raw = String(value || '').replace(/\r\n?/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const line of raw.length ? raw : ['']) {
    if (line.length <= maxLineLength) { out.push(line); continue; }
    let current = '';
    for (const word of line.split(/\s+/)) {
      const trial = current ? `${current} ${word}` : word;
      if (trial.length <= maxLineLength || !current) current = trial;
      else { out.push(current); current = word; }
    }
    if (current) out.push(current);
  }
  return out.slice(0, 6);
}

function blobFromBase64(base64, mime = 'image/png') {
  const binary = typeof atob === 'function' ? atob(base64) : '';
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobFromDataUrl(dataUrl, mime = 'image/png') {
  const encoded = String(dataUrl || '').split(',')[1] || TRANSPARENT_PNG_BASE64;
  return blobFromBase64(encoded, mime);
}

function installSafeToBlob(canvas) {
  if (!canvas || typeof Blob === 'undefined') return canvas;
  const nativeToBlob = typeof canvas.toBlob === 'function' ? canvas.toBlob.bind(canvas) : null;
  canvas.toBlob = (callback, type = 'image/png', quality) => {
    const done = (blob) => {
      if (blob instanceof Blob) { callback(blob); return; }
      try {
        if (typeof canvas.toDataURL === 'function') callback(blobFromDataUrl(canvas.toDataURL(type || 'image/png', quality), type || 'image/png'));
        else callback(blobFromBase64(TRANSPARENT_PNG_BASE64, type || 'image/png'));
      } catch {
        callback(blobFromBase64(TRANSPARENT_PNG_BASE64, type || 'image/png'));
      }
    };
    if (nativeToBlob) {
      try { nativeToBlob(done, type, quality); return; } catch {}
    }
    done(null);
  };
  return canvas;
}

function makeTextCanvas(text, options = {}) {
  const {
    width: requestedWidth = 512,
    height: requestedHeight = 192,
    fontSize: requestedFontSize = 46,
    fg = '#ffffff',
    bg = 'rgba(0,0,0,0)',
    border = 'rgba(0,0,0,0)',
    font = 'Arial, Helvetica, sans-serif',
    padding: requestedPadding = 18,
    align = 'left',
    lineHeight = 1.18,
    maxLineLength = 34,
    autoSize = true,
    minWidth = 96,
    minHeight = 64,
    maxWidth = requestedWidth,
    maxHeight = requestedHeight
  } = options;

  const requestedFont = Math.max(8, Number(requestedFontSize || 46));
  const requestedPaddingPx = Math.max(2, Number(requestedPadding || 18));
  const lines = textLines(text, maxLineLength);

  let measuredWidth = Number(requestedWidth) || 512;
  let measuredHeight = Number(requestedHeight) || 192;
  if (autoSize && hasCanvas()) {
    const probe = document.createElement('canvas');
    const probeCtx = probe.getContext('2d');
    if (probeCtx) {
      probeCtx.font = `800 ${requestedFont}px ${font}`;
      const widest = lines.reduce((m, line) => Math.max(m, probeCtx.measureText(line).width), 0);
      measuredWidth = Math.ceil(widest + requestedPaddingPx * 2 + requestedFont * 0.35);
      measuredHeight = Math.ceil(lines.length * requestedFont * lineHeight + requestedPaddingPx * 2);
    }
  }

  const minW = Math.max(16, Number(minWidth) || 96);
  const minH = Math.max(16, Number(minHeight) || 64);
  const maxW = Math.max(minW, Number(maxWidth) || Number(requestedWidth) || 512);
  const maxH = Math.max(minH, Number(maxHeight) || Number(requestedHeight) || 192);
  const rawWidth = Math.max(minW, Math.min(maxW, measuredWidth));
  const rawHeight = Math.max(minH, Math.min(maxH, measuredHeight));
  const textureScale = Math.min(1, MAX_TEXT_TEXTURE_SIZE / rawWidth, MAX_TEXT_TEXTURE_SIZE / rawHeight);
  const width = Math.max(16, Math.round(rawWidth * textureScale));
  const height = Math.max(16, Math.round(rawHeight * textureScale));
  const fontSize = Math.max(8, requestedFont * textureScale);
  const padding = Math.max(2, requestedPaddingPx * textureScale);
  const canvas = installSafeToBlob(document.createElement('canvas'));
  canvas.width = width;
  canvas.height = height;
  canvas.__nameplatePixelWidth = rawWidth;
  canvas.__nameplatePixelHeight = rawHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  if (bg && bg !== 'transparent' && bg !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = bg;
    roundRect(ctx, 4, 4, width - 8, height - 8, Math.max(4, 18 * textureScale), bg, border, Math.max(1, 3 * textureScale));
  } else if (border && border !== 'transparent' && border !== 'rgba(0,0,0,0)') {
    roundRect(ctx, 4, 4, width - 8, height - 8, Math.max(4, 18 * textureScale), 'rgba(0,0,0,0)', border, Math.max(1, 3 * textureScale));
  }
  ctx.imageSmoothingEnabled = true;
  ctx.textBaseline = 'top';
  ctx.font = `800 ${fontSize}px ${font}`;
  ctx.fillStyle = fg;
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = Math.max(1.5, fontSize * 0.05);
  const total = lines.length * fontSize * lineHeight;
  let y = Math.max(padding, (height - total) / 2);
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const x = align === 'center' ? (width - metrics.width) / 2 : padding;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    y += fontSize * lineHeight;
  }
  return canvas;
}

function mirroredPlaneGeometry(width, height) {
  const geom = new THREE.PlaneGeometry(width, height);
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, 1 - uv.getX(i));
  uv.needsUpdate = true;
  return geom;
}

export function createTextPlane(text, options = {}) {
  const {
    width = 512,
    height = 192,
    scale = 1,
    name = 'text-plane',
    fg = '#ffffff',
    bg = 'rgba(0,0,0,0)',
    border = 'rgba(0,0,0,0)',
    fontSize = 42,
    align = 'left',
    depthWrite = false
  } = options;

  const group = new THREE.Group();
  group.name = name;

  if (!hasCanvas()) {
    const fallbackW = (Number(width) || 512) / 120 * scale;
    const fallbackH = (Number(height) || 192) / 120 * scale;
    const fallback = new THREE.Mesh(
      new THREE.PlaneGeometry(fallbackW, fallbackH),
      new THREE.MeshBasicMaterial({ color: Number(options.fallbackColor || 0xffffff), transparent: true, opacity: 0.0, side: THREE.FrontSide })
    );
    fallback.name = `${name}_fallback_no_canvas`;
    group.add(fallback);
    return group;
  }

  const canvas = makeTextCanvas(text, {
    width,
    height,
    fg,
    bg,
    border,
    fontSize,
    align,
    maxLineLength: options.maxLineLength,
    padding: options.padding,
    lineHeight: options.lineHeight,
    autoSize: options.autoSize !== false,
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    maxWidth: options.maxWidth || width,
    maxHeight: options.maxHeight || height
  });
  const pxW = canvas.__nameplatePixelWidth || width;
  const pxH = canvas.__nameplatePixelHeight || height;
  const w = (pxW / 120) * scale;
  const h = (pxH / 120) * scale;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;

  const makeMaterial = () => new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, depthWrite, toneMapped: false, side: THREE.FrontSide });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), makeMaterial());
  front.name = `${name}_front_readable`;
  front.position.z = 0.001;
  const back = new THREE.Mesh(mirroredPlaneGeometry(w, h), makeMaterial());
  back.name = `${name}_back_readable`;
  back.rotation.y = Math.PI;
  back.position.z = -0.001;
  group.add(front, back);
  group.userData = {
    TYPE: 'TEXT_ANNOTATION',
    text: String(text || ''),
    stableNameplate: true,
    autoSizeNameplate: options.autoSize !== false,
    twoReadableFaces: true,
    mirroredBackUv: true,
    billboardCandidate: true,
    pixelWidth: pxW,
    pixelHeight: pxH
  };
  return group;
}

export function createNodeLabel(label, position, scale = 0.42) {
  const plane = createTextPlane(label, { width: 190, height: 86, fontSize: 38, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', fg: '#ffe45c', scale, align: 'center', name: `NODE_LABEL_${label}`, maxLineLength: 12, autoSize: true, minWidth: 90, maxWidth: 190, minHeight: 64, maxHeight: 108 });
  plane.position.copy(position);
  plane.userData = { TYPE: 'NODE_ANNOTATION', label, node: String(label).replace(/^N/i, ''), source: 'InputXML node annotation' };
  return plane;
}

export function createWarningTriangle(label = '!', scale = 0.8) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.0);
  shape.lineTo(-1.0, -0.75);
  shape.lineTo(1.0, -0.75);
  shape.lineTo(0, 1.0);
  const tri = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(COLORS.warning, { emissive: 0x330010, emissiveIntensity: 0.2 }));
  tri.name = 'warning_triangle';
  tri.scale.setScalar(scale);
  const txt = createTextPlane(label, { width: 96, height: 96, fontSize: 66, bg: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', fg: '#2b0010', scale: 0.42, align: 'center', name: 'warning_triangle_text', autoSize: false });
  txt.position.z = 0.02;
  const g = new THREE.Group();
  g.name = 'warning_marker';
  g.add(tri, txt);
  return g;
}

export function createSpringCoil(center, axis, radius, height, material, name = 'spring') {
  const pts = [];
  const turns = 5;
  for (let i = 0; i <= 100; i += 1) {
    const t = i / 100;
    pts.push(new THREE.Vector3(Math.cos(t * turns * Math.PI * 2) * radius, (t - 0.5) * height, Math.sin(t * turns * Math.PI * 2) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geom = new THREE.TubeGeometry(curve, 100, Math.max(radius * 0.08, 0.008), 8, false);
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  mesh.position.copy(center);
  const d = axis.clone().normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  return mesh;
}

export function createWarningLabel(text, position, name = 'warning-label') {
  const label = createTextPlane(text, { width: 420, height: 160, fontSize: 46, bg: 'rgba(80,16,20,0.74)', border: '#ff9bb2', fg: '#ffffff', scale: 0.72, align: 'left', name, autoSize: true, minWidth: 180, maxWidth: 420, minHeight: 90, maxHeight: 180 });
  label.position.copy(position);
  return label;
}

export function dominantAxis(v) {
  const a = { X: Math.abs(v.x), Y: Math.abs(v.y), Z: Math.abs(v.z) };
  return Object.entries(a).sort((p, q) => q[1] - p[1])[0][0];
}

export function orthogonal(v) {
  const d = v.clone().normalize();
  if (Math.abs(d.y) < 0.85) return new THREE.Vector3(-d.z, 0, d.x).normalize();
  return new THREE.Vector3(1, 0, 0);
}

export function axisVector(axis) {
  const raw = String(axis || '+X').trim().toUpperCase();
  const sign = raw.startsWith('-') ? -1 : 1;
  const letter = raw.replace(/^[+-]/, '')[0] || 'X';
  if (letter === 'Y') return new THREE.Vector3(0, sign, 0);
  if (letter === 'Z') return new THREE.Vector3(0, 0, sign);
  return new THREE.Vector3(sign, 0, 0);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 2) {
  const radius = Math.min(r, Math.max(0, w / 2), Math.max(0, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill && fill !== 'transparent' && fill !== 'rgba(0,0,0,0)') { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && stroke !== 'transparent' && stroke !== 'rgba(0,0,0,0)') { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
