const { cache } = require('../utils/cacheManager');

describe('CacheManager', () => {
  beforeEach(() => {
    cache.clear();
    cache.stopCleanup();
  });

  describe('set() / get()', () => {
    it('returns stored value', () => {
      cache.set('test:key', { foo: 'bar' });
      const result = cache.get('test:key');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('returns null for missing key', () => {
      expect(cache.get('nonexistent:key')).toBeNull();
    });

    it('returns null after TTL expires', () => {
      cache.set('test:ttl', 'value', 1); // 1ms TTL
      return new Promise(resolve => {
        setTimeout(() => {
          expect(cache.get('test:ttl')).toBeNull();
          resolve();
        }, 20);
      });
    });

    it('returns clone (mutation-safe)', () => {
      cache.set('test:clone', { arr: [1, 2, 3] });
      const result = cache.get('test:clone');
      result.arr.push(99);
      const result2 = cache.get('test:clone');
      expect(result2.arr).toEqual([1, 2, 3]);
    });
  });

  describe('invalidate()', () => {
    it('removes existing key', () => {
      cache.set('test:del', 'value');
      cache.invalidate('test:del');
      expect(cache.get('test:del')).toBeNull();
    });

    it('returns false for nonexistent key', () => {
      expect(cache.invalidate('nonexistent')).toBe(false);
    });

    it('returns true when key deleted', () => {
      cache.set('test:yes', 'v');
      expect(cache.invalidate('test:yes')).toBe(true);
    });
  });

  describe('invalidatePattern()', () => {
    it('removes all keys matching pattern', () => {
      cache.set('monday:board1', 'v1');
      cache.set('monday:board2', 'v2');
      cache.set('slack:user1', 'v3');
      cache.invalidatePattern('monday:');
      expect(cache.get('monday:board1')).toBeNull();
      expect(cache.get('monday:board2')).toBeNull();
      expect(cache.get('slack:user1')).not.toBeNull();
    });
  });

  describe('wrap()', () => {
    it('calls fetchFunction on cache miss', async () => {
      const fetch = jest.fn().mockResolvedValue('fetched');
      const result = await cache.wrap('test:wrap1', fetch);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result).toBe('fetched');
    });

    it('uses cached value on second call', async () => {
      const fetch = jest.fn().mockResolvedValue('fetched');
      await cache.wrap('test:wrap2', fetch);
      await cache.wrap('test:wrap2', fetch);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats()', () => {
    it('tracks hits and misses', () => {
      cache.set('test:stat', 'v');
      cache.get('test:stat');     // hit
      cache.get('nonexistent');   // miss
      const stats = cache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
    });

    it('hitRate is a string ending in %', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toMatch(/\d+%/);
    });
  });

  describe('cleanup()', () => {
    it('removes expired entries', () => {
      cache.set('test:exp1', 'v', 1); // 1ms TTL
      cache.set('test:exp2', 'v', 60000); // 60s TTL
      return new Promise(resolve => {
        setTimeout(() => {
          cache.cleanup();
          // exp1 should be gone, exp2 should remain
          expect(cache.get('test:exp2')).not.toBeNull();
          resolve();
        }, 20);
      });
    });

    it('returns count of cleaned entries', () => {
      cache.set('test:c1', 'v', 1);
      return new Promise(resolve => {
        setTimeout(() => {
          const cleaned = cache.cleanup();
          expect(cleaned).toBeGreaterThanOrEqual(1);
          resolve();
        }, 20);
      });
    });
  });

  describe('getInfo()', () => {
    it('returns exists:false for missing key', () => {
      const info = cache.getInfo('nonexistent');
      expect(info.exists).toBe(false);
    });

    it('returns age and remaining TTL for existing key', () => {
      cache.set('test:info', 'v', 60000);
      const info = cache.getInfo('test:info');
      expect(info.exists).toBe(true);
      expect(info.ageMs).toBeGreaterThanOrEqual(0);
      expect(info.remainingMs).toBeGreaterThan(0);
      expect(info.expired).toBe(false);
    });
  });

  describe('formatStats()', () => {
    it('returns a string with cache stats', () => {
      const output = cache.formatStats();
      expect(typeof output).toBe('string');
      expect(output).toContain('Hit Rate');
    });
  });

  describe('generateKey()', () => {
    it('generates consistent key for same params', () => {
      const k1 = cache.generateKey('monday', { boardId: '123', type: 'boards' });
      const k2 = cache.generateKey('monday', { type: 'boards', boardId: '123' });
      expect(k1).toBe(k2);
    });

    it('includes type in key', () => {
      const key = cache.generateKey('myType', {});
      expect(key.startsWith('myType:')).toBe(true);
    });
  });
});
