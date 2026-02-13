const fc = require('fast-check');
const { CacheManager } = require('../../utils/cacheManager');
const { cacheKey, cacheValue, ttlMs } = require('./generators');

describe('CacheManager — property-based tests', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheManager();
    cache.stopCleanup();
  });

  it('get(k) returns what set(k,v) stored', () => {
    fc.assert(fc.property(cacheKey, cacheValue, (key, value) => {
      cache.set(key, value, 60000);
      const result = cache.get(key);
      expect(result).toEqual(value);
    }), { numRuns: 100 });
  });

  it('invalidate(k) makes get(k) return null', () => {
    fc.assert(fc.property(cacheKey, cacheValue, (key, value) => {
      cache.set(key, value, 60000);
      cache.invalidate(key);
      expect(cache.get(key)).toBeNull();
    }), { numRuns: 100 });
  });

  it('hit rate is always in [0, 100]', () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(cacheKey, cacheValue), { minLength: 1, maxLength: 20 }),
      (entries) => {
        entries.forEach(([k, v]) => cache.set(k, v, 60000));
        entries.forEach(([k]) => cache.get(k));
        const stats = cache.getStats();
        const rate = parseInt(stats.hitRate);
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(100);
      }
    ), { numRuns: 50 });
  });

  it('short TTL (1ms) causes expiration', async () => {
    await fc.assert(fc.asyncProperty(cacheKey, cacheValue, async (key, value) => {
      cache.set(key, value, 1); // 1ms TTL
      await new Promise(r => setTimeout(r, 20));
      expect(cache.get(key)).toBeNull();
    }), { numRuns: 20 });
  });
});
