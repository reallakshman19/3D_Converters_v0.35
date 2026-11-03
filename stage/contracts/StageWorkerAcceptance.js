import { validateStagePackageManifest } from './StagePackageManifest.js';
import { validateStageRenderRecipesForModel } from './StageRenderRecipes.js';
import { validateRvmStageModel } from './StageValidation.js';
import { validateStageWorkerMessage } from './StageWorkerProtocol.js';
import {
  buildStageRenderPlan,
  validateStageRenderPlan,
} from '../render/StageRenderPlan.js';

export const STAGE_WORKER_ACCEPTANCE_VERSION = 'RvmStageWorkerAcceptance.v1';

const TERMINAL_TYPES = Object.freeze([
  'STAGE_WORKER_STAGE_READY',
  'STAGE_WORKER_PACKAGE_READY',
  'STAGE_WORKER_ERROR',
  'STAGE_WORKER_CANCELLED',
]);

export function createStageWorkerAcceptanceReport(input = {}) {
  const errors = [];
  const warnings = [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  validateMessages(input.messages, errors);

  const hasStart = messages.some((message) => message?.type === 'STAGE_WORKER_START');
  const terminalType = findTerminalType(messages);
  if (!hasStart) errors.push('STAGE_WORKER_START message is required');
  if (!terminalType) errors.push('terminal worker message is required');

  if (hasSuccessfulTerminal(messages)) validateSuccessfulOutput(input, messages, errors, warnings);
  if (isFailedOrCancelled(messages)) validateFailedOrCancelled(messages, errors);

  return {
    version: STAGE_WORKER_ACCEPTANCE_VERSION,
    valid: errors.length === 0,
    errors,
    warnings,
    summary: summarizeInput(input, terminalType),
  };
}

export function validateStageWorkerOutput(input = {}) {
  const report = createStageWorkerAcceptanceReport(input);
  return { valid: report.valid, errors: report.errors, warnings: report.warnings, summary: report.summary };
}

export function summarizeStageWorkerAcceptance(report) {
  return {
    version: report?.version || STAGE_WORKER_ACCEPTANCE_VERSION,
    valid: Boolean(report?.valid),
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    ...(report?.summary || {}),
  };
}

function validateMessages(messages, errors) {
  if (!Array.isArray(messages)) {
    errors.push('messages must be an array');
    return;
  }
  for (const message of messages) {
    const result = validateStageWorkerMessage(message);
    if (!result.valid) errors.push(...result.errors.map((line) => `message ${message?.type || '?'}: ${line}`));
  }
}

function validateSuccessfulOutput(input, messages, errors, warnings) {
  if (!hasStageReady(messages)) errors.push('STAGE_WORKER_STAGE_READY message is required for successful output');
  const modelResult = validateRvmStageModel(input.stageModel);
  if (!modelResult.valid) errors.push(...prefix('stageModel', modelResult.errors));

  const manifestResult = validateStagePackageManifest(input.manifest);
  if (!manifestResult.valid) errors.push(...prefix('manifest', manifestResult.errors));

  if (modelResult.valid) validateModelDependentContracts(input, errors, warnings);
  validateSourceIdentity(input, errors);
}

function validateModelDependentContracts(input, errors, warnings) {
  const recipeResult = validateStageRenderRecipesForModel(input.stageModel);
  if (!recipeResult.valid) errors.push(...prefix('renderRecipes', recipeResult.errors));
  validateDiagnosticsHandoff(input.stageModel, input.diagnostics, errors, warnings);
  const renderPlan = compatibleRenderPlan(input);
  const planResult = validateStageRenderPlan(renderPlan);
  if (!planResult.valid) errors.push(...prefix('renderPlan', planResult.errors));
}

function compatibleRenderPlan(input) {
  const supplied = input.renderPlan;
  if (supplied?.entries?.every?.((entry) => entry?.entryKind && entry?.sourceRef)) return supplied;
  return buildStageRenderPlan(input.stageModel, supplied?.source?.quality || 'full');
}

function validateFailedOrCancelled(messages, errors) {
  const errorMessage = messages.find((message) => message?.type === 'STAGE_WORKER_ERROR');
  const cancelledMessage = messages.find((message) => message?.type === 'STAGE_WORKER_CANCELLED');
  if (!errorMessage && !cancelledMessage) errors.push('failed/cancelled output requires error or cancelled message');
}

function validateSourceIdentity(input, errors) {
  const manifestHash = input.manifest?.source?.fileHash;
  const modelHash = input.stageModel?.source?.fileHash;
  if (manifestHash && modelHash && manifestHash !== modelHash) {
    errors.push(`fileHash mismatch between manifest and stageModel: ${manifestHash} !== ${modelHash}`);
  }
  const sourceHash = input.source?.fileHash;
  if (sourceHash && modelHash && sourceHash !== modelHash) errors.push(`fileHash mismatch between source and stageModel: ${sourceHash} !== ${modelHash}`);
}

function validateDiagnosticsHandoff(model, diagnostics, errors, warnings) {
  const fallbackPrimitives = (model.primitives || []).filter(hasFallbackPrimitive);
  if (fallbackPrimitives.length === 0) return;
  const messages = model.diagnostics?.messages || diagnostics?.messages || [];
  const fallbackMessages = messages.filter((message) => message?.fallback || String(message?.code || '').startsWith('STAGE_FALLBACK_'));
  if (fallbackMessages.length === 0) errors.push('fallback primitives require model diagnostic fallback messages');
  if (!model.diagnostics?.messages?.length && diagnostics?.messages?.length) warnings.push('diagnostics supplied outside stageModel; copy into stageModel.diagnostics before renderer handoff');
}

function hasFallbackPrimitive(primitive) {
  return primitive?.renderKind === 'UNKNOWN_DIAGNOSTIC'
    || primitive?.native?.decoded === false
    || primitive?.confidence?.geometry === 'diagnostic'
    || (primitive?.diagnostics || []).some((item) => item?.fallback);
}

function hasSuccessfulTerminal(messages) {
  return messages.some((message) => message?.type === 'STAGE_WORKER_STAGE_READY' || message?.type === 'STAGE_WORKER_PACKAGE_READY');
}

function hasStageReady(messages) {
  return messages.some((message) => message?.type === 'STAGE_WORKER_STAGE_READY');
}

function isFailedOrCancelled(messages) {
  return messages.some((message) => message?.type === 'STAGE_WORKER_ERROR' || message?.type === 'STAGE_WORKER_CANCELLED');
}

function findTerminalType(messages) {
  return messages.find((message) => TERMINAL_TYPES.includes(message?.type))?.type || '';
}

function summarizeInput(input, terminalType) {
  return {
    messageCount: Array.isArray(input.messages) ? input.messages.length : 0,
    terminalType,
    modelPrimitiveCount: Array.isArray(input.stageModel?.primitives) ? input.stageModel.primitives.length : 0,
    componentCount: Array.isArray(input.stageModel?.components) ? input.stageModel.components.length : 0,
    packageArtifactCount: Array.isArray(input.manifest?.artifacts) ? input.manifest.artifacts.length : 0,
    renderPlanEntryCount: Array.isArray(input.renderPlan?.entries) ? input.renderPlan.entries.length : countModelPrimitives(input.stageModel),
  };
}

function countModelPrimitives(model) {
  return Array.isArray(model?.primitives) ? model.primitives.length : 0;
}

function prefix(label, lines) {
  return lines.map((line) => `${label}: ${line}`);
}
