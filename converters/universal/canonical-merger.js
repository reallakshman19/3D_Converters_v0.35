const fs = require('fs');
const path = require('path');

class CanonicalMerger {
  constructor(configPath) {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    this.priorityMap = this._buildPriorityMap();
  }

  _buildPriorityMap() {
    const map = {};
    const priorityList = this.config.mergePriority || ["PSI_XML", "PCF", "ATT_TXT", "REV", "JSON"];
    // Lower index = higher priority. Map stores higher value for higher priority for easier comparison.
    const maxPrio = priorityList.length;
    priorityList.forEach((source, index) => {
      map[source] = maxPrio - index;
    });
    return map;
  }

  /**
   * Merge datasets from multiple adapters into a single canonical map.
   * @param {Object} adapterOutputs - Map of sourceName -> Array of component objects
   * @returns {Array} Merged canonical components
   */
  merge(adapterOutputs) {
    const canonicalMap = new Map();

    for (const [sourceAdapter, components] of Object.entries(adapterOutputs)) {
      if (!Array.isArray(components)) {
        throw new Error(`Expected array of components from ${sourceAdapter}, got ${typeof components}`);
      }

      for (const comp of components) {
        if (!comp.name) {
          console.warn(`[Merger] Skipping component from ${sourceAdapter} missing 'name' field.`);
          continue;
        }

        if (!canonicalMap.has(comp.name)) {
          canonicalMap.set(comp.name, {
            name: comp.name,
            __source: { name: sourceAdapter }
          });
        }

        const canonical = canonicalMap.get(comp.name);
        this._mergeComponent(canonical, comp, sourceAdapter);
      }
    }

    return Array.from(canonicalMap.values());
  }

  _mergeComponent(canonical, incoming, sourceAdapter) {
    const incomingPriority = this.priorityMap[sourceAdapter] || 0;

    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'name' || value === undefined || value === null) continue;

      const currentSource = canonical.__source[key];
      const currentPriority = currentSource ? (this.priorityMap[currentSource] || 0) : -1;

      if (incomingPriority > currentPriority) {
        canonical[key] = value;
        canonical.__source[key] = sourceAdapter;
      }
    }
  }

  /**
   * Transforms the flat merged component list into the canonical Pipe/Branch hierarchy.
   */
  buildHierarchy(mergedComponents) {
    const pipes = new Map();

    for (const comp of mergedComponents) {
      // Extract pipe name and branch id based on ownerPath or branchRef
      const pathInfo = comp.ownerPath || comp.branchRef || "/UNSPECIFIED_PIPE/B1";
      const { pipeName, branchId } = this._parsePath(pathInfo);

      if (!pipes.has(pipeName)) {
        pipes.set(pipeName, {
          name: pipeName,
          spec: comp.spec || "UNKNOWN",
          branches: new Map()
        });
      }

      const pipe = pipes.get(pipeName);
      if (comp.spec && pipe.spec === "UNKNOWN") {
        pipe.spec = comp.spec;
      }

      if (!pipe.branches.has(branchId)) {
        pipe.branches.set(branchId, {
          id: branchId,
          fittings: [],
          supports: [],
          misc: []
        });
      }

      const branch = pipe.branches.get(branchId);
      
      // Categorize component
      const type = comp.type || "MISC";
      if (type === "SUPPORT") {
        branch.supports.push(comp);
      } else if (type === "MISC") {
        branch.misc.push(comp);
      } else {
        branch.fittings.push(comp);
      }
    }

    // Convert Maps to Arrays for easier serialization
    const hierarchy = { pipes: [] };
    for (const pipe of pipes.values()) {
      const p = { name: pipe.name, spec: pipe.spec, branches: [] };
      for (const branch of pipe.branches.values()) {
        p.branches.push(branch);
      }
      hierarchy.pipes.push(p);
    }

    return hierarchy;
  }

  _parsePath(fullPath) {
    if (!fullPath) return { pipeName: "UNSPECIFIED", branchId: "B1" };
    const parts = fullPath.split('/');
    if (parts.length < 2) return { pipeName: fullPath, branchId: "B1" };
    
    const branchId = parts.pop();
    const pipeName = parts.join('/');
    return { pipeName: pipeName || "/", branchId };
  }

  /**
   * Helper to write canonical hierarchy to disk
   */
  saveToDisk(hierarchy, outputPath) {
    // Generate basic XML manually to avoid adding external dependencies just yet
    // For a production app, we'd use xmlbuilder or similar.
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<PipeHierarchy version="1.0">\n';
    
    for (const pipe of hierarchy.pipes) {
      xml += `  <Pipe name="${this._esc(pipe.name)}" spec="${this._esc(pipe.spec)}">\n`;
      
      for (const branch of pipe.branches) {
        xml += `    <Branch id="${this._esc(branch.id)}">\n`;
        
        for (const f of branch.fittings) {
          xml += this._formatComponentXML('Fitting', f, '      ');
        }
        for (const s of branch.supports) {
          xml += this._formatComponentXML('Support', s, '      ');
        }
        for (const m of branch.misc) {
          xml += this._formatComponentXML('Misc', m, '      ');
        }
        
        xml += `    </Branch>\n`;
      }
      xml += `  </Pipe>\n`;
    }
    
    xml += '</PipeHierarchy>\n';
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, xml, 'utf-8');
  }

  _formatComponentXML(tagName, comp, indent) {
    let xml = `${indent}<${tagName}`;
    
    // Core attributes
    const attrKeys = ['type', 'name', 'description', 'posCenter', 'posStart', 'posEnd', 'bore'];
    for (const k of attrKeys) {
      if (comp[k]) xml += ` ${k}="${this._esc(comp[k])}"`;
    }
    xml += '>\n';
    
    // Provenance
    if (comp.__source) {
      xml += `${indent}  <Provenance>\n`;
      for (const [field, source] of Object.entries(comp.__source)) {
        xml += `${indent}    <Field name="${field}" source="${source}" />\n`;
      }
      xml += `${indent}  </Provenance>\n`;
    }
    
    // Additional data not mapped to core attributes
    for (const [k, v] of Object.entries(comp)) {
      if (k === '__source' || attrKeys.includes(k) || k === 'ownerPath' || k === 'branchRef') continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
         xml += `${indent}  <Data key="${k}" value="${this._esc(v)}" />\n`;
      }
    }

    xml += `${indent}</${tagName}>\n`;
    return xml;
  }

  _esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = CanonicalMerger;
