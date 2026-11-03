import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmpiricalWeightTuningSession,
  validateEmpiricalWeightTuningModel,
} from '../converters/empirical-weight/empirical-weight-tuning.js';

const MODEL={
  approach1:{models:[{target:'RF/RTJ KG',typeDesc:'Valve',rating:150,band:1,nsMin:1,nsMax:4,model:'LOG1',a:1,b:2,c:null}]},
  approach2:{
    constants:{ratioRidgeSlope:.2,ratioRegressionWeight:.6,ratioSideMedianWeight:.4,ratioOneSidedMaxPoints:4,ratioAnchorOffset:.15,ratioSupportExponent:.3,sameRatingNearestPoints:3,crossDistanceOffset:.1,crossDistancePower:3,crossNearestRectangles:12,crossTrimQuantile:.9,metaFolds:5,metaSeed:31,metaSimplexStep:.1},
    stackWeights:{'RF/RTJ KG':{Valve:[.4,.4,.2]}},
  },
};

test('baseline tuning model validates',()=>assert.equal(validateEmpiricalWeightTuningModel(MODEL).ok,true));
test('candidate edits are isolated from baseline',()=>{const session=createEmpiricalWeightTuningSession(MODEL);session.updateConstant('ratioRidgeSlope',.3);assert.equal(session.isDirty(),true);assert.equal(MODEL.approach2.constants.ratioRidgeSlope,.2);assert.equal(session.snapshot().approach2.constants.ratioRidgeSlope,.3);});
test('stack sum is a publication blocker',()=>{const session=createEmpiricalWeightTuningSession(MODEL);const v=session.updateStackWeights('RF/RTJ KG','Valve',[.6,.6,.2]);assert.equal(v.ok,false);assert(v.errors.some(e=>e.code==='STACK_SUM'));});
test('blank tuning numerics fail closed instead of coercing to zero',()=>{const coefficientSession=createEmpiricalWeightTuningSession(MODEL);const coefficientValidation=coefficientSession.updateA1Coefficient({target:'RF/RTJ KG',typeDesc:'Valve',rating:150,band:1},'a','');assert.equal(coefficientValidation.ok,false);assert(coefficientValidation.errors.some(e=>e.code==='INVALID_A1_COEFFICIENT'));const constantSession=createEmpiricalWeightTuningSession(MODEL);const constantValidation=constantSession.updateConstant('ratioRidgeSlope','');assert.equal(constantValidation.ok,false);assert(constantValidation.errors.some(e=>e.code==='INVALID_CONSTANT'));const stackSession=createEmpiricalWeightTuningSession(MODEL);const stackValidation=stackSession.updateStackWeights('RF/RTJ KG','Valve',[.4,'',.6]);assert.equal(stackValidation.ok,false);assert(stackValidation.errors.some(e=>e.code==='INVALID_STACK_WEIGHTS'));});
test('revert restores candidate',()=>{const session=createEmpiricalWeightTuningSession(MODEL);session.updateA1Coefficient({target:'RF/RTJ KG',typeDesc:'Valve',rating:150,band:1},'a',9);assert.equal(session.snapshot().approach1.models[0].a,9);session.revert();assert.equal(session.snapshot().approach1.models[0].a,1);assert.equal(session.isDirty(),false);});
