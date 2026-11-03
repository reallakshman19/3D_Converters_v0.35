// ComponentModelToRvm.js
//
// Parallel-path serialiser that taps the PARAMETRIC component model produced by
// adaptUxmlToGlbModel() -- NOT the tessellated THREE.Scene. Each component maps
// to AVEVA RVM parametric primitives, so the output is exact and tiny.
//
//   PIPE / ELBOW run / TEE branch -> Cylinder (kind 8)
//   BEND / ELBOW corner           -> CircularTorus (kind 4) from bendRadius/angle
//   REDUCER                       -> Snout (kind 7)
//   FLANGE                        -> Cylinder + 2 disc Cylinders
//   VALVE                         -> Box (kind 2) body + 2 Snout bonnets
//   SUPPORT                       -> Box glyph (RESTRAINTS group)
//
// Node tags become group names + .att attributes (RVM has no text primitive).
// BINARY format mirrors rvmparser ParserRVM.cpp (big-endian, 24-byte chunk
// headers with cumulative next_chunk_offset, word-counted strings). Units: mm.
// NOTE: ASCII/REV output is NOT loaded by Navisworks -- the binary framing
// (next_chunk_offset per chunk) is mandatory, so this writer emits binary.

import {
  RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION,
  assertRvmPrimitiveCodeEmitAllowed,
  getRvmPrimitiveCapability,
} from '../../rvm/RvmPrimitiveCapabilityRegistry.js';

// ---------- vec helpers ----------
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const P = (e) => [Number(e?.x) || 0, Number(e?.y) || 0, Number(e?.z) || 0];
function frame(z) {
  z = norm(z);
  const ref = Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = norm(cross(ref, z));
  return [x, cross(z, x), z];
}

function primitiveUnlockKey(kind) {
  if (kind === 4) return 'legacy-inputxml-rvm-torus';
  if (kind === 7) return 'legacy-inputxml-rvm-snout';
  return '';
}

function assertWriterPrimitive(kind, group) {
  return assertRvmPrimitiveCodeEmitAllowed(kind, {
    context: `inputxml-rvm writer group ${group || 'UNKNOWN'}`,
    unlockKey: primitiveUnlockKey(kind),
  });
}

// ---------- binary writers (big-endian) ----------
function concat(arrs) {
  let n = 0; for (const a of arrs) n += a.length;
  const out = new Uint8Array(n); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, false); return b; }
function f32(x) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, x, false); return b; }
function farr(xs) { return concat(xs.map(f32)); }
function wstr(s) {
  const enc = new TextEncoder().encode(String(s || ''));
  const arr = Array.from(enc); arr.push(0);
  while (arr.length % 4) arr.push(0);
  return concat([u32(arr.length / 4), Uint8Array.from(arr)]);
}
function tagBytes(t) {
  t = (t + '    ').slice(0, 4);
  const out = new Uint8Array(16);
  for (let i = 0; i < 4; i++) out[i * 4 + 3] = t.charCodeAt(i);
  return out;
}

// ---------- primitive accumulator ----------
function makeWriter() {
  const prims = [];
  function emit(group, kind, axes, center, params, bbox, attrs, rest) {
    assertWriterPrimitive(kind, group);
    const [x, y, z] = axes;
    // column-major M_3x4 data: Xaxis, Yaxis, Zaxis, center
    const M = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2], center[0], center[1], center[2]];
    prims.push({ group, kind, M, params, bbox, attrs: attrs || {}, rest: !!rest });
  }
  return { prims, emit };
}
function cyl(w, g, p1, p2, r, at, rest) {
  const d = sub(p2, p1), L = len(d); if (L < 1e-6) return;
  w.emit(g, 8, frame(d), mul(add(p1, p2), 0.5), [r, L], [-r, -r, -L/2, r, r, L/2], at, rest);
}
function box(w, g, c, dir, [lx, ly, lz], at, rest) {
  w.emit(g, 2, frame(dir), c, [lx, ly, lz], [-lx/2, -ly/2, -lz/2, lx/2, ly/2, lz/2], at, rest);
}
function snout(w, g, pa, pb, ra, rb, at, rest) {
  const d = sub(pb, pa), h = len(d); if (h < 1e-6) return; const rm = Math.max(ra, rb);
  w.emit(g, 7, frame(d), mul(add(pa, pb), 0.5), [ra, rb, h, 0, 0, 0, 0, 0, 0],
    [-rm, -rm, -h/2, rm, rm, h/2], at, rest);
}
function torus(w, g, C, dIn, dOut, R, r, at) {
  const u = norm(dIn), wv = norm(dOut);
  const beta = Math.acos(Math.max(-1, Math.min(1, dot(u, wv))));
  if (beta < 1e-3) return;
  const t = R * Math.tan(beta / 2), bis = norm(sub(wv, u));
  if (!isFinite(bis[0])) return;
  const O = add(C, mul(bis, R / Math.cos(beta / 2)));
  const T1 = sub(C, mul(u, t)), T2 = add(C, mul(wv, t));
  const X = norm(sub(T1, O)), er = norm(sub(T2, O)), Z = cross(X, er);
  if (len(Z) < 1e-9) return;
  const Zn = norm(Z), Y = cross(Zn, X), rr = R + r;
  w.emit(g, 4, [X, Y, Zn], O, [R, r, beta], [-rr, -rr, -r, rr, rr, r], at, false);
}

