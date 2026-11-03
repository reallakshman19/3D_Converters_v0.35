/**
 * TopoBuilder
 * Reconstructs continuous piping geometry by inferring synthetic pipe segments 
 * between disconnected fittings based on endpoint gaps.
 */
class TopoBuilder {
  constructor(config = {}) {
    this.gapToleranceMm = config.gapToleranceMm || 10;
  }

  /**
   * Processes the entire pipe hierarchy, injecting synthetic pipe segments.
   * Mutates the hierarchy object in place.
   * @param {Object} hierarchy Canonical PipeHierarchy object from CanonicalMerger
   * @returns {Object} The mutated hierarchy
   */
  build(hierarchy) {
    if (!hierarchy || !hierarchy.pipes) return hierarchy;

    let totalSynthesized = 0;
    for (const pipe of hierarchy.pipes) {
      for (const branch of pipe.branches) {
        totalSynthesized += this._synthesizeBranch(branch);
      }
    }

    console.log(`[TopoBuilder] Synthesized ${totalSynthesized} missing pipes.`);
    return hierarchy;
  }

  _synthesizeBranch(branch) {
    // 1. We need endpoints to do topology. Filter to items that have at least posCenter or posStart.
    const validFittings = branch.fittings.filter(f => f.posStart || f.posEnd || f.posCenter);
    
    if (validFittings.length < 2) return 0;

    // 2. Linearize fittings. AVEVA branches are often ordered, but we can't guarantee it.
    // We will build a naive chain by finding closest endpoint pairs.
    // For a robust implementation, a minimum spanning tree or KD-Tree based chain builder is ideal.
    // Here we will use a greedy nearest-neighbor approach from an arbitrary start point.
    
    // Find the fitting that is an extremity (has an endpoint furthest from the center of mass)
    const sorted = this._greedySortFittings(validFittings);
    const newFittings = [];
    
    let synthIndex = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const f1 = sorted[i];
      const f2 = sorted[i + 1];
      
      newFittings.push(f1);

      // Find the gap between f1 and f2
      const gap = this._measureGap(f1, f2);
      
      if (gap) {
        if (gap.distance > this.gapToleranceMm) {
          const syntheticPipe = {
            name: `=SYNTHETIC_PIPE/${branch.id}/${++synthIndex}`,
            type: "PIPE",
            posStart: this._vecToStr(gap.p1),
            posEnd: this._vecToStr(gap.p2),
            length: Number(gap.distance.toFixed(2)),
            synthetic: true,
            outsideDiameter: f1.outsideDiameter || f2.outsideDiameter,
            bore: f1.bore || f2.bore,
            __source: {
              type: "TopoBuilder",
              posStart: "TopoBuilder",
              posEnd: "TopoBuilder"
            }
          };
          
          syntheticPipe.posCenter = this._vecToStr([
            (gap.p1[0] + gap.p2[0]) / 2,
            (gap.p1[1] + gap.p2[1]) / 2,
            (gap.p1[2] + gap.p2[2]) / 2
          ]);

          newFittings.push(syntheticPipe);
        }
      }
    }
    
    // Push the last fitting
    if (sorted.length > 0) {
      newFittings.push(sorted[sorted.length - 1]);
    }
    
    // Replace original fittings with continuous chain
    branch.fittings = newFittings;
    return synthIndex;
  }

  _greedySortFittings(fittings) {
    if (fittings.length <= 1) return fittings;
    
    const unvisited = [...fittings];
    const chain = [];
    
    // Pick the first item (could be improved by finding true terminal ends)
    chain.push(unvisited.shift());
    
    while (unvisited.length > 0) {
      const lastInChain = chain[chain.length - 1];
      let bestDist = Infinity;
      let bestIdx = -1;
      
      for (let i = 0; i < unvisited.length; i++) {
        const candidate = unvisited[i];
        const gap = this._measureGap(lastInChain, candidate);
        if (gap && gap.distance < bestDist) {
          bestDist = gap.distance;
          bestIdx = i;
        }
      }
      
      if (bestIdx !== -1) {
        chain.push(unvisited.splice(bestIdx, 1)[0]);
      } else {
        // Fallback if no valid gap calculation
        chain.push(unvisited.shift());
      }
    }
    
    return chain;
  }

  _measureGap(f1, f2) {
    // Determine the closest valid endpoints between F1 and F2
    const pts1 = this._extractPoints(f1);
    const pts2 = this._extractPoints(f2);
    
    if (pts1.length === 0 || pts2.length === 0) return null;
    
    let minDist = Infinity;
    let bestPair = null;
    
    for (const p1 of pts1) {
      for (const p2 of pts2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        const dz = p1[2] - p2[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < minDist) {
          minDist = dist;
          bestPair = { p1, p2, distance: dist };
        }
      }
    }
    
    return bestPair;
  }

  _extractPoints(fitting) {
    const pts = [];
    if (fitting.posStart) pts.push(this._parseVec(fitting.posStart));
    if (fitting.posEnd) pts.push(this._parseVec(fitting.posEnd));
    
    // If no endpoints exist, fallback to center
    if (pts.length === 0 && fitting.posCenter) {
      pts.push(this._parseVec(fitting.posCenter));
    }
    
    return pts.filter(p => p !== null);
  }

  _parseVec(str) {
    if (!str) return null;
    // Handle AVEVA string formats like "E 152000mm N 155836.5mm U 1336.5mm"
    // Or simple "152000 155836.5 1336.5"
    const stripped = str.replace(/[ENUWm]/g, '').trim();
    const parts = stripped.split(/\s+/).map(Number);
    if (parts.length >= 3 && !parts.some(isNaN)) {
      return [parts[0], parts[1], parts[2]];
    }
    return null;
  }

  _vecToStr(vec) {
    if (!vec || vec.length < 3) return "";
    return `${vec[0]} ${vec[1]} ${vec[2]}`;
  }
}

module.exports = TopoBuilder;
