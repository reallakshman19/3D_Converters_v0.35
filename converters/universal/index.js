const path = require('path');
const fs = require('fs');
const CanonicalMerger = require('./canonical-merger');

const AttAdapter = require('./adapters/att-adapter');
const PsiAdapter = require('./adapters/psi-adapter');
const RevAdapter = require('./adapters/rev-adapter');
const PcfAdapter = require('./adapters/pcf-adapter');
const JsonAdapter = require('./adapters/json-adapter');

const TopoBuilder = require('./topo-builder');

class UniversalPipeline {
  constructor(configPath) {
    this.configPath = configPath;
    this.merger = new CanonicalMerger(configPath);
    this.topoBuilder = new TopoBuilder(this.merger.config.topoBuilder || { gapToleranceMm: 10 });
    
    const config = this.merger.config;
    this.adapters = {
      "ATT_TXT": new AttAdapter(config),
      "PSI_XML": new PsiAdapter(config),
      "REV": new RevAdapter(config),
      "PCF": new PcfAdapter(config),
      "JSON": new JsonAdapter(config)
    };
  }

  run(inputs, outputPath) {
    console.log(`[UniversalPipeline] Starting merge with inputs:`, inputs);
    const adapterOutputs = {};

    for (const [source, filePath] of Object.entries(inputs)) {
      if (this.adapters[source]) {
        try {
          console.log(`[UniversalPipeline] Parsing ${source} from ${filePath}...`);
          adapterOutputs[source] = this.adapters[source].parse(filePath);
          console.log(`[UniversalPipeline] ${source} parsed ${adapterOutputs[source].length} components.`);
        } catch (err) {
          console.error(`[UniversalPipeline] FATAL ERROR parsing ${source}:`, err.message);
          throw err; 
        }
      } else {
        console.warn(`[UniversalPipeline] Unknown adapter source: ${source}`);
      }
    }

    console.log(`[UniversalPipeline] Merging adapter outputs...`);
    const mergedComponents = this.merger.merge(adapterOutputs);
    console.log(`[UniversalPipeline] Merged into ${mergedComponents.length} canonical components.`);

    console.log(`[UniversalPipeline] Building hierarchy...`);
    let hierarchy = this.merger.buildHierarchy(mergedComponents);

    console.log(`[UniversalPipeline] Running TopoBuilder...`);
    hierarchy = this.topoBuilder.build(hierarchy);

    console.log(`[UniversalPipeline] Saving canonical XML to ${outputPath}...`);
    this.merger.saveToDisk(hierarchy, outputPath);
    console.log(`[UniversalPipeline] Success!`);
  }
}

// Simple CLI wrapper for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Usage: node index.js --att path/to/att.txt --psi path/to/psi.xml --output path/to/canonical.xml");
    process.exit(1);
  }

  const inputs = {};
  let outputPath = "canonical_output.xml";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--att') inputs["ATT_TXT"] = args[++i];
    else if (args[i] === '--psi') inputs["PSI_XML"] = args[++i];
    else if (args[i] === '--rev') inputs["REV"] = args[++i];
    else if (args[i] === '--pcf') inputs["PCF"] = args[++i];
    else if (args[i] === '--json') inputs["JSON"] = args[++i];
    else if (args[i] === '--output') outputPath = args[++i];
  }

  const pipeline = new UniversalPipeline(path.join(__dirname, 'settings', 'adapter-mapping.json'));
  try {
    pipeline.run(inputs, outputPath);
  } catch (e) {
    console.error("Pipeline failed:", e);
    process.exit(1);
  }
}

module.exports = UniversalPipeline;
