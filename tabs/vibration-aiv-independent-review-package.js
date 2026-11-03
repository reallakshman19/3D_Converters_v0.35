import { createAivIndependentPromotionReviewTemplate } from '../converters/vibration/aiv/aiv-independent-promotion-review.js';
import { sha256AivPromotionArtifactBytes } from './vibration-aiv-promotion-artifacts.js';

function packageError(code, message) {
  const error = new Error(message);
  error.name = 'AivIndependentReviewPackageError';
  error.code = code;
  return error;
}

function jsonArtifact(value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return { text, bytes: new TextEncoder().encode(text) };
}

export async function buildAivIndependentReviewPackage(promotionReadiness) {
  if (promotionReadiness?.eligibleForAuthorityReview !== true
    || promotionReadiness?.status !== 'READY_FOR_INDEPENDENT_AUTHORITY_REVIEW') {
    throw packageError(
      'AIV_INDEPENDENT_REVIEW_PACKAGE_PREREQUISITES_INCOMPLETE',
      'Independent review package is available only after all six promotion prerequisites are satisfied.',
    );
  }
  const readinessArtifact = jsonArtifact(promotionReadiness);
  const promotionReadinessArtifactSha256 = await sha256AivPromotionArtifactBytes(readinessArtifact.bytes);
  const reviewTemplate = createAivIndependentPromotionReviewTemplate(promotionReadiness, {
    promotionReadinessArtifactSha256,
  });
  const reviewArtifact = jsonArtifact(reviewTemplate);
  return Object.freeze({
    promotionReadiness: Object.freeze({
      fileName: 'aiv-promotion-readiness.json',
      text: readinessArtifact.text,
      byteLength: readinessArtifact.bytes.byteLength,
      sha256: promotionReadinessArtifactSha256,
    }),
    independentReviewTemplate: Object.freeze({
      fileName: 'aiv-independent-vibration-engineer-review-template.json',
      text: reviewArtifact.text,
      byteLength: reviewArtifact.bytes.byteLength,
    }),
    authorityTransitionApplied: false,
  });
}
