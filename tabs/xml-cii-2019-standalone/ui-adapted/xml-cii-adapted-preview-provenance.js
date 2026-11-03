/**
 * Functionality: translates Preview resolver/fill-down sources into explicit
 * provenance and visible badge metadata.
 * Parameters: override metadata, field/key, and resolved source.
 * Output: pure provenance strings/display records; no UI or config mutation.
 */

export function previewOverrideProvenance(overrides, bucket, key, resolvedSource) {
  if (resolvedSource !== 'override') return resolvedSource;
  if (bucket === 'wallThickness' && overrides?.__b313WallEvidence?.[key]) return 'b313-sec-ii';
  const fillState = overrides?.__previewFillDown?.[bucket]?.[key]?.fillState;
  if (fillState === 'manual') return 'manual-override';
  if (fillState === 'auto') return 'auto-fill';
  return 'saved-override';
}

export function previewProvenanceBadge(field, source, detail = '') {
  const withDetail = (badge, replace = false) => detail ? { ...badge, title: replace ? detail : `${badge.title}\n\n${detail}` } : badge;
  if (source === 'b313-sec-ii' && field === 'wallThickness') return withDetail({ label: '✓ B31.3', className: 'exact', title: 'Wall explicitly updated in Preview from the B31.3-2024 straight-pipe thickness API and the project pipe-wall master. Preview Material + T1 first resolve strict active B31.3 Material Factors; an explicit controlled S/E/W/Y basis may be used only as fallback when active factors are incomplete. The calculation uses row OD, design pressure, corrosion allowance, and 12.5% negative mill tolerance.' });
  if (source === 'manual-override' || source === 'override') return { label: '✓ override', className: 'exact', title: 'Manually overridden value by user in Preview table.' };
  if (source === 'auto-fill') return { label: 'auto-fill', className: 'exact', title: 'Automatically propagated down by Smart Fill / Fill-down button.' };
  if (source === 'saved-override') return { label: 'saved', className: 'exact', title: 'Saved override value loaded from existing configuration file.' };
  if (source === 'piping-class-master' && field === 'rating') return { label: 'class', className: 'exact', title: 'Rating resolved from the Rating column of the effective Piping Class master row.' };
  if (source === 'piping-class-prefix' && field === 'rating') return { label: 'Regex prefix', className: 'amber', title: 'Piping Class master Rating was unavailable; Rating used the Regex-tab prefix mapping.' };
  if (source === 'rating-regex' && field === 'rating') return { label: 'Regex', className: 'amber', title: 'Piping Class master Rating was unavailable; Rating used the configured Regex-tab Rating extraction rule.' };
  if (source === 'dtxr-rating-fetched' && field === 'rating') return { label: '✓ DTXR fetched', className: 'exact', title: 'Rating was explicitly fetched from unambiguous DTXR evidence by the Preview action button.' };
  if (source === 'dtxr-rating-conflict' && field === 'rating') return withDetail({ label: 'DTXR conflict', className: 'bad', title: 'DTXR rating evidence contains multiple conflicting values.' }, true);
  if (source === 'piping-class-master' && (field === 'wallThickness' || field === 'corrosion')) return { label: 'derived', className: 'exact', title: 'Derived from Piping Class master specification for this bore; click to override.' };
  if (source === 'dtxr-sch-applied') return { label: '✓ DTXR Sch', className: 'exact', title: 'Wall thickness applied from 3D model DTXR schedule annotation.' };
  if (source === 'default' || source === 'config-default' || source === 'default-zero') return { label: 'default', className: 'bad', title: 'Fallback default value applied from conversion settings.' };
  return null;
}
