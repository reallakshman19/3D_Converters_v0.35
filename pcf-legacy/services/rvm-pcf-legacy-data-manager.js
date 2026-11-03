import { state, updateRvmPcfExtractState } from '../../core/state.js';
import {
  ensureConvertedBoreRows,
  guessBoreSourceColumn
} from './bore-converter.js';

function masters() {
  if (!state.rvmPcfExtract) state.rvmPcfExtract = {};
  if (!state.rvmPcfExtract.masters) state.rvmPcfExtract.masters = {};
  return state.rvmPcfExtract.masters;
}

function setMasterPatch(patch, reason = 'legacy-master-update') {
  updateRvmPcfExtractState({
    masters: {
      ...(state.rvmPcfExtract?.masters || {}),
      ...patch
    }
  }, reason);
}

class RvmPcfLegacyDataManager {
  constructor() {
    this.headerMap = {
      linelist: {
        lineNo: 'Line Number',
        service: 'Service',
        convertedBore: 'Converted Bore'
      },
      weights: {
        size: 'Size (NPS)',
        length: 'Length (RF-F/F)',
        description: 'Type Description',
        weight: 'RF/RTJ KG',
        rating: 'Rating',
        convertedBore: 'Converted Bore'
      },
      pipingclass: {
        size: 'Size',
        class: 'Piping Class',
        convertedBore: 'Converted Bore',
        material: 'Material_Name',
        wall: 'Wall Thickness',
        corrosion: 'Corrosion Allowance'
      },
      linedump: {
        lineNo: 'Line No. (Derived)',
        position: 'Position',
        x: 'East',
        y: 'North',
        z: 'Up'
      }
    };

    this._onChangeCallbacks = [];
  }

  _rows(type) {
    const m = masters();
    if (type === 'linelist') return m.linelist?.rows || [];
    if (type === 'weights') return m.weight?.rows || [];
    if (type === 'pipingclass') return m.pipingClass?.rows || [];
    if (type === 'materialmap') return m.materialMap?.rows || [];
    if (type === 'linedump') return m.lineDump?.rows || [];
    if (type === 'pcf') return state.rvmPcfExtract?.rows || [];
    return [];
  }

  _withConvertedBore(type, rows, sourceColumn = null) {
    const chosen = sourceColumn || this.getConvertedBoreSource(type, rows);
    return ensureConvertedBoreRows(rows, { type, sourceColumn: chosen });
  }

  getConvertedBoreSource(type, rows = null) {
    const data = Array.isArray(rows) ? rows : this._rows(type);
    return data?.length ? guessBoreSourceColumn(Object.keys(data[0] || {}), type) : '';
  }

  convertMasterBores(type, sourceColumn) {
    const src = String(sourceColumn || '').trim();
    if (!src) return { converted: 0, unresolved: 0, sourceColumn: '' };

    const current = this._rows(type);
    const result = this._withConvertedBore(type, current, src);

    if (type === 'linelist') this.setLinelist(result.rows);
    if (type === 'weights') this.setWeights(result.rows);
    if (type === 'pipingclass') this.setPipingClassMaster(result.rows);

    return result;
  }

  getLinelist() { return this._rows('linelist'); }
  getWeights() { return this._rows('weights'); }
  getPipingClassMaster() { return this._rows('pipingclass'); }
  getMaterialMap() { return this._rows('materialmap'); }
  getPCF() { return this._rows('pcf'); }
  getLineDump() { return this._rows('linedump'); }

  setLinelist(rows) {
    const converted = this._withConvertedBore('linelist', Array.isArray(rows) ? rows : []);
    setMasterPatch({
      linelist: {
        ...(masters().linelist || {}),
        rows: converted.rows,
        sourceColumn: converted.sourceColumn,
        converted: converted.converted,
        unresolved: converted.unresolved
      }
    }, 'legacy-linelist-set');
    this._notifyChange('linelist');
  }

  setWeights(rows) {
    const converted = this._withConvertedBore('weights', Array.isArray(rows) ? rows : []);
    setMasterPatch({
      weight: {
        ...(masters().weight || {}),
        rows: converted.rows,
        sourceColumn: converted.sourceColumn,
        converted: converted.converted,
        unresolved: converted.unresolved
      }
    }, 'legacy-weights-set');
    this._notifyChange('weights');
  }

  setPipingClassMaster(rows) {
    const converted = this._withConvertedBore('pipingclass', Array.isArray(rows) ? rows : []);
    setMasterPatch({
      pipingClass: {
        ...(masters().pipingClass || {}),
        rows: converted.rows,
        sourceColumn: converted.sourceColumn,
        converted: converted.converted,
        unresolved: converted.unresolved
      }
    }, 'legacy-pipingclass-set');
    this._notifyChange('pipingclass');
  }

  setMaterialMap(rows) {
    setMasterPatch({
      materialMap: {
        ...(masters().materialMap || {}),
        rows: Array.isArray(rows) ? rows : []
      }
    }, 'legacy-materialmap-set');
    this._notifyChange('materialmap');
  }

  setLineDump(rows) {
    setMasterPatch({
      lineDump: {
        ...(masters().lineDump || {}),
        rows: Array.isArray(rows) ? rows : []
      }
    }, 'legacy-linedump-set');
    this._notifyChange('linedump');
  }

  setPCF(rows) {
    updateRvmPcfExtractState({
      rows: Array.isArray(rows) ? rows : []
    }, 'legacy-pcf-set');
    this._notifyChange('pcf');
  }

  getPipingClassMasterFromStorage() {
    return this.getPipingClassMaster();
  }

  async loadPipingClassSizes(sizes = []) {
    const baseUrl = masters().pipingClass?.baseUrl || './Docs/Masters/piping_class/size_wise/';
    const loaded = [];
    const failed = [];

    for (const size of sizes) {
      const cleanSize = String(size || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
      if (!cleanSize) continue;

      try {
        const response = await fetch(`${baseUrl}${cleanSize}.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = await response.json();
        loaded.push(...(Array.isArray(rows) ? rows : []));
      } catch (err) {
        failed.push({ size, error: err.message });
      }
    }

    if (loaded.length) {
      this.setPipingClassMaster([
        ...this.getPipingClassMaster(),
        ...loaded
      ]);
    }

    return { loadedRows: loaded.length, failed };
  }

  updateHeaderMap(type, newMap) {
    this.headerMap[type] = {
      ...(this.headerMap[type] || {}),
      ...(newMap || {})
    };
    this._notifyChange(type);
  }

  onChange(callback) {
    if (typeof callback === 'function') this._onChangeCallbacks.push(callback);
  }

  _notifyChange(dataType) {
    for (const cb of this._onChangeCallbacks) {
      try { cb(dataType); } catch {}
    }
  }

  reset() {
    setMasterPatch({
      linelist: { rows: [] },
      weight: { rows: [] },
      pipingClass: { rows: [] },
      materialMap: { rows: [] },
      lineDump: { rows: [] }
    }, 'legacy-master-reset');
    this._notifyChange('reset');
  }
}

export const rvmPcfLegacyDataManager = new RvmPcfLegacyDataManager();
export const dataManager = rvmPcfLegacyDataManager;