function primParamsFor(p) {
  if (p.kind === 8) return p.params.slice(0, 2);
  if (p.kind === 2 || p.kind === 4) return p.params.slice(0, 3);
  if (p.kind === 7) return p.params.slice(0, 9);
  return [];
}

function primitiveAuditRecord(p, index) {
  const params = primParamsFor(p);
  const capability = getRvmPrimitiveCapability(p.kind);
  const matrixWords = Array.isArray(p.M) ? p.M.length : 0;
  const bboxWords = Array.isArray(p.bbox) ? p.bbox.length : 0;
  const paramWords = params.length;
  const bodyWords = 2 + matrixWords + bboxWords + paramWords;
  return {
    index,
    group: p.group,
    kind: p.kind,
    primitiveName: capability.name,
    writerStatus: capability.writerStatus,
    unlockKeyUsed: primitiveUnlockKey(p.kind) || '',
    rest: Boolean(p.rest),
    matrixWords,
    bboxWords,
    paramWords,
    bodyWords,
    bodyBytes: bodyWords * 4,
    chunkBytes: 24 + bodyWords * 4,
    params,
    bbox: Array.isArray(p.bbox) ? [...p.bbox] : [],
  };
}

function buildPrimitiveAudit(prims) {
  const records = prims.map((p, index) => primitiveAuditRecord(p, index));
  return {
    schema: 'inputxml-rvm-writer-primitive-audit/v1',
    registryVersion: RVM_PRIMITIVE_CAPABILITY_REGISTRY_VERSION,
    primitiveCount: records.length,
    primitiveKinds: Object.fromEntries(records.reduce((map, record) => map.set(String(record.kind), (map.get(String(record.kind)) || 0) + 1), new Map())),
    records,
  };
}

