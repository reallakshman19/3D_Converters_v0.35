export const UNIVERSAL_CATEGORIZER_PROFILE_V1='UniversalCategorizerProfile.v1';
export const IMPORT_SOURCE_V1='ImportSource.v1';
export const RESOLVER_PIPELINE_V1='ResolverPipeline.v1';
export const LEVEL_DEFINITION_V1='LevelDefinition.v1';
export const GRAPH_NODE_V1='GraphNode.v1';
export const GRAPH_EDGE_V1='GraphEdge.v1';
export const CATEGORIZER_DIAGNOSTIC_V1='CategorizerDiagnostic.v1';
export const CATEGORIZED_GRAPH_EXPORT_V1='CategorizedGraphExport.v1';

export const TABLE_CATEGORIZER_CONTRACT_NAMES=Object.freeze([
  UNIVERSAL_CATEGORIZER_PROFILE_V1,
  IMPORT_SOURCE_V1,
  RESOLVER_PIPELINE_V1,
  LEVEL_DEFINITION_V1,
  GRAPH_NODE_V1,
  GRAPH_EDGE_V1,
  CATEGORIZER_DIAGNOSTIC_V1,
  CATEGORIZED_GRAPH_EXPORT_V1
]);

export const TABLE_CATEGORIZER_VALIDATION_GATES=Object.freeze([
  'source_parse_ok',
  'required_columns_present',
  'resolver_outputs_non_empty',
  'key_parts_non_empty',
  'key_uniqueness_per_parent',
  'display_name_resolved',
  'parent_link_resolved',
  'coordinate_units_declared',
  'coordinate_tolerance_declared',
  'multi_value_policy_declared',
  'duplicate_key_policy_declared',
  'xml_tag_valid',
  'xml_attribute_valid',
  'graph_has_single_document_root',
  'export_xml_well_formed'
]);

export function createEmptyCategorizerProfile(overrides={}){
  return Object.freeze({
    schema:UNIVERSAL_CATEGORIZER_PROFILE_V1,
    profileId:String(overrides.profileId||'universal-table-categorizer-profile'),
    projectName:String(overrides.projectName||overrides.displayName||'Universal Table Categorizer Profile'),
    sources:Object.freeze([]),
    resolverPipelines:Object.freeze([]),
    levels:Object.freeze([]),
    joins:Object.freeze([]),
    coordinateResolvers:Object.freeze([]),
    validationRules:Object.freeze([]),
    exportProfiles:Object.freeze([])
  });
}

export function createCategorizerDiagnostic({severity='INFO',code='not_implemented',message='',ref=null}={}){
  return Object.freeze({
    schema:CATEGORIZER_DIAGNOSTIC_V1,
    severity:String(severity),
    code:String(code),
    message:String(message),
    ref:ref?Object.freeze({...ref}):null
  });
}
