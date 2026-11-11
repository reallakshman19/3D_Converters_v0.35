/** Explicit final CII RIGID-weight target -> source Node/Weight conversion.
 *
 * This is a unit/transaction adapter, NOT an estimated physical weight source.
 * The existing R1/R4A/R4B owner gate and actual converter re-extraction retain
 * full authority over the affected source and final RIGID pointer.
 */
const dec=/^(?:\+)?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function hold(code,why){throw Error('SOURCE_OUTPUT_WEIGHT_HOLD '+code+': '+why);}
function decimal(input,field){
  const raw=String(input??'').trim();
  if(!dec.test(raw))hold('INVALID_WEIGHT',field+' must be a finite nonnegative decimal');
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0||value>1e12)
    hold('INVALID_WEIGHT',field+' is out of range');
  return value;
}
function pinnedScale(scale){
  const n=Number(scale);
  if(![1,10].includes(n)||String(scale??'').trim()==='')
    hold('SCALE_UNVERIFIED','Current frozen converter must explicitly pin weight scale 1 or 10');
  return n;
}
/** Converts user-authorized CII OUTPUT value to the XML Weight (kg) token.
 * For a run with scale=10, 0.001 output units requires 0.0001 kg source.
 */
export function sourceWeightFromCiiTarget(outputWeight,weightScale){
  const target=decimal(outputWeight,'Final CII RIGID weight');
  const scale=pinnedScale(weightScale);
  const sourceKg=target/scale;
  if(!Number.isFinite(sourceKg)||sourceKg<0||sourceKg>1e12)
    hold('UNREPRESENTABLE','Target cannot be represented in source Weight');
  const sourceToken=String(sourceKg);
  if(!Number.isFinite(Number(sourceToken)) ||
    Math.abs(Number(sourceToken)*scale-target)>Math.max(1e-10,Math.abs(target)*1e-12))
    hold('SCALE_PRECISION','Source/target conversion exceeds numerical tolerance');
  return {sourceToken,sourceWeightKg:sourceKg,targetOutputWeight:target,
    weightScale:scale,unit:'CII_OUTPUT_WEIGHT',isExplicitUserTarget:true};
}
export function ciiTargetFromSourceWeight(sourceWeightKg,weightScale){
  const source=decimal(sourceWeightKg,'Source XML Weight (kg)');
  const scale=pinnedScale(weightScale);
  const target=source*scale;
  if(!Number.isFinite(target)||target<0||target>1e12)
    hold('UNREPRESENTABLE','Source weight exceeds supported CII output range');
  return {targetOutputWeight:target,sourceWeightKg:source,weightScale:scale,
    unit:'CII_OUTPUT_WEIGHT'};
}
/** Must run BEFORE revised XML/CII download and before finalizing a transaction.
 * No tolerance applies to unrelated RIGIDs, which are compared byte-by-byte
 * by verifySourceEditedCii in the main source-edit pipeline.
 */
export function verifyRequestedCiiOutputWeight({
  requestedOutputWeight,rigidPointer,ciiEngineeringDiff,
}){
  if(requestedOutputWeight===undefined||requestedOutputWeight===null||
    String(requestedOutputWeight).trim()==='')return null;
  const target=decimal(requestedOutputWeight,'Approved final CII weight');
  if(ciiEngineeringDiff?.status!=='PASS_ENGINEERING_DIFF'||
    ciiEngineeringDiff?.unexpectedDifferences!==0||
    ciiEngineeringDiff?.expectedDifferences?.length!==1)
    hold('OUTPUT_NOT_VERIFIED','Only one changed, independently verified CII RIGID is allowed');
  const changed=ciiEngineeringDiff.expectedDifferences[0];
  if(changed.oldRigidPointer!==Number(rigidPointer)||
    !Number.isFinite(changed.newWeight)||
    Math.abs(changed.newWeight-target)>Math.max(1e-8,Math.abs(target)*1e-9))
    hold('TARGET_NOT_EMITTED','Re-extracted CII RIGID does not contain the explicitly requested final weight');
  return {status:'EXACT_REQUESTED_RIGID_WEIGHT_VERIFIED',rigidPointer:Number(rigidPointer),
    requestedCiiOutputWeight:target,actualCiiOutputWeight:changed.newWeight,
    newRigidPointer:changed.newRigidPointer,otherCiiDifferences:0};
}
