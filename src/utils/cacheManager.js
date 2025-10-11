// src/utils/cacheManager.js
// In-memory caching with TTL and smart invalidation

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = {
      mondayBoards: 60 * 60 * 1000,      // 1 hour
      mondayItems: 5 * 60 * 1000,         // 5 minutes
      mondayColumns: 60 * 60 * 1000,      // 1 hour
      default: 10 * 60 * 1000             // 10 minutes
    };
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0
    };
    
    // Start cleanup interval
    this.startCleanup();
  }

  // Generate cache key
  generateKey(type, params = {}) {
    const paramString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    
    return `${type}:${paramString}`;
  }

  // Get from cache
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    console.log(`💾 Cache HIT: ${key}`);
    
    // Return cloned data to prevent mutations
    return JSON.parse(JSON.stringify(entry.data));
  }

  // Set cache entry
  set(key, data, customTTL = null) {
    const ttl = customTTL || this.getTTL(key);
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
    
    this.stats.sets++;
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}ms)`);
  }

  // Get TTL based on key type
  getTTL(key) {
    const [type] = key.split(':');
    return this.ttl[type] || this.ttl.default;
  }

  // Invalidate specific cache entry
  invalidate(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.invalidations++;
      console.log(`🗑️  Cache INVALIDATE: ${key}`);
    }
    return deleted;
  }

  // Invalidate by pattern
  invalidatePattern(pattern) {
    let count = 0;
    const regex = new RegExp(pattern);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    this.stats.invalidations += count;
    if (count > 0) {
      console.log(`🗑️  Cache INVALIDATE pattern "${pattern}": ${count} entries`);
    }
    
    return count;
  }

  // Clear all cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️  Cache CLEARED: ${size} entries`);
  }

  // Get cache statistics
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? Math.round((this.stats.hits / total) * 100) : 0;
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      invalidations: this.stats.invalidations,
      hitRate: `${hitRate}%`,
      efficiency: hitRate >= 80 ? 'excellent' : hitRate >= 60 ? 'good' : hitRate >= 40 ? 'fair' : 'poor'
    };
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: ${cleaned} expired entries removed`);
    }
    
    return cleaned;
  }

  // Start automatic cleanup
  startCleanup() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  // Stop cleanup
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Wrapper for cacheable operations
  async wrap(key, fetchFunction, customTTL = null) {
    // Try to get from cache first
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch and cache
    const data = await fetchFunction();
    this.set(key, data, customTTL);
    
    return data;
  }

  // Get cache info for specific key
  getInfo(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return { exists: false };
    }
    
    const age = Date.now() - entry.createdAt;
    const remaining = entry.expiresAt - Date.now();
    
    return {
      exists: true,
      ageMs: age,
      remainingMs: Math.max(0, remaining),
      expired: remaining <= 0,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString()
    };
  }

  // Format stats for console
  formatStats() {
    const stats = this.getStats();
    
    return `
📊 Cache Statistics:
  • Size: ${stats.size} entries
  • Hits: ${stats.hits}
  • Misses: ${stats.misses}
  • Hit Rate: ${stats.hitRate} (${stats.efficiency})
  • Sets: ${stats.sets}
  • Invalidations: ${stats.invalidations}
`;
  }
}

// Singleton instance
const cache = new CacheManager();

// Export helper functions
module.exports = {
  cache,
  
  // Helper: Cache Monday.com board data
  cacheBoardData: async (boardId, fetchFunction) => {
    const key = cache.generateKey('mondayBoards', { boardId });
    return await cache.wrap(key, fetchFunction);
  },
  
  // Helper: Cache Monday.com items
  cacheItems: async (boardId, fetchFunction) => {
    const key = cache.generateKey('mondayItems', { boardId });
    return await cache.wrap(key, fetchFunction);
  },
  
  // Helper: Invalidate board cache when updated
  invalidateBoardCache: (boardId) => {
    cache.invalidatePattern(`monday(Boards|Items|Columns):.*boardId:${boardId}`);
  }
};