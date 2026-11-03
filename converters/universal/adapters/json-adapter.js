const fs = require('fs');
const BaseAdapter = require('./base-adapter');

class JsonAdapter extends BaseAdapter {
  constructor(config) {
    super(config || {});
  }

  parse(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[JSON Adapter] File not found: ${filePath}`);
    }

    const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const roots = Array.isArray(payload) ? payload : [payload];
    
    const components = [];
    
    for (const root of roots) {
      this._walkTree(root, "", components);
    }
    
    return components;
  }

  _walkTree(node, parentPath, out) {
    const name = node.name ? node.name.trim() : parentPath;
    const currentPath = parentPath ? `${parentPath}/${name}` : name;
    const children = node.children;
    const bbox = node.bbox;
    
    const isLeaf = !Array.isArray(children) || children.length === 0;

    if (isLeaf && Array.isArray(bbox) && bbox.length === 6) {
      const type = this._inferTypeFromName(name);
      const center = [
        (bbox[0] + bbox[3]) / 2,
        (bbox[1] + bbox[4]) / 2,
        (bbox[2] + bbox[5]) / 2,
      ];
      
      const dx = Math.abs(bbox[3] - bbox[0]);
      const dy = Math.abs(bbox[4] - bbox[1]);
      const dz = Math.abs(bbox[5] - bbox[2]);
      const od = Math.max(dx, dy, dz); // simple fallback

      out.push({
        name: name || "COMPONENT",
        type: type,
        posCenter: `${center[0]} ${center[1]} ${center[2]}`,
        outsideDiameter: od
      });
    }

    if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'object' && child !== null) {
          this._walkTree(child, currentPath, out);
        }
      }
    }
  }

  _inferTypeFromName(name) {
    if (!name) return "RIGID";
    const upper = name.toUpperCase();
    if (upper.includes("ELBOW") || upper.includes("BEND")) return "ELBOW";
    if (upper.includes("REDUCER") || upper.startsWith("REDU")) return "REDU";
    if (upper.includes("TEE")) return "TEE";
    if (upper.includes("VALVE") || upper.includes("VALV")) return "VALVE";
    if (upper.includes("GASK")) return "GASKET";
    if (upper.includes("FLANGE") || upper.includes("FLAN")) return "FLANGE";
    if (upper.includes("SUPPORT") || upper.includes("PIPESUPP")) return "MISC"; // or ATTA
    return "RIGID";
  }
}

module.exports = JsonAdapter;
