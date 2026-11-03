class LinelistStore {
    constructor() {
        this.state = {
            filename: null,
            rawRows: [], // Array of row arrays
            headers: [], // Array of header strings
            headerRowIndex: -1,
            data: [], // Array of objects
            smartMap: {
                P1: null,
                T1: null,
                DensityDirect: null,
                DensityGas: null,
                DensityLiquid: null,
                DensityMixed: null,
                Velocity: null,
                VelocityGas: null,
                VelocityLiquid: null,
                VelocityMixed: null,
                FlowGas: null,
                FlowLiquid: null,
                FlowMixed: null,
                Phase: null,
                PipingClass: null,
                LineRef: null,
                DesignTemp: null,
                DesignPressure: null,
                OperatingTemp: null,
                OperatingPressure: null,
                SlugLength: null,
                LiquidFraction: null,
                DynamicAmplificationFactor: null
            },
            keys: {
                serviceCol: null,
                sequenceCol: null
            },
            smartOptions: {
                densityLogic: {
                    defaultGas: 1.2,
                    defaultLiquid: 1000,
                    mixedPreference: "Liquid"
                },
                smartProcessKeywords: {
                    P1: ["Design Pressure", "P1", "Press"],
                    T1: ["Design Temperature", "T1", "Temp"],
                    DensityDirect: ["Fluid Density", "Density"],
                    DensityGas: ["Gas Density", "Vapor Density"],
                    DensityLiquid: ["Liquid Density"],
                    DensityMixed: ["Mixed Density", "Two Phase Density"],
                    Velocity: ["Velocity", "Vel", "Flow Velocity"],
                    VelocityGas: ["Gas Velocity"],
                    VelocityLiquid: ["Liquid Velocity"],
                    VelocityMixed: ["Mixed Velocity", "Two Phase Velocity"],
                    FlowGas: ["Gas Flow", "Gas Flow Rate"],
                    FlowLiquid: ["Liquid Flow", "Liquid Flow Rate"],
                    FlowMixed: ["Mixed Flow", "Two Phase Flow", "Mixed Flow Rate"],
                    LineRef: ["Line No", "Line Number", "ISO", "Line Ref", "Line", "Pipeline Ref"],
                    DesignTemp: ["Design Temp", "Design Temperature"],
                    DesignPressure: ["Design Press", "Design Pressure"],
                    OperatingTemp: ["Operating Temp", "Operating Temperature"],
                    OperatingPressure: ["Operating Press", "Operating Pressure"],
                    SlugLength: ["Slug Length", "Slug L", "SlugLength"],
                    Phase: ["Phase", "Flow Phase", "Fluid Phase"],
                    LiquidFraction: ["Liquid Fraction", "Liq Fraction", "Liq Frac"],
                    DynamicAmplificationFactor: ["DAF", "Dynamic Amp", "Dynamic Amplification"]
                }
            }
        };

        this._compositeMap = null;
        this._simpleMap = null;

        this._loadConfig();
    }

    _loadConfig() {
        try {
            if (typeof localStorage === 'undefined') return;
            const saved = localStorage.getItem("pcf_linelist_config");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.smartMap) this.state.smartMap = { ...this.state.smartMap, ...parsed.smartMap };
                if (parsed.keys) this.state.keys = { ...this.state.keys, ...parsed.keys };
                if (parsed.smartOptions) this.state.smartOptions = { ...this.state.smartOptions, ...parsed.smartOptions };
                if (parsed.headers) this.state.headers = parsed.headers;
            }
        } catch (e) {
            console.error("Failed to load linelist config", e);
        }
    }

    _saveConfig() {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem("pcf_linelist_config", JSON.stringify({
                smartMap: this.state.smartMap,
                keys: this.state.keys,
                smartOptions: this.state.smartOptions,
                headers: this.state.headers
            }));
        } catch (e) {
            console.error("Failed to save linelist config", e);
        }
    }

    reset() {
        this.state.filename = null;
        this.state.rawRows = [];
        this.state.data = [];
        this.state.headers = [];
        this.state.headerRowIndex = -1;
        this._compositeMap = null;
        this._simpleMap = null;
    }

    processRawData(filename, rawRows) {
        this.reset();
        this.state.filename = filename;
        this.state.rawRows = rawRows;

        // Auto-detect header row
        let headerIdx = -1;
        let maxCols = 0;

        for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
            const row = rawRows[i];
            if (!row) continue;
            const validCols = row.filter(c => c !== undefined && c !== null && String(c).trim() !== "").length;
            if (validCols > maxCols) {
                maxCols = validCols;
                headerIdx = i;
            }
        }

        if (headerIdx === -1) throw new Error("Could not detect header row.");

        this.state.headerRowIndex = headerIdx;
        this.state.headers = rawRows[headerIdx].map(h => String(h || "").trim());

        // Convert raw rows to object array based on headers
        this.state.data = [];
        for (let i = headerIdx + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !row.length) continue;

            // Skip empty rows
            if (row.filter(c => c !== undefined && c !== null && String(c).trim() !== "").length === 0) continue;

            const rowObj = {};
            this.state.headers.forEach((h, idx) => {
                if (h) rowObj[h] = row[idx];
            });
            this.state.data.push(rowObj);
        }

        this.autoMapHeaders(this.state.headers);
        this._invalidateCache();
        this._saveConfig();
        return this.state;
    }

    _invalidateCache() {
        this._compositeMap = null;
        this._simpleMap = null;
    }

    _buildLookupMaps() {
        if (this._compositeMap && this._simpleMap) return;

        const composite = new Map();
        const simple = new Map();

        const serviceCol = this.state.keys.serviceCol;
        const sequenceCol = this.state.keys.sequenceCol || this.state.smartMap.LineRef;

        this.state.data.forEach(row => {
            const serviceVal = serviceCol ? String(row[serviceCol] || "").trim() : "";
            const lineVal = sequenceCol ? String(row[sequenceCol] || "").trim() : "";

            if (serviceVal && lineVal) {
                const key = `${serviceVal}-${lineVal}`;
                if (!composite.has(key)) composite.set(key, row);
            }

            if (lineVal) {
                if (!simple.has(lineVal)) simple.set(lineVal, row);
                // Also add normalized alphanumeric version for fuzzy lookups
                const normLine = lineVal.replace(/[^A-Za-z0-9]/g, '');
                if (normLine && !simple.has(normLine)) simple.set(normLine, row);
            }
        });

        this._compositeMap = composite;
        this._simpleMap = simple;
    }

    autoMapHeaders(headers) {
        if (!headers || !headers.length) return;

        const keywords = this.state.smartOptions.smartProcessKeywords;
        const newMap = { ...this.state.smartMap };

        const findHeader = (tags) => {
            if (!tags) return null;
            // 1. Exact Match
            for (const tag of tags) {
                const exact = headers.find(h => h.toUpperCase() === tag.toUpperCase());
                if (exact) return exact;
            }
            // 2. Fuzzy Match
            const sortedTags = [...tags].sort((a, b) => b.length - a.length);
            for (const tag of sortedTags) {
                const fuzzy = headers.find(h => h.toUpperCase().includes(tag.toUpperCase()));
                if (fuzzy) return fuzzy;
            }
            return null;
        };

        if (!newMap.P1) newMap.P1 = findHeader(keywords.P1);
        if (!newMap.T1) newMap.T1 = findHeader(keywords.T1);

        if (!newMap.DensityDirect) newMap.DensityDirect = findHeader(keywords.DensityDirect);
        if (!newMap.DensityGas) newMap.DensityGas = findHeader(keywords.DensityGas);
        if (!newMap.DensityLiquid) newMap.DensityLiquid = findHeader(keywords.DensityLiquid);
        if (!newMap.DensityMixed) newMap.DensityMixed = findHeader(keywords.DensityMixed);

        if (!newMap.Velocity) newMap.Velocity = findHeader(keywords.Velocity);
        if (!newMap.VelocityGas) newMap.VelocityGas = findHeader(keywords.VelocityGas);
        if (!newMap.VelocityLiquid) newMap.VelocityLiquid = findHeader(keywords.VelocityLiquid);
        if (!newMap.VelocityMixed) newMap.VelocityMixed = findHeader(keywords.VelocityMixed);

        if (!newMap.FlowGas) newMap.FlowGas = findHeader(keywords.FlowGas);
        if (!newMap.FlowLiquid) newMap.FlowLiquid = findHeader(keywords.FlowLiquid);
        if (!newMap.FlowMixed) newMap.FlowMixed = findHeader(keywords.FlowMixed);

        if (!newMap.DesignTemp) newMap.DesignTemp = findHeader(keywords.DesignTemp);
        if (!newMap.DesignPressure) newMap.DesignPressure = findHeader(keywords.DesignPressure);
        if (!newMap.OperatingTemp) newMap.OperatingTemp = findHeader(keywords.OperatingTemp);
        if (!newMap.OperatingPressure) newMap.OperatingPressure = findHeader(keywords.OperatingPressure);

        if (!newMap.SlugLength) newMap.SlugLength = findHeader(keywords.SlugLength);
        if (!newMap.Phase) newMap.Phase = findHeader(keywords.Phase);
        if (!newMap.LiquidFraction) newMap.LiquidFraction = findHeader(keywords.LiquidFraction);
        if (!newMap.DynamicAmplificationFactor) newMap.DynamicAmplificationFactor = findHeader(keywords.DynamicAmplificationFactor);

        if (!newMap.LineRef) newMap.LineRef = findHeader(keywords.LineRef);

        this.state.smartMap = newMap;

        if (!this.state.keys.sequenceCol && newMap.LineRef) {
            this.state.keys.sequenceCol = newMap.LineRef;
        }
    }

    updateKeys(keys) {
        this.state.keys = { ...this.state.keys, ...keys };
        this._invalidateCache();
        this._saveConfig();
    }

    updateSmartMapping(mapping) {
        this.state.smartMap = { ...this.state.smartMap, ...mapping };
        this._invalidateCache();
        this._saveConfig();
    }

    findMatchedRow(rawQueryString) {
        if (!rawQueryString) return null;
        this._buildLookupMaps();

        const cleanLine = String(rawQueryString).trim();
        let match = this._simpleMap.get(cleanLine);

        if (!match) {
            const normLine = cleanLine.replace(/[^A-Za-z0-9]/g, '');
            match = this._simpleMap.get(normLine);

            // Try fuzzy includes if still no match
            if (!match) {
               for (const [key, row] of this._simpleMap.entries()) {
                   if (key.length > 3 && (normLine.includes(key) || key.includes(normLine))) {
                       match = row;
                       break;
                   }
               }
            }
        }

        return match || null;
    }

    getSmartAttributes(queryLineNo) {
        const result = {
            P1: null, T1: null,
            DensityDirect: null, DensityGas: null, DensityLiquid: null, DensityMixed: null,
            Velocity: null, VelocityGas: null, VelocityLiquid: null, VelocityMixed: null,
            FlowGas: null, FlowLiquid: null, FlowMixed: null,
            DesignTemp: null, DesignPressure: null, OperatingTemp: null, OperatingPressure: null,
            SlugLength: null, Phase: null, LiquidFraction: null, DynamicAmplificationFactor: null,
            Found: false, Row: null
        };

        const row = this.findMatchedRow(queryLineNo);
        if (!row) return result;

        result.Found = true;
        result.Row = row;

        const map = this.state.smartMap;
        if (map.P1) result.P1 = row[map.P1];
        if (map.T1) result.T1 = row[map.T1];

        if (map.DensityDirect) result.DensityDirect = row[map.DensityDirect];
        if (map.DensityGas) result.DensityGas = row[map.DensityGas];
        if (map.DensityLiquid) result.DensityLiquid = row[map.DensityLiquid];
        if (map.DensityMixed) result.DensityMixed = row[map.DensityMixed];

        if (map.Velocity) result.Velocity = row[map.Velocity];
        if (map.VelocityGas) result.VelocityGas = row[map.VelocityGas];
        if (map.VelocityLiquid) result.VelocityLiquid = row[map.VelocityLiquid];
        if (map.VelocityMixed) result.VelocityMixed = row[map.VelocityMixed];

        if (map.FlowGas) result.FlowGas = row[map.FlowGas];
        if (map.FlowLiquid) result.FlowLiquid = row[map.FlowLiquid];
        if (map.FlowMixed) result.FlowMixed = row[map.FlowMixed];

        if (map.DesignTemp) result.DesignTemp = row[map.DesignTemp];
        if (map.DesignPressure) result.DesignPressure = row[map.DesignPressure];
        if (map.OperatingTemp) result.OperatingTemp = row[map.OperatingTemp];
        if (map.OperatingPressure) result.OperatingPressure = row[map.OperatingPressure];

        if (map.SlugLength) result.SlugLength = row[map.SlugLength];
        if (map.Phase) result.Phase = row[map.Phase];
        if (map.LiquidFraction) result.LiquidFraction = row[map.LiquidFraction];
        if (map.DynamicAmplificationFactor) result.DynamicAmplificationFactor = row[map.DynamicAmplificationFactor];

        return result;
    }
}

const linelistStoreInstance = new LinelistStore();

export function getLinelist() {
    return linelistStoreInstance.state;
}

export function getLinelistService() {
    return linelistStoreInstance;
}
