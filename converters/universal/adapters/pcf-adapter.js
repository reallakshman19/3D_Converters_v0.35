const fs = require('fs');
const BaseAdapter = require('./base-adapter');

class PcfAdapter extends BaseAdapter {
  constructor(config) {
    super(config.pcf);
  }

  parse(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[PCF Adapter] File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const components = [];

    let currentComponent = null;
    let componentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // A component starts when a line has no spaces and is not a known header (simplified parsing)
      if (!line.includes(' ') && line !== 'PIPELINE-REFERENCE' && line !== 'UNITS-BORE' && line !== 'UNITS-CO-ORDS') {
        if (currentComponent) {
          components.push(this._processComponent(currentComponent));
        }
        currentComponent = {
          originalType: line,
          name: `=PCF/${++componentIndex}`, // Synthetic ID
        };
      } else if (currentComponent) {
        const parts = line.split(/\s+/);
        const key = parts[0];
        
        if (key === 'END-POINT') {
          const epStr = `${parts[1]} ${parts[2]} ${parts[3]}`;
          if (!currentComponent.posStart) currentComponent.posStart = epStr;
          else if (!currentComponent.posEnd) currentComponent.posEnd = epStr;
        } else if (key === 'CENTRE-POINT') {
          currentComponent.posCenter = `${parts[1]} ${parts[2]} ${parts[3]}`;
        } else if (key === 'SKEY') {
          currentComponent.SKEY = parts[1];
        } else if (key === 'ATTRIBUTE' && parts[1] === 'NOMINAL-BORE') {
          currentComponent['NOMINAL-BORE'] = parts[2];
        }
      }
    }

    if (currentComponent) {
      components.push(this._processComponent(currentComponent));
    }

    return components;
  }

  _processComponent(raw) {
    const mapped = this.mapFields(raw, this.config.fieldMap || {});
    mapped.name = raw.name;
    
    // Type mapping
    if (this.config.typeMap && this.config.typeMap[raw.originalType]) {
      mapped.type = this.config.typeMap[raw.originalType];
    } else {
      mapped.type = "MISC";
      if (this.config.miscPreserveOriginal) {
        mapped.originalType = raw.originalType;
      }
    }

    return mapped;
  }
}

module.exports = PcfAdapter;
