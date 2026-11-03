import { rvmPcfLegacyDataManager as dataManager } from './rvm-pcf-legacy-data-manager.js';
import {
  CONVERTED_BORE_COL,
  sameConvertedBore,
  toSingleBoreMm
} from './bore-converter.js';

let staticWeightRows = [];
const staticWeightRowsPromise = (async () => {
  try {
    const response = await fetch(new URL('../../docs/Masters/wtValveweights.json', import.meta.url));
    if (response.ok) staticWeightRows = await response.json();
  } catch {
    staticWeightRows = [];
  }
})();

const STORAGE_KEY = 'pcf_master_new_tables_v2';

const NPS_TO_MM = {
  '1/2': 15, '3/4': 20, '1': 25, '1-1/4': 32, '1-1/2': 40, '2': 50, '2-1/2': 65,
  '3': 80, '3-1/2': 90, '4': 100, '5': 125, '6': 150, '8': 200, '10': 250, '12': 300,
  '14': 350, '16': 400, '18': 450, '20': 500, '24': 600, '30': 750, '36': 900, '42': 1050,
  '48': 1200
};

const TABLE1 = [
  ['1/2',15,21.3,25,25],['3/4',20,26.7,29,29],['1',25,33.4,38,38],['1-1/4',32,42.2,48,48],
  ['1-1/2',40,48.3,57,57],['2',50,60.3,64,64],['2-1/2',65,73.0,76,76],['3',80,88.9,86,86],
  ['3-1/2',90,101.6,95,95],['4',100,114.3,105,105],['5',125,141.3,124,124],['6',150,168.3,143,143],
  ['8',200,219.1,178,178],['10',250,273.1,216,216],['12',300,323.9,254,254],['14',350,355.6,279,279],
  ['16',400,406.4,305,305],['18',450,457.2,343,343],['20',500,508.0,381,381],['24',600,610.0,432,432],
  ['30',750,762.0,559,559],['36',900,914.0,660,660],['42',1050,1067.0,762,762],['48',1200,1219.0,864,864]
].map(([nps_inch,bore_mm,od_mm,c_mm,m_mm]) => ({ nps_inch,bore_mm,od_mm,c_mm,m_mm }));

const TABLE2 = [
 ['4','3',102],['4','2',95],['6','4',130],['6','3',124],['8','6',168],['8','4',156],['10','8',206],['10','6',194],
 ['12','10',244],['12','8',232],['12','6',219],['14','10',264],['14','8',254],['16','12',295],['16','10',283],
 ['18','14',330],['18','12',321],['20','16',368],['20','14',356],['24','20',419],['24','16',406]
].map(([header_nps,branch_nps,m_mm]) => ({
  header_nps, branch_nps, m_mm,
  header_bore_mm: NPS_TO_MM[header_nps] ?? Number(header_nps),
  branch_bore_mm: NPS_TO_MM[branch_nps] ?? Number(branch_nps)
}));

const TABLE3 = [
 ['2','3/4',38.1,60.3],['2','1',38.1,60.3],['3','1',44.4,88.9],['3','1-1/2',44.4,88.9],['3','2',50.8,88.9],
 ['4','1',50.8,114.3],['4','1-1/2',50.8,114.3],['4','2',57.2,114.3],['4','3',63.5,114.3],['6','1',57.2,168.3],
 ['6','2',63.5,168.3],['6','3',76.2,168.3],['6','4',82.6,168.3],['8','2',69.8,219.1],['8','3',82.6,219.1],
 ['8','4',88.9,219.1],['8','6',101.6,219.1],['10','2',76.2,273.1],['10','3',88.9,273.1],['10','4',95.2,273.1],
 ['10','6',108.0,273.1],['10','8',127.0,273.1],['12','2',82.6,323.9],['12','3',95.2,323.9],['12','4',101.6,323.9],
 ['12','6',114.3,323.9],['12','8',133.4,323.9],['12','10',152.4,323.9],['14','3',101.6,355.6],['14','4',108.0,355.6],
 ['14','6',120.6,355.6],['14','8',139.7,355.6],['14','10',158.8,355.6],['16','3',108.0,406.4],['16','4',114.3,406.4],
 ['16','6',127.0,406.4],['16','8',146.0,406.4],['16','10',165.1,406.4],['16','12',184.2,406.4]
].map(([header_nps,branch_nps,A_mm,header_od_mm]) => ({
  header_nps, branch_nps, A_mm, header_od_mm,
  header_bore_mm: NPS_TO_MM[header_nps] ?? Number(header_nps),
  branch_bore_mm: NPS_TO_MM[branch_nps] ?? Number(branch_nps),
  brlen_mm: Number((A_mm + 0.5*header_od_mm).toFixed(1))
}));

