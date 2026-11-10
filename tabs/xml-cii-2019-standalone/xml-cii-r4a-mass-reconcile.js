/** R4A immutable physical-owner allocation audit over actual re-extracted
 * source-linked CII RIGIDs. Nothing here creates or patches CII records.
 */
function hold(code,detail){throw Error('R4A_MASS_HOLD '+code+': '+detail);}
function same(a,b,tol=1e-5){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol;}
export function reconcileR4aPhysicalMass({ownership,sourceWeightKg,reextractDiff}) {
  if(!ownership?.eligible || !ownership.completeAllocation ||
      ownership.allocationRule!=='ONE_UNIQUE_WRITER_SOURCE_ONE_EMITTED_RIGID' ||
      !Array.isArray(ownership.allocations) || ownership.allocations.length!==1 ||
      ownership.allocations[0].fraction!==1 ||
      ownership.allocations[0].oldRigidPointer!==ownership.rigidPointer ||
      ownership.dependentPointers?.length!==1 ||
      ownership.dependentPointers[0]!==ownership.rigidPointer)
    hold('SPLIT_ALLOCATION_UNRESOLVED',
      'Complete source-to-all-emitted-RIGID allocation was not independently established.');
  const scale=ownership.weightScale,old=ownership.originalPhysicalMassKg;
  if(![1,10].includes(scale)||!Number.isFinite(old)||old<0)
    hold('CONFIGURATION_NOT_FROZEN','Invalid source mass and configured weight scaling.');
  const edited=Number(sourceWeightKg);
  if(!Number.isFinite(edited)||edited<0)hold('SOURCE_FIELD_NOT_UNIQUE','Invalid revised source mass.');
  if(!same(ownership.originalCiiWeight,old*scale) ||
     !same(ownership.originalAllocatedMassKg,old) ||
     !same(ownership.totalAllocatedMassKg,old))
    hold('MASS_CONSERVATION_MISMATCH',
      'Original source physical mass is not conserved by complete emitted RIGID allocations.');
  if(reextractDiff?.status!=='PASS_ENGINEERING_DIFF' ||
     reextractDiff?.unexpectedDifferences!==0 ||
     reextractDiff?.expectedDifferences?.length!==1)
    hold('MASS_CONSERVATION_MISMATCH','CII engineering difference is not exactly the approved impact set.');
  const actual=reextractDiff.expectedDifferences[0];
  if(actual.oldRigidPointer!==ownership.rigidPointer ||
     !same(actual.oldWeight,old*scale) ||
     !same(actual.newWeight,edited*scale))
    hold('MASS_CONSERVATION_MISMATCH','Final RIGID mass does not reconcile after converter re-extraction.');
  return {
    status:'PASS_PHYSICAL_MASS_CONSERVATION_AFTER_APPROVAL',
    componentRefNo:ownership.physicalComponentRefNo,
    sourceNodeIdentity:ownership.sourceIdentity,
    originalPhysicalMassKg:old,
    approvedRevisedPhysicalMassKg:edited,
    originalEmittedCiiWeight:actual.oldWeight,
    newEmittedCiiWeight:actual.newWeight,
    originalRigidPointer:actual.oldRigidPointer,
    revisedRigidPointer:actual.newRigidPointer,
    allocationRule:ownership.allocationRule,
    completeAllocation:ownership.completeAllocation,
    affectedElements:[actual.linkedElement],
    allocations:[{
      sourceNodeIdentity:ownership.sourceIdentity,
      originalRigidPointer:actual.oldRigidPointer,
      finalRigidPointer:actual.newRigidPointer,
      elementIndex:actual.linkedElement,
      oldAllocatedMassKg:actual.oldWeight/scale,
      newAllocatedMassKg:actual.newWeight/scale,
      fraction:1,
    }],
    originalMassErrorKg:actual.oldWeight/scale-old,
    revisedMassErrorKg:actual.newWeight/scale-edited,
    toleranceCiiUnits:1e-5,
    unexpectedEngineeringDifferences:0,
    physicalOwnerApprovedForTransactionOnly:true,
  };
}
