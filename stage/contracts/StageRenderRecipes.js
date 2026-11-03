import {
  STAGE_GEOMETRY_CONFIDENCE,
  STAGE_RENDER_KINDS,
  STAGE_RENDER_QUALITIES,
  STAGE_SEMANTIC_TYPES,
} from './StageConstants.js';
import { normalizeRenderQuality } from './StageValidation.js';

const PRIMITIVE_SCOPE = 'primitive';
const COMPONENT_SCOPE = 'component';

export const STAGE_RENDER_RECIPES = Object.freeze([
  primitiveRecipe('primitive-cylinder-native', 'CYLINDER', 'any', true, false, 'procedural'),
  primitiveRecipe('primitive-box-native', 'BOX', 'any', true, false, 'procedural'),
  primitiveRecipe('primitive-sphere-native', 'SPHERE', 'any', true, false, 'procedural'),
  primitiveRecipe('primitive-code4-elbow-native', 'ELBOW', 'any', true, false, 'procedural'),
  primitiveRecipe('primitive-tee-derived', 'TEE', 'any', false, false, 'procedural'),
  primitiveRecipe('primitive-flange-derived', 'FLANGE', 'any', false, false, 'procedural'),
  primitiveRecipe('primitive-facet-group-native', 'FACET_GROUP', 'any', true, false, 'mesh-chunk'),
  primitiveRecipe('primitive-mesh-chunk-native', 'MESH_CHUNK', 'any', true, false, 'mesh-chunk'),
  primitiveRecipe('primitive-unknown-diagnostic-bbox', 'UNKNOWN_DIAGNOSTIC', 'any', false, true, 'bbox'),
  Object.freeze({ id: 'primitive-hidden', scope: PRIMITIVE_SCOPE, quality: 'hidden', requiresNativeGeometry: false, diagnosticOnly: false, output: 'hidden' }),
  componentRecipe('component-native-assembly', 'any', true, false, 'procedural'),
  componentRecipe('component-simplified-assembly', 'any', true, false, 'procedural'),
  componentRecipe('component-proxy-bbox', 'any', false, false, 'proxy'),
  componentRecipe('component-centerline-symbol', 'any', false, false, 'symbol'),
  componentRecipe('component-hidden', 'hidden', false, false, 'hidden'),
  componentRecipe('component-diagnostic-only', 'any', false, true, 'bbox'),
]);

export const STAGE_RENDER_RECIPE_BY_KIND = Object.freeze({
  CYLINDER: recipeById('primitive-cylinder-native'),
  BOX: recipeById('primitive-box-native'),
  SPHERE: recipeById('primitive-sphere-native'),
  ELBOW: recipeById('primitive-code4-elbow-native'),
  TEE: recipeById('primitive-tee-derived'),
  FLANGE: recipeById('primitive-flange-derived'),
  FACET_GROUP: recipeById('primitive-facet-group-native'),
  MESH_CHUNK: recipeById('primitive-mesh-chunk-native'),
  UNKNOWN_DIAGNOSTIC: recipeById('primitive-unknown-diagnostic-bbox'),
});

export function getStageRenderRecipeForPrimitive(primitive, quality) {
  const normalizedQuality = normalizeRenderQuality(quality);
  if (normalizedQuality === 'hidden') return recipeById('primitive-hidden');
  if (primitive?.renderKind === 'UNKNOWN_DIAGNOSTIC') return recipeById('primitive-unknown-diagnostic-bbox');
  if (primitive?.confidence?.geometry === 'semantic-proxy') return recipeById('primitive-unknown-diagnostic-bbox');
  if (primitive?.native?.decoded === false) return recipeById('primitive-unknown-diagnostic-bbox');
  return STAGE_RENDER_RECIPE_BY_KIND[primitive?.renderKind];
}

export function getStageRenderRecipeForComponent(component, quality) {
  const normalizedQuality = normalizeRenderQuality(quality);
  if (normalizedQuality === 'hidden') return recipeById('component-hidden');
  if (component?.confidence?.geometry === 'diagnostic') return recipeById('component-diagnostic-only');
  if (normalizedQuality === 'full') return recipeById('component-native-assembly');
  if (normalizedQuality === 'medium') return recipeById('component-simplified-assembly');
  if (normalizedQuality === 'light') return recipeById('component-proxy-bbox');
  return recipeById('component-centerline-symbol');
}

