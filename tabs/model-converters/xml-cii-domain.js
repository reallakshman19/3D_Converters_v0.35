/**
 * xml-cii-domain.js — stable re-export barrel for XML→CII(2019) domain modules.
 *
 * All code inside model-converters/ that needs XML→CII domain logic should
 * import from here rather than from the deep `../../converters/xml-cii2019-core/`
 * paths.  This keeps the import graph manageable and allows the core modules to
 * be relocated without updating every consumer.
 *
 * Each export group is labelled by the module it originates from so grep and
 * code-navigation remain trivial.
 */

// ------------------------------------------------------------------
// regex-line-key
// ------------------------------------------------------------------
export {
  tokenizeBranchName,
  tokenAtPosition,
  xmlCiiTokenPositionList,
  xmlCiiLineKeyFromBranchTokens,
  deriveLineKeyFromBranchName,
} from '../../converters/xml-cii2019-core/regex-line-key.js';

// ------------------------------------------------------------------
// linelist-mapping
// ------------------------------------------------------------------
export {
  FIELD_RULES,
  DETECTION_ORDER,
  canon,
  clean,
  readRowValue,
  buildColumnProbe,
  getAllColumnKeys,
  hasAlias,
  hasAny,
  groupsMatch,
  rejectMatch,
  isValidFieldMatch,
  scoreField,
  shouldKeepExisting,
  detectLineListFieldMap,
  computeLineNoKey,
  normalizeLineListRow,
} from '../../converters/xml-cii2019-core/linelist-mapping.js';

// ------------------------------------------------------------------
// dtxr-resolver
// ------------------------------------------------------------------
export {
  getXmlNodeProperty,
  xmlNodeSupportTags,
  buildStagedDtxrIndex,
  buildDtxrContext,
  DTXR_PURPOSE_RULES,
  dtxrPurposeForComponentType,
  resolveDtxrForXmlNode,
  applyDtxrAnnotations,
  resolveXmlCiiNodeDtxr,
  xmlCiiDtxrPsForNode,
  xmlCiiDtxrPositionOffset,
  xmlCiiApplyDtxrPositionOffset,
} from '../../converters/xml-cii2019-core/dtxr-resolver.js';

// ------------------------------------------------------------------
// element-length  (SRSS via Math.hypot)
// ------------------------------------------------------------------
export {
  computeElementLengthFromCiiVector,
} from '../../converters/xml-cii2019-core/element-length.js';

// ------------------------------------------------------------------
// output-normalizer
// ------------------------------------------------------------------
export {
  parseCiiElements,
  parseCiiRestraints,
  parseEnrichedXmlNodes,
} from '../../converters/xml-cii2019-core/output-normalizer.js';

// ------------------------------------------------------------------
// masters  (master-context)
// ------------------------------------------------------------------
export {
  DEFAULT_WEIGHT_MASTER_URLS,
  DEFAULT_MATERIAL_MAP_URLS,
  DEFAULT_PIPING_CLASS_MASTER_URLS,
  loadXmlCiiWeightMasterRows,
  loadXmlCiiMasterRows,
  loadXmlCiiMaterialMap,
  prepareXmlCiiMasterContext,
} from '../../converters/xml-cii2019-core/master-context.js';

// ------------------------------------------------------------------
// config
// ------------------------------------------------------------------
export {
  parseXmlCiiEnrichmentConfig,
} from '../../converters/xml-cii2019-core/config.js';

// ------------------------------------------------------------------
// weight-match-model
// ------------------------------------------------------------------
export {
  findWeightMasterMatch,
  collectXmlCiiZeroRigidWeightIssues,
  applyXmlCiiRigidWeightOverrides,
  xmlCiiForwardElementLengths,
  xmlCiiRigidWeightOverrideKey,
  isXmlCiiRigidNode,
  xmlCiiNumberText,
  xmlCiiRigidWeightOverrideForNode,
  xmlCiiAncestorBranchName,
  scoreXmlCiiWeightCandidates,
  buildStagedComponentIndex,
  stagedComponentForXmlNode,
} from '../../converters/xml-cii2019-core/weight-match-model.js';

// ------------------------------------------------------------------
// support-mapping
// ------------------------------------------------------------------
export {
  buildStagedSupportIndex,
  xmlCiiTypeEntriesFromSupportKind,
  xmlCiiTypeEntryFromExistingRestraint,
  applyXmlRestraints,
  enrichHierarchyWithMapperKinds,
} from '../../converters/xml-cii2019-core/support-mapping.js';
