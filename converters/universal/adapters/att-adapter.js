const fs = require('fs');
const BaseAdapter = require('./base-adapter');

class AttAdapter extends BaseAdapter {
  constructor(config) {
    super(config.att);
  }

  parse(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[ATT Adapter] File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const components = [];

    // Parse logic for RMSS_ATTRIBUTE.TXT style
    // Format: NEW <type> <name>
    //         <key> := <value>
    //         END
    let currentComponent = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('NEW ')) {
        const parts = line.split(/\s+/);
        const name = parts.slice(1).join(' ').trim();
        
        currentComponent = {
          name,
          // Raw fields container
        };
      } else if (line === 'END') {
        if (currentComponent) {
          // In RMSS_ATTRIBUTE.TXT, originalType is given by TYPE := ...
          if (currentComponent.TYPE) {
            currentComponent.originalType = currentComponent.TYPE;
          }
          components.push(this._processComponent(currentComponent));
          currentComponent = null;
        }
      } else if (currentComponent && line.includes(':=')) {
        const splitIndex = line.indexOf(':=');
        const key = line.substring(0, splitIndex).trim();
        let value = line.substring(splitIndex + 2).trim();
        
        // Remove trailing " [description]" if present in RMSS attribute format
        const descIndex = value.lastIndexOf(' [');
        if (descIndex !== -1 && value.endsWith(']')) {
          value = value.substring(0, descIndex).trim();
        }

        currentComponent[key] = value;
      }
    }

    return components;
  }

  _processComponent(raw) {
    // 1. Map fields based on config
    const mapped = this.mapFields(raw, this.config.fieldMap || {});
    mapped.name = raw.name;
    
    // 2. Type mapping
    if (this.config.typeMap && this.config.typeMap[raw.originalType]) {
      mapped.type = this.config.typeMap[raw.originalType];
    } else {
      mapped.type = "MISC";
      if (this.config.miscPreserveOriginal) {
        mapped.originalType = raw.originalType;
      }
    }

    // 3. ATTA Rule
    if (raw.originalType === 'ATTA' && this.config.attaRule) {
      const rule = this.config.attaRule;
      const apos = raw[rule.field];
      const lpos = raw[rule.matchField];
      
      if (apos && lpos && apos === lpos) {
        mapped.type = rule.onMatch || "SUPPORT";
      } else {
        mapped.type = rule.onNoMatch || "MISC";
      }
      
      if (rule.supportNameField && raw[rule.supportNameField]) {
        mapped.supportName = raw[rule.supportNameField];
      }
    }

    // Validation (Strict mode)
    if (!mapped.name) {
       throw new Error(`[ATT Adapter] Strict validation failed: Component missing 'name'. Raw: ${JSON.stringify(raw)}`);
    }

    return mapped;
  }
}

module.exports = AttAdapter;