const defaults = {
  table1EqualTee: TABLE1,
  table2ReducingTee: TABLE2,
  table3Weldolet: TABLE3,
  table4Meta: { source: 'in-app', file: '/docs/Masters/wtValveweights.json' }
};

class MasterTableService {
  constructor() { this.tables = this._load(); }
  _n(v) { const n = Number.parseFloat(String(v ?? '').trim()); return Number.isFinite(n) ? n : null; }
  _s(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
  _fuzzyMmEq(a, b) { return Math.abs(a - b) <= Math.max(1.5, Math.abs(b) * 0.006); }
  _parseBore(v) { return toSingleBoreMm(v); }
  _odToDnFuzzy(odMm) {
    const t1 = this.tables?.table1EqualTee || [];
    let bestDn = null, bestOd = null, bestErr = Infinity;
    for (const row of t1) {
      const od = this._n(row?.od_mm);
      const dn = this._n(row?.bore_mm);
      if (od == null || dn == null) continue;
      const err = Math.abs(odMm - od);
      if (err < bestErr) { bestErr = err; bestDn = dn; bestOd = od; }
    }
    if (bestDn == null || bestOd == null) return null;
    return this._fuzzyMmEq(odMm, bestOd) ? bestDn : null;
  }
  _sameBore(aRaw, bRaw) { return sameConvertedBore(aRaw, bRaw); }
  _isCodeLikeValveType(valveType) {
    const t = this._s(valveType).toUpperCase();
    return !t || (t.length <= 6 && /^[A-Z0-9_-]+$/.test(t) && !/\s/.test(t));
  }
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaults);
      return { ...structuredClone(defaults), ...JSON.parse(raw) };
    } catch { return structuredClone(defaults); }
  }
  _save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tables)); }
  getTables() { return this.tables; }
  updateTable(name, rows) { if (Array.isArray(rows)) { this.tables[name] = rows; this._save(); } }

  getTable4Rows() {
    const liveRows = dataManager.getWeights();
    if (Array.isArray(liveRows) && liveRows.length > 0) return liveRows;
    return Array.isArray(staticWeightRows) ? staticWeightRows : [];
  }

  getTeeBrlen(headerBore, branchBore) {
    const h = this._n(headerBore), b = this._n(branchBore);
    if (h == null || b == null) return null;
    if (Math.abs(h - b) < 1e-6) {
      const row = this.tables.table1EqualTee.find(r => this._n(r.bore_mm) === h);
      return this._n(row?.m_mm);
    }
    const row = this.tables.table2ReducingTee.find(r => this._n(r.header_bore_mm) === h && this._n(r.branch_bore_mm) === b);
    return this._n(row?.m_mm);
  }

  getOletBrlen(headerBore, branchBore) {
    const h = this._n(headerBore), b = this._n(branchBore);
    const row = this.tables.table3Weldolet.find(r => this._n(r.header_bore_mm) === h && this._n(r.branch_bore_mm) === b);
    if (!row) return null;
    const A = this._n(row.A_mm), od = this._n(row.header_od_mm);
    return A == null || od == null ? null : A + (0.5 * od);
  }

  _normalizedWeightRows() {
    const rows = this.getTable4Rows();
    return rows.map((row) => {
      const bore = this._parseBore(
        row[CONVERTED_BORE_COL] ??
        row.DN ??
        row.NB ??
        row['Size (NPS)'] ??
        row.Size ??
        row.NS
      );
      const rating = this._n(String(row.Rating ?? '').replace(/[^\d.]/g, ''));
      const length = this._n(row['RF-F/F'] ?? row['Length (RF-F/F)'] ?? row['RTJ F/F'] ?? row['BW-F/F'] ?? row.Length ?? row.length);
      const flangeWeight = this._n(row['RF/RTJ KG'] ?? row['Flange Weight'] ?? row.Weight);
      const valveType = this._s(row.TypeDesc ?? row['Type Description'] ?? row['Valve Type'] ?? row.Type ?? '');
      const valveWeight = this._n(row['RF/RTJ KG'] ?? row.Weight);
      return { bore_mm: bore, rating_class: rating, length_mm: length, flange_weight: flangeWeight, valve_type: valveType, valve_weight: valveWeight, quality_ok: bore != null && (flangeWeight != null || valveWeight != null) };
    });
  }

  findValveWeightCandidates({ boreMm, ratingClass, lengthMm }) {
    const b = this._n(boreMm), rc = this._n(ratingClass), len = this._n(lengthMm);
    if (b == null || rc == null || len == null) return [];
    return this._normalizedWeightRows().filter(r =>
      r.quality_ok &&
      this._sameBore(r.bore_mm, b) &&
      r.rating_class === rc &&
      r.length_mm != null &&
      Math.abs(r.length_mm - len) <= 6
    );
  }

  getWeightByBoreAndClass(boreMm, ratingClass) {
    const b = this._n(boreMm), rc = this._n(ratingClass);
    const exact = this._normalizedWeightRows().find(r => r.quality_ok && this._sameBore(r.bore_mm, b) && r.rating_class === rc);
    return exact?.flange_weight ?? null;
  }
  getValveWeightByType(valveType, boreMm = null, ratingClass = null, lengthMm = null) {
    const t = this._s(valveType).toLowerCase(), b = this._n(boreMm), rc = this._n(ratingClass), len = this._n(lengthMm);
    let rows = this._normalizedWeightRows().filter(r => r.quality_ok);
    if (b != null) rows = rows.filter(r => this._sameBore(r.bore_mm, b));
    if (rc != null) rows = rows.filter(r => r.rating_class === rc);
    if (len != null) rows = rows.filter(r => r.length_mm != null && Math.abs(r.length_mm - len) <= 6);
    if (t) {
      const exact = rows.find(r => r.valve_type.toLowerCase() === t);
      return exact?.valve_weight ?? null;
    }
    return rows.length === 1 ? (rows[0].valve_weight ?? null) : null;
  }

  resolveComponentWeight({ type, directWeight, boreMm, ratingClass, valveType, lengthMm }) {
    const trace = []; const t = this._s(type).toUpperCase();
    if (!['FLANGE', 'VALVE', 'TEE', 'OLET', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'].includes(t)) return { weight: null, trace: ['blocked:unsupported-type'] };
    const direct = this._n(directWeight); if (direct != null && direct > 0) return { weight: direct, trace: ['direct-input-weight'] };
    const exactWeight = this.getWeightByBoreAndClass(boreMm, ratingClass);
    if (exactWeight != null) {
      trace.push('table4-exact-bore-class');
      if (t === 'VALVE') {
        const v = this.getValveWeightByType(valveType, boreMm, ratingClass, lengthMm);
        if (v != null) return { weight: v, trace: [...trace, 'table4-exact-valve-match'] };
        const candidates = this.findValveWeightCandidates({ boreMm, ratingClass, lengthMm });
        if (candidates.length > 1) return { weight: null, trace: [...trace, 'blocked:ambiguous-valve-match'] };
        if (candidates.length === 1) return { weight: candidates[0].valve_weight ?? null, trace: [...trace, 'valve-dimension-match'] };
        return { weight: null, trace: [...trace, 'blocked:no-valve-match'] };
      }
      return { weight: exactWeight, trace };
    }
    if (t === 'VALVE') {
      const v = this.getValveWeightByType(valveType, boreMm, ratingClass, lengthMm);
      if (v != null) return { weight: v, trace: ['valve-dimension-match'] };
      const candidates = this.findValveWeightCandidates({ boreMm, ratingClass, lengthMm });
      if (candidates.length > 1) return { weight: null, trace: ['blocked:ambiguous-valve-match'] };
      if (candidates.length === 1) return { weight: candidates[0].valve_weight ?? null, trace: ['valve-dimension-match'] };
      return { weight: null, trace: ['blocked:no-valve-match'] };
    }
    const c300 = this.getWeightByBoreAndClass(boreMm, 300); if (c300 != null) return { weight: c300, trace: ['fallback-class-300'] };
    return { weight: null, trace: ['unresolved-null-safe'] };
  }
}

export const masterTableService = new MasterTableService();
