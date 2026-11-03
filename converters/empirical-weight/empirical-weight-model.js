import { MODELS as M1 } from './model/part-1.js';
import { MODELS as M2 } from './model/part-2.js';
import { MODELS as M3 } from './model/part-3.js';
import { MODELS as M4 } from './model/part-4.js';
import { MODELS as M5 } from './model/part-5.js';
import { MODELS as M6 } from './model/part-6.js';
const models=[...M1,...M2,...M3,...M4,...M5,...M6];
export const EMPIRICAL_WEIGHT_MODEL=Object.freeze({
  schemaVersion:1,
  sourceMasterCommit:'b168cced3f5aaaada15de290d14ce64928a9a7a3',
  conceptNotePath:'docs/EmpericalWeightconceptNote.md',
  approach1:{
    models,
    validation:{
      'RF/RTJ KG':{n:1502,mape:.1099,medianApe:.0635,p90Ape:.2257,within15:.8409},
      'BW KG':{n:782,mape:.1141,medianApe:.0676,p90Ape:.2885,within15:.8223}
    }
  },
  approach2:{
    constants:{ratioRidgeSlope:.2,ratioRegressionWeight:.6,ratioSideMedianWeight:.4,ratioOneSidedMaxPoints:4,ratioAnchorOffset:.15,ratioSupportExponent:.3,sameRatingNearestPoints:3,crossDistanceOffset:.1,crossDistancePower:3,crossNearestRectangles:12,crossTrimQuantile:.9,metaFolds:5,metaSeed:31,metaSimplexStep:.1},
    stackWeights:{'RF/RTJ KG':{"Blind Flange":[0.12,0.04,0.84],"Flanged Ball Valve -Full Bore":[0.56,0.26,0.18],"Flanged Ball Valve -Short Pattern":[0.64,0.2,0.16],"Flanged Ball Valve-Reduced Bore":[0.66,0.06,0.28],"Flanged Control Valve":[0.2,0.64,0.16],"Flanged Gate Valve":[0.38,0.58,0.04],"Flanged Globe Valve":[0.44,0.06,0.5],"Flanged Swing check Valve":[0.38,0.62,0.0],"Flanged wafer Valve":[0.82,0.16,0.02],"Instrument-ESDV/UZV":[0.34,0.16,0.5],"Instrument-XCV":[0.18,0.14,0.68],"Lug type Valve":[0.82,0.12,0.06],"SPECTACLE BLIND":[0.82,0.0,0.18],"Triple Offset Flanged Butterfly valve":[0.9,0.02,0.08],"Wafer type Valve":[0.34,0.56,0.1],"Weldneck Flange":[0.5,0.22,0.28],"Weldneck Flange Series A":[0.92,0.08,0.0],"Weldneck Flange Series B":[0.1,0.64,0.26]},'BW KG':{"Flanged Ball Valve -Short Pattern":[0.38,0.48,0.14],"Flanged Ball Valve-Reduced Bore":[0.46,0.24,0.3],"Flanged Control Valve":[0.36,0.4,0.24],"Flanged Gate Valve":[0.38,0.58,0.04],"Flanged Globe Valve":[0.24,0.68,0.08],"Flanged Swing check Valve":[0.46,0.54,0.0],"Instrument-ESDV/UZV":[0.32,0.16,0.52],"Instrument-XCV":[0.18,0.1,0.72]}},
    validation:{
      'RF/RTJ KG':{n:1502,mape:.0999,medianApe:.0619,p90Ape:.1823,within15:.8475},
      'BW KG':{n:782,mape:.0952,medianApe:.0627,p90Ape:.2048,within15:.8223}
    }
  }
});
