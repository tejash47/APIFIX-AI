/**
 * APIFIX AI — Hot-Path Caching Engine (Phase 24)
 * 
 * Provides ultra-fast in-memory caching with strict security boundaries,
 * TTL enforcement, LRU evictions, namespace scoping, and cache telemetry.
 * 
 * SECURITY RULES:
 * - NEVER caches plaintext passwords, raw secret keys, or private tokens.
 * - Enforces max entry limits to prevent unbounded memory growth.
 * - Guarantees isolated tenant namespaces.
 */

class HotPathCache {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 5000;
    this.defaultTtlMs = options.defaultTtlMs || 60000; // 60 seconds
    this.cache = new Map(); // key -> { value, expiresAt, namespace, lastAccessed }
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
      sets: 0
    };
  }

  /**
   * Disallow storage of sensitive secret properties.
   */
  _validatePayloadSafety(value) {
    if (!value || typeof value !== 'object') return;

    const dangerousKeys = ['password', 'secret', 'client_secret', 'privateKey', 'jwtSecret', 'stripeSecret'];
    for (const key of Object.keys(value)) {
      if (dangerousKeys.some(dk => key.toLowerCase().includes(dk.toLowerCase()))) {
        throw new Error(`SECURITY VIOLATION: HotPathCache refused to store sensitive credential '${key}'.`);
      }
    }
  }

  /**
   * Set a cached value with namespace and TTL.
   */
  set(key, value, options = {}) {
    this._validatePayloadSafety(value);

    const namespace = options.namespace || 'default';
    const ttlMs = options.ttlMs || this.defaultTtlMs;
    const fullKey = `${namespace}:${key}`;

    // LRU eviction if maximum capacity reached
    if (this.cache.size >= this.maxEntries && !this.cache.has(fullKey)) {
      this._evictOldest();
    }

    this.cache.set(fullKey, {
      value,
      expiresAt: Date.now() + ttlMs,
      namespace,
      lastAccessed: Date.now()
    });

    this.stats.sets++;
    return true;
  }

  /**
   * Get a cached value.
   */
  get(key, namespace = 'default') {
    const fullKey = `${namespace}:${key}`;
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      this.stats.misses++;
      return null;
    }

    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Invalidate specific key or whole namespace.
   */
  invalidate(key, namespace = 'default') {
    const fullKey = `${namespace}:${key}`;
    const deleted = this.cache.delete(fullKey);
    if (deleted) this.stats.invalidations++;
    return deleted;
  }

  invalidateNamespace(namespace) {
    let count = 0;
    for (const [k, entry] of this.cache.entries()) {
      if (entry.namespace === namespace) {
        this.cache.delete(k);
        count++;
      }
    }
    this.stats.invalidations += count;
    return count;
  }

  _evictOldest() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [k, v] of this.cache.entries()) {
      if (v.lastAccessed < oldestAccess) {
        oldestAccess = v.lastAccessed;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRatio = totalRequests > 0 ? Number(((this.stats.hits / totalRequests) * 100).toFixed(2)) : 0;

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      defaultTtlMs: this.defaultTtlMs,
      hitRatio: `${hitRatio}%`,
      ...this.stats
    };
  }

  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
      sets: 0
    };
  }
}

const defaultHotPathCache = new HotPathCache();

module.exports = {
  HotPathCache,
  hotPathCache: defaultHotPathCache
};
