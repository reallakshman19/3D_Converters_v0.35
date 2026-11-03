/**
 * support-mapper.js — Phase 4F centralized support mapping
 *
 * Responsibilities:
 * - Derive <SUPPORT_NAME> from friction/gap/config mapping blocks.
 * - Derive <SUPPORT_GUID> with mandatory UCI: prefix.
 * - Keep SUPPORT output data free from CA attributes.
 * - Provide deterministic diagnostics and browser helpers.
 */

import { getRvmPcfLegacyConfig as getRayConfig } from '../config/rvm-pcf-legacy-config.js';

const DEFAULT_SUPPORT_MAPPING = Object.freeze({
  guidPrefix: 'UCI:',
  fallbackName: 'CA150',
  blocks: [
    { id: 1, frictionMatch: ['', '0.3'], gapCondition: 'empty', name: 'CA150', desc: 'Rest' },
    { id: 2, frictionMatch: ['0.15'], gapCondition: 'any', name: 'CA100', desc: 'Guide' },
  ],
});

function clean(value) {
  return String(value ?? '').trim();
}

function n(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function normNumberText(value) {
  const raw = clean(value);
  if (!raw) return '';
  const num = n(raw);
  return num == null ? raw : String(num);
}

function resolveConfig(cfg = null) {
  const live = cfg || getRayConfig();
  const input = live?.supportMapping || {};
  return {
    ...DEFAULT_SUPPORT_MAPPING,
    ...input,
    guidPrefix: clean(input.guidPrefix || DEFAULT_SUPPORT_MAPPING.guidPrefix) || 'UCI:',
    fallbackName: clean(input.fallbackName || DEFAULT_SUPPORT_MAPPING.fallbackName) || 'CA150',
    blocks: Array.isArray(input.blocks) && input.blocks.length ? input.blocks : DEFAULT_SUPPORT_MAPPING.blocks,
  };
}

function isGapEmpty(value) {
  const s = clean(value).toLowerCase();
  return !s || s === '-' || s === 'null' || s === 'na' || s === 'n/a';
}

function gapMatches(gap, condition) {
  const cond = clean(condition).toLowerCase();
  if (!cond || cond === 'any') return true;
  if (cond === 'empty') return isGapEmpty(gap);
  if (cond === '>0' || cond === 'positive') {
    const g = n(gap, 0);
    return g > 0;
  }
  if (cond === '=0' || cond === 'zero') {
    const g = n(gap, 0);
    return g === 0;
  }
  return false;
}

function frictionMatches(friction, matches = []) {
  const f = normNumberText(friction);
  const list = Array.isArray(matches) ? matches : [matches];
  return list.some(m => normNumberText(m) === f);
}

function candidateGuidValue(row = {}) {
  return clean(
    row.supportGuid ||
    row.SUPPORT_GUID ||
    row['SUPPORT GUID'] ||
    row.guid ||
    row.GUID ||
    row.nodeName ||
    row.NodeName ||
    row['Node Name'] ||
    row.refNo ||
    row.ca97 ||
    row.csvSeqNo ||
    ''
  );
}

function candidateSupportName(row = {}) {
  return clean(row.supportName || row.SUPPORT_NAME || row['SUPPORT NAME'] || row.supportType || row.SupportType || '');
}

function candidateFriction(row = {}) {
  return clean(row.friction ?? row.Friction ?? row.FRICTION ?? row['Friction'] ?? row.ca5 ?? row.CA5 ?? '');
}

function candidateGap(row = {}) {
  return clean(row.gap ?? row.Gap ?? row.GAP ?? row['Gap'] ?? row.ca6 ?? row.CA6 ?? '');
}

export function normalizeSupportGuid(rawGuid, cfg = null) {
  const mapping = resolveConfig(cfg);
  const prefix = mapping.guidPrefix || 'UCI:';
  let raw = clean(rawGuid);
  if (!raw) return '';
  raw = raw.replace(/^UCI:/i, '');
  return `${prefix}${raw}`;
}

export function resolveSupportMapping(row = {}, cfg = null) {
  const mapping = resolveConfig(cfg);
  const diagnostics = [];
  const explicitName = candidateSupportName(row);
  const friction = candidateFriction(row);
  const gap = candidateGap(row);
  const rawGuid = candidateGuidValue(row);

  let name = explicitName;
  let source = explicitName ? 'explicit-support-name' : '';
  let matchedBlock = null;

  if (!name) {
    for (const block of mapping.blocks || []) {
      if (frictionMatches(friction, block.frictionMatch) && gapMatches(gap, block.gapCondition)) {
        name = clean(block.name);
        source = 'support-mapping-block';
        matchedBlock = block;
        break;
      }
    }
  }

  if (!name) {
    name = mapping.fallbackName;
    source = 'fallback-name';
    diagnostics.push({ severity: 'warning', code: 'SUPPORT-NAME-FALLBACK', message: 'No support mapping block matched; fallback name used.' });
  }

  const guid = normalizeSupportGuid(rawGuid, mapping);
  if (!guid) {
    diagnostics.push({ severity: 'warning', code: 'SUPPORT-GUID-MISSING', message: 'Support GUID source is blank; <SUPPORT_GUID> will be omitted.' });
  }

  return {
    supportName: name,
    supportGuid: guid,
    source,
    matchedBlockId: matchedBlock?.id ?? null,
    matchedBlockDesc: matchedBlock?.desc || '',
    friction,
    gap,
    diagnostics,
    config: {
      guidPrefix: mapping.guidPrefix,
      fallbackName: mapping.fallbackName,
    },
  };
}

export function applySupportMapping(row = {}, cfg = null) {
  const resolved = resolveSupportMapping(row, cfg);
  const cleaned = { ...row };

  // SUPPORT must not carry CA attributes into the SUPPORT PCF block.
  if (cleaned.ca && typeof cleaned.ca === 'object') cleaned.ca = {};
  for (let i = 1; i <= 10; i++) {
    delete cleaned[`ca${i}`];
    delete cleaned[`CA${i}`];
    delete cleaned[`CA ${i}`];
  }

  return {
    ...cleaned,
    supportName: resolved.supportName,
    supportGuid: resolved.supportGuid,
    supportMapping: resolved,
  };
}

export function applySupportMappings(rows = [], cfg = null) {
  const out = (Array.isArray(rows) ? rows : []).map(row => {
    const t = clean(row?.type || row?.rawType || row?.Type).toUpperCase();
    return t === 'SUPPORT' ? applySupportMapping(row, cfg) : row;
  });

  return {
    rows: out,
    summary: {
      inputRows: Array.isArray(rows) ? rows.length : 0,
      supportRows: out.filter(r => clean(r?.type || r?.rawType || r?.Type).toUpperCase() === 'SUPPORT').length,
      mapped: out.filter(r => r.supportMapping).length,
      guidMissing: out.filter(r => (r.supportMapping?.diagnostics || []).some(d => d.code === 'SUPPORT-GUID-MISSING')).length,
      fallbackNameUsed: out.filter(r => r.supportMapping?.source === 'fallback-name').length,
    }
  };
}

try {
  if (typeof window !== 'undefined') {
    window.resolvePcfSupportMapping = resolveSupportMapping;
    window.applyPcfSupportMapping = applySupportMapping;
    window.applyPcfSupportMappings = applySupportMappings;
    window.normalizePcfSupportGuid = normalizeSupportGuid;
  }
} catch (_) {}
