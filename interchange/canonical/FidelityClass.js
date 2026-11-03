export const FidelityClass = Object.freeze({
  LOSSLESS: 'LOSSLESS',
  NORMALIZED_LOSSLESS: 'NORMALIZED_LOSSLESS',
  RECONSTRUCTED: 'RECONSTRUCTED',
  METADATA_ONLY: 'METADATA_ONLY',
  VIEW_ONLY: 'VIEW_ONLY',
  NOT_EXPORTABLE: 'NOT_EXPORTABLE',
});

export function worstFidelity(a, b) {
  const rank = {
    LOSSLESS: 0,
    NORMALIZED_LOSSLESS: 1,
    RECONSTRUCTED: 2,
    METADATA_ONLY: 3,
    VIEW_ONLY: 4,
    NOT_EXPORTABLE: 5,
  };
  return (rank[a] ?? 99) >= (rank[b] ?? 99) ? a : b;
}
