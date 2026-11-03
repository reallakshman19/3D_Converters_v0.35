const fs = require('fs');
const BaseAdapter = require('./base-adapter');
const { XMLParser } = require('fast-xml-parser'); // Assuming fast-xml-parser is available or will be

class PsiAdapter extends BaseAdapter {
  constructor(config) {
    super(config.psi);
  }

  parse(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[PSI XML Adapter] File not found: ${filePath}`);
    }

    const xmlData = fs.readFileSync(filePath, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const parsed = parser.parse(xmlData);
    
    const components = [];
    
    // PSI XML Structure: PipeStressExport > Pipe > Branch > Node
    const pipeStressExport = parsed.PipeStressExport || {};
    const pipe = pipeStressExport.Pipe || {};
    
    const branches = Array.isArray(pipe.Branch) ? pipe.Branch : (pipe.Branch ? [pipe.Branch] : []);
    
    for (const branch of branches) {
      const nodes = Array.isArray(branch.Node) ? branch.Node : (branch.Node ? [branch.Node] : []);
      
      // Group nodes by ComponentRefNo (=REV/xxxxx)
      const grouped = new Map();
      
      for (const node of nodes) {
        const refNo = node.ComponentRefNo;
        if (!refNo) continue;
        
        if (!grouped.has(refNo)) {
          grouped.set(refNo, {
            name: refNo,
            originalType: node.ComponentType,
            nodes: []
          });
        }
        grouped.get(refNo).nodes.push(node);
      }
      
      for (const group of grouped.values()) {
        components.push(this._processComponent(group));
      }
    }

    return components;
  }

  _processComponent(group) {
    const mapped = {
      name: group.name,
      type: this.config.typeMap[group.originalType] || "MISC"
    };

    if (mapped.type === "MISC" && this.config.miscPreserveOriginal) {
      mapped.originalType = group.originalType;
    }

    // Extract endpoints and center from grouped nodes
    for (const node of group.nodes) {
      const ep = node.Endpoint;
      const pos = node.Position;
      if (ep == 1) mapped.posStart = pos;
      else if (ep == 2) mapped.posEnd = pos;
      else if (ep == 0) mapped.posCenter = pos; // Center or support attachment
      
      if (node.OutsideDiameter) mapped.outsideDiameter = node.OutsideDiameter;
      if (node.WallThickness) mapped.wallThickness = node.WallThickness;
      if (node.BendRadius) mapped.bendRadius = node.BendRadius;
    }

    return mapped;
  }
}

module.exports = PsiAdapter;