// ---------- main ----------
export function componentModelToRvm(model, options = {}) {
  const prec = Number.isFinite(options.precision) ? options.precision : 3;
  const rnd = (p) => p.map((c) => Number(c.toFixed(prec)));
  const w = makeWriter();
  const comps = (model && model.components) || [];

  const key = (p) => rnd(p).join(',');
  const incident = new Map(), segs = [];
  for (const c of comps) {
    if (!c.ep1 || !c.ep2) continue;
    const i = segs.length;
    segs.push({ a: rnd(P(c.ep1)), b: rnd(P(c.ep2)), c });
    for (const k of [key(P(c.ep1)), key(P(c.ep2))]) {
      if (!incident.has(k)) incident.set(k, []);
      incident.get(k).push(i);
    }
  }

  for (const c of comps) {
    const type = String(c.type || '').toUpperCase();
    const dia = Number(c.bore || 20), r = Math.max(dia / 2, 1);
    const at = { REFNO: c.refNo, TYPE: type, DIAM: dia };
    if (type === 'SUPPORT') {
      box(w, `REST_${c.refNo || ''}`, rnd(P(c.coOrds || c.ep1)), [0, 0, 1], [70, 70, 70],
        { REFNO: c.refNo, TYPE: 'RESTRAINT', KIND: c.kind || '' }, true);
      continue;
    }
    if (!c.ep1 || !c.ep2) continue;
    const p1 = rnd(P(c.ep1)), p2 = rnd(P(c.ep2)), g = `${type}_${c.refNo || ''}`;
    if (type === 'VALVE') {
      const d = sub(p2, p1), L = len(d);
      if (L > 1e-6) {
        const u = norm(d), m = mul(add(p1, p2), 0.5);
        box(w, g, m, d, [dia * 1.3, dia * 1.3, L * 0.5], at, false);
        snout(w, g, m, add(m, mul(u, L * 0.42)), dia * 0.55, r, at, false);
        snout(w, g, m, sub(m, mul(u, L * 0.42)), dia * 0.55, r, at, false);
      }
    } else if (type === 'REDUCER') {
      const r2 = Math.max(Number(c.attributes?.BORE2 || dia * 0.66) / 2, 1);
      snout(w, g, p1, p2, r, r2, at, false);
    } else if (type === 'FLANGE') {
      cyl(w, g, p1, p2, r, at, false);
      const d = sub(p2, p1), L = len(d);
      if (L > 1e-6) {
        const u = norm(d), dl = Math.min(L * 0.16, dia * 0.35);
        cyl(w, g, p1, add(p1, mul(u, dl)), dia * 0.9, at, false);
        cyl(w, g, p2, sub(p2, mul(u, dl)), dia * 0.9, at, false);
      }
    } else {
      cyl(w, g, p1, p2, r, at, false);
    }
    if (type === 'BEND' || type === 'ELBOW' || Number.isFinite(c.bendRadius)) {
      const neigh = (incident.get(key(P(c.ep2))) || []).map((i) => segs[i]).find((s) => s.c !== c);
      if (neigh) {
        let dOut = sub(neigh.b, neigh.a);
        if (dot(dOut, sub(p2, neigh.a)) < 0) dOut = mul(dOut, -1);
        torus(w, `BEND_${c.refNo || ''}`, p2, sub(p2, p1), dOut,
          Number(c.bendRadius) || dia * 1.5, r, { REFNO: c.refNo, TYPE: 'BEND', RADIUS: Number(c.bendRadius) || dia * 1.5 });
      }
    }
  }

  // ---- assemble binary chunks ----
  const primParams = primParamsFor;
  const cntbBody = (name) => concat([u32(1), wstr(name), farr([0, 0, 0]), u32(0)]);
  const primBody = (p) => concat([u32(1), u32(p.kind), farr(p.M), farr(p.bbox), farr(primParams(p))]);
  const runs = (list) => {
    const out = [];
    for (const p of list) {
      if (out.length && out[out.length - 1][0] === p.group) out[out.length - 1][1].push(p);
      else out.push([p.group, [p]]);
    }
    return out;
  };
  const geo = w.prims.filter((p) => !p.rest), rest = w.prims.filter((p) => p.rest);
  const name = options.modelName || 'MODEL';
  const chunks = [
    ['HEAD', concat([u32(1), wstr('viewer'), wstr('parametric export'), wstr('export'), wstr('pipeline')])],
    ['MODL', concat([u32(1), wstr(name), wstr(name)])],
  ];
  for (const [top, list] of [['GEOMETRY', geo], ['RESTRAINTS', rest]]) {
    chunks.push(['CNTB', cntbBody(top)]);
    for (const [gname, gp] of runs(list)) {
      chunks.push(['CNTB', cntbBody(gname)]);
      for (const p of gp) chunks.push(['PRIM', primBody(p)]);
      chunks.push(['CNTE', u32(1)]);
    }
    chunks.push(['CNTE', u32(1)]);
  }
  chunks.push(['END:', new Uint8Array(0)]);

  const sizes = chunks.map(([, b]) => 24 + b.length);
  const starts = [0];
  for (let i = 0; i < sizes.length - 1; i++) starts.push(starts[i] + sizes[i]);
  const parts = [];
  chunks.forEach(([tag, body], i) => {
    parts.push(tagBytes(tag), u32(starts[i] + sizes[i]), u32(1), body);
  });
  const rvm = concat(parts);

  // ---- .att (optional PDMS attribute dump) ----
  const attGroup = (n, attrs, d) => {
    const ind = ' '.repeat(d);
    let s = `${ind}NEW ${n}\n`;
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== '') s += `${ind} ${k}:${v}\n`;
    return s + `${ind} END\n`;
  };
  let att = 'NEW GEOMETRY\n';
  for (const p of geo) att += attGroup(p.group, p.attrs, 1);
  att += 'END\nNEW RESTRAINTS\n';
  for (const p of rest) att += attGroup(p.group, p.attrs, 1);
  att += 'END\n';

  return { rvm, att, primitiveCount: w.prims.length, audit: buildPrimitiveAudit(w.prims) }; // rvm is a Uint8Array (binary)
}