export function validateStageRenderRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return invalid('recipe must be an object');
  if (typeof recipe.id !== 'string' || !recipe.id) errors.push('recipe.id is required');
  if (![PRIMITIVE_SCOPE, COMPONENT_SCOPE].includes(recipe.scope)) errors.push(`recipe.scope is invalid: ${recipe.scope}`);
  if (recipe.renderKind && !STAGE_RENDER_KINDS.includes(recipe.renderKind)) errors.push(`recipe.renderKind is invalid: ${recipe.renderKind}`);
  if (recipe.semanticType && !STAGE_SEMANTIC_TYPES.includes(recipe.semanticType)) errors.push(`recipe.semanticType is invalid: ${recipe.semanticType}`);
  if (![...STAGE_RENDER_QUALITIES, 'any'].includes(recipe.quality)) errors.push(`recipe.quality is invalid: ${recipe.quality}`);
  if (typeof recipe.requiresNativeGeometry !== 'boolean') errors.push('recipe.requiresNativeGeometry must be boolean');
  if (typeof recipe.diagnosticOnly !== 'boolean') errors.push('recipe.diagnosticOnly must be boolean');
  if (!['procedural', 'mesh-chunk', 'proxy', 'bbox', 'symbol', 'hidden'].includes(recipe.output)) errors.push(`recipe.output is invalid: ${recipe.output}`);
  return { valid: errors.length === 0, errors };
}

export function validateStageRenderRecipesForModel(model) {
  const errors = [];
  for (const recipe of STAGE_RENDER_RECIPES) collect(errors, validateStageRenderRecipe(recipe).errors);
  for (const primitive of model?.primitives || []) validatePrimitiveRecipes(primitive, errors);
  for (const component of model?.components || []) validateComponentRecipes(component, errors);
  return { valid: errors.length === 0, errors };
}

function validatePrimitiveRecipes(primitive, errors) {
  if (!STAGE_RENDER_KINDS.includes(primitive?.renderKind)) errors.push(`STAGE_INVALID_RENDER_KIND primitive ${primitive?.id || '?'} renderKind is invalid: ${primitive?.renderKind}`);
  if (primitive?.native?.decoded === false && primitive.renderKind !== 'UNKNOWN_DIAGNOSTIC') errors.push(`STAGE_UNDECODED_NATIVE_PRIMITIVE primitive ${primitive.id || '?'} must not select visible native recipe`);
  if (primitive?.confidence?.geometry === 'semantic-proxy' && primitive.renderKind !== 'UNKNOWN_DIAGNOSTIC') errors.push(`STAGE_FALLBACK_SEMANTIC_ONLY_GEOMETRY primitive ${primitive.id || '?'} must not select visible native recipe`);
  for (const quality of STAGE_RENDER_QUALITIES) validatePrimitiveQualityRecipe(primitive, quality, errors);
}

function validatePrimitiveQualityRecipe(primitive, quality, errors) {
  const recipe = getStageRenderRecipeForPrimitive(primitive, quality);
  if (!recipe) return errors.push(`STAGE_INVALID_RENDER_KIND primitive ${primitive?.id || '?'} has no render recipe`);
  if (quality !== 'hidden' && recipe.requiresNativeGeometry && !hasRenderableGeometry(primitive)) errors.push(`STAGE_UNDECODED_NATIVE_PRIMITIVE primitive ${primitive?.id || '?'} cannot use ${recipe.id}`);
}

function validateComponentRecipes(component, errors) {
  if (!STAGE_GEOMETRY_CONFIDENCE.includes(component?.confidence?.geometry)) errors.push(`component ${component?.id || '?'} confidence.geometry is invalid: ${component?.confidence?.geometry}`);
  for (const quality of STAGE_RENDER_QUALITIES) {
    const recipe = getStageRenderRecipeForComponent(component, quality);
    if (!recipe) errors.push(`component ${component?.id || '?'} has no render recipe for ${quality}`);
  }
}

function hasRenderableGeometry(primitive) {
  return primitive?.native?.decoded !== false && ['native', 'derived'].includes(primitive?.confidence?.geometry);
}

function primitiveRecipe(id, renderKind, quality, requiresNativeGeometry, diagnosticOnly, output) {
  return Object.freeze({ id, scope: PRIMITIVE_SCOPE, renderKind, quality, requiresNativeGeometry, diagnosticOnly, output });
}

function componentRecipe(id, quality, requiresNativeGeometry, diagnosticOnly, output) {
  return Object.freeze({ id, scope: COMPONENT_SCOPE, quality, requiresNativeGeometry, diagnosticOnly, output });
}

function recipeById(id) {
  return STAGE_RENDER_RECIPES.find((recipe) => recipe.id === id);
}

function collect(errors, nextErrors) {
  errors.push(...nextErrors);
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
