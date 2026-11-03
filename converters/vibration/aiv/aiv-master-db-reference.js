export const AIV_MASTER_DB_REFERENCE = Object.freeze({
  schema: 'AivMasterDbReference.v1',
  repository: 'reallaksh19/Advanced_Analysis',
  commit: 'dad2f1dbf8f200132c9669d275467611d51d6d3b',
  path: 'docs/EI data/AIV misc/masters',
  verificationLevel: 'EXACT_GIT_BLOB_AND_STRUCTURAL_VALIDATION',
  engineeringQualification: 'NOT_ESTABLISHED_BY_ADAPTER',
  files: Object.freeze({
    'M_COMPONENT_TYPE.csv': '700f4c8da754a5ec3bc59cafd54a3581b05e5b65',
    'M_DOCUMENT_SOURCE.csv': '75894476eaddaecbcacc637a8e968dc5414d72b6',
    'M_MATERIAL.csv': '731fdd83b6f6f6ebc5ca9b964be55c508ad85ed7',
    'M_PIPE_DIMENSION.csv': '7aaee1609329f00273a40637052705eed251b30b',
    'M_PIPING_CLASS.csv': 'c3c3381295b22b94354651e76af79519e44e6017',
    'M_SOURCE_DEVICE_TYPE.csv': '0019925fe1cc56945fe3a7154edefa3fb5b5dd47',
    'M_UNIT.csv': 'd0364eb267d94c784a058810c5c4173cbded4d37',
  }),
});

export const AIV_MASTER_TABLE_SPECS = Object.freeze({
  'M_DOCUMENT_SOURCE.csv': Object.freeze({
    key: 'documents', pk: 'SourceDocumentId',
    columns: Object.freeze(['SourceDocumentId','DocumentNumber','DocumentTitle','DocumentType','Organization','Edition','Revision','IssueDate','AuthorityLevel','RecordVersion','FileReference','DocumentHash','SupersededBy','DataOwner','Status']),
  }),
  'M_UNIT.csv': Object.freeze({
    key: 'units', pk: 'UnitId',
    columns: Object.freeze(['UnitId','QuantityType','UnitSymbol','CanonicalUnit','ScaleToCanonical','OffsetToCanonical','PressureBasisAllowed','Description','Status']),
  }),
  'M_MATERIAL.csv': Object.freeze({
    key: 'materials', pk: 'MaterialId',
    columns: Object.freeze(['MaterialId','Specification','Grade','MaterialFamily','BaseMaterialType','IsDuplex','IsStainless','IsCarbonSteel','SourceDocumentId','SourceRecord','StandardEdition','Status']),
  }),
  'M_COMPONENT_TYPE.csv': Object.freeze({
    key: 'components', pk: 'ComponentTypeId',
    columns: Object.freeze(['ComponentTypeId','ComponentFamily','ComponentSubtype','ModelType','IsAivAssessmentCandidate','AivAssessmentType','RequiresBranchGeometry','MainSizeRequired','BranchSizeRequired','Description','SourceDocumentId','Revision','Status']),
  }),
  'M_SOURCE_DEVICE_TYPE.csv': Object.freeze({
    key: 'sourceDevices', pk: 'SourceDeviceTypeId',
    columns: Object.freeze(['SourceDeviceTypeId','ComponentFamily','ComponentSubtype','ModelType','IsAivSourceCandidate','AivSourceDeviceType','RequiresPressureDrop','RequiresMassFlow','RequiresTemperature','RequiresMolecularWeight','SupportsLowNoiseTrim','Description','SourceDocumentId','Revision','Status']),
  }),
  'M_PIPE_DIMENSION.csv': Object.freeze({
    key: 'pipeDimensions', pk: 'PipeDimensionId',
    columns: Object.freeze(['PipeDimensionId','Standard','StandardEdition','NPS','DN','OutsideDiameter','OutsideDiameterUnit','Schedule','WallThickness','WallThicknessUnit','InsideDiameter','InsideDiameterUnit','SourceDocumentId','SourceRecord','Status']),
  }),
  'M_PIPING_CLASS.csv': Object.freeze({
    key: 'pipingClasses', pk: 'PipingClassRecordId',
    columns: Object.freeze(['PipingClassRecordId','PipingClassId','ComponentFamily','NPS','DN','Schedule','NominalWallThickness','WallThicknessUnit','MaterialId','PressureClass','BranchType','BranchNPS','BranchDN','BranchSchedule','BranchWallThickness','Standard','SourceDocumentId','SourceRecord','Revision','Status']),
  }),
});

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('AIV master Git blob hashing requires Uint8Array or ArrayBuffer bytes.');
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function calculateAivGitBlobSha1(value) {
  const bytes = bytesOf(value);
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.length + bytes.length);
  payload.set(header, 0);
  payload.set(bytes, header.length);
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required for AIV master Git blob verification.');
  return hex(await globalThis.crypto.subtle.digest('SHA-1', payload));
}
