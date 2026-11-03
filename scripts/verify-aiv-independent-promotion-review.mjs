import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertAivIndependentPromotionReviewComplete,
  createAivIndependentPromotionReviewTemplate,
} from '../converters/vibration/aiv/aiv-independent-promotion-review.js';

function sha256Artifact(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseArguments(argv) {
  const positional = [];
  const options = { templateOut: null, verify: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--template-out') options.templateOut = argv[++index] ?? null;
    else if (arg === '--verify') options.verify = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || Boolean(options.templateOut) === Boolean(options.verify)) {
    throw new TypeError('Usage: node scripts/verify-aiv-independent-promotion-review.mjs <promotion-readiness.json> (--template-out review.json | --verify review.json)');
  }
  return { promotionReadinessPath: positional[0], ...options };
}

export function runAivIndependentPromotionReview(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const readinessPath = resolve(args.promotionReadinessPath);
  const readinessBytes = readFileSync(readinessPath);
  const readiness = JSON.parse(readinessBytes.toString('utf8'));
  const promotionReadinessArtifactSha256 = sha256Artifact(readinessBytes);

  if (args.templateOut) {
    const outputPath = resolve(args.templateOut);
    const template = createAivIndependentPromotionReviewTemplate(readiness, {
      promotionReadinessArtifactSha256,
    });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return { template, outputPath, promotionReadinessArtifactSha256 };
  }

  const reviewBytes = readFileSync(resolve(args.verify));
  const review = JSON.parse(reviewBytes.toString('utf8'));
  const verified = assertAivIndependentPromotionReviewComplete(readiness, review, {
    promotionReadinessArtifactSha256,
  });
  const verification = Object.freeze({
    ...verified,
    promotionReadinessArtifactSha256,
    reviewArtifactSha256: sha256Artifact(reviewBytes),
  });
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivIndependentPromotionReview();
