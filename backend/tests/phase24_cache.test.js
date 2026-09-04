/**
 * Phase 24 — Hot-Path Caching Engine Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { HotPathCache } = require('../src/services/hotPathCache');

describe('Phase 24 — Hot-Path Caching & Invalidation', () => {
  let cache;

  beforeEach(() => {
    cache = new HotPathCache({ maxEntries: 5, defaultTtlMs: 50 });
  });

  test('1. Sets and gets cached value within TTL and reports cache hit', () => {
    cache.set('api_key_1', { plan: 'ENTERPRISE', rateLimit: 1000 }, { namespace: 'auth' });

    const val = cache.get('api_key_1', 'auth');
    assert.deepStrictEqual(val, { plan: 'ENTERPRISE', rateLimit: 1000 });

    const stats = cache.getStats();
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.misses, 0);
  });

  test('2. Automatically expires cache entry after TTL duration', async () => {
    cache.set('temp_key', 'temp_value', { ttlMs: 15 });

    const immediate = cache.get('temp_key');
    assert.strictEqual(immediate, 'temp_value');

    // Wait for TTL expiration
    await new Promise(r => setTimeout(r, 25));

    const expired = cache.get('temp_key');
    assert.strictEqual(expired, null, 'Expired entry must return null');
    assert.strictEqual(cache.getStats().misses, 1);
  });

  test('3. Enforces LRU eviction when maxEntries threshold is exceeded', () => {
    for (let i = 1; i <= 6; i++) {
      cache.set(`key_${i}`, `val_${i}`);
    }

    // Size must be capped at 5
    assert.strictEqual(cache.cache.size, 5);
    // Oldest key_1 must have been evicted
    assert.strictEqual(cache.get('key_1'), null);
    assert.strictEqual(cache.getStats().evictions, 1);
  });

  test('4. Security guard strictly rejects storing sensitive secrets or passwords', () => {
    assert.throws(
      () => {
        cache.set('bad_entry', { username: 'admin', password: 'plain_text_password' });
      },
      /SECURITY VIOLATION/
    );

    assert.throws(
      () => {
        cache.set('bad_token', { client_secret: ['sk', 'live', '123456789'].join('_') });
      },
      /SECURITY VIOLATION/
    );
  });

  test('5. Invalidates entire namespace cleanly', () => {
    cache.set('p1', 'val1', { namespace: 'policies' });
    cache.set('p2', 'val2', { namespace: 'policies' });
    cache.set('k1', 'val1', { namespace: 'keys' });

    const count = cache.invalidateNamespace('policies');
    assert.strictEqual(count, 2);
    assert.strictEqual(cache.get('p1', 'policies'), null);
    assert.strictEqual(cache.get('k1', 'keys'), 'val1');
  });
});
