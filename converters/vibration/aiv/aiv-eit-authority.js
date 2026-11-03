export function assertAivEitScreeningAuthority(result) {
  if (result?.schema !== 'AivCalculatorResult.v1' || result.qualificationMode !== 'screening') {
    throw new TypeError('AIV .eit export requires an AivCalculatorResult.v1 screening result.');
  }
  if (result.screeningResultScope !== 'ASSESSMENT' || result.lineCaseSummaryAuthoritativeForScreening !== false) {
    throw new Error('AIV_EIT_AUTHORITY_SCOPE_INVALID: .eit export requires assessment-level AIV screening authority.');
  }
  if (result.authority?.screeningAuthority !== 'AUTHORIZED' || result.authority?.designAuthority !== false) {
    throw new Error('AIV_EIT_AUTHORITY_INVALID: screening authority must be AUTHORIZED and designAuthority=false.');
  }
}
