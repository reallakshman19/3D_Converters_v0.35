/**
 * rvm-cache-store.js
 * Stores conversion results keyed by SHA-256 to avoid redundant local processing.
 * Using an in-memory Map instead of sessionStorage because Blob URLs are revoked on page reload!
 */

const cache = new Map();

export const RvmCacheStore = {
    get(sha256) {
        if (!sha256) return null;
        return cache.get(sha256) || null;
    },

    set(sha256, bundleId, glbPath, indexPath) {
        if (!sha256) return;
        cache.set(sha256, { bundleId, glbPath, indexPath, timestamp: Date.now() });
    },

    clear() {
        cache.clear();
    }
};
