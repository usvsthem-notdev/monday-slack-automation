// tests/automation.test.js
// Comprehensive test suite for the automation system

const errorHandler = require('../src/utils/errorHandler');
const monitor = require('../src/utils/performanceMonitor');
const { cache } = require('../src/utils/cacheManager');

// Test utilities
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Running Test Suite...\n');
    
    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`✅ ${name}`);
      } catch (error) {
        this.failed++;
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
      }
    }
    
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
    
    return this.failed === 0;
  }
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Create test runner
const runner = new TestRunner();

// ===== ERROR HANDLER TESTS =====

runner.test('ErrorHandler: categorizes network errors correctly', () => {
  const error = { code: 'ECONNREFUSED' };
  const category = errorHandler.categorizeError(error);
  
  assertEqual(category.type, 'NETWORK', 'Should categorize as NETWORK');
  assert(category.retry, 'Should be retryable');
});

runner.test('ErrorHandler: categorizes auth errors correctly', () => {
  const error = { status: 401 };
  const category = errorHandler.categorizeError(error);
  
  assertEqual(category.type, 'AUTH', 'Should categorize as AUTH');
  assert(!category.retry, 'Should not be retryable');
});

runner.test('ErrorHandler: categorizes rate limit errors correctly', () => {
  const error = { status: 429 };
  const category = errorHandler.categorizeError(error);
  
  assertEqual(category.type, 'RATE_LIMIT', 'Should categorize as RATE_LIMIT');
  assert(category.retry, 'Should be retryable');
});

runner.test('ErrorHandler: retry logic works with success', async () => {
  let attempts = 0;
  const operation = async () => {
    attempts++;
    if (attempts < 2) throw new Error('Temp failure');
    return 'success';
  };
  
  const result = await errorHandler.retry(operation, 'test');
  assertEqual(result, 'success', 'Should return success');
  assertEqual(attempts, 2, 'Should take 2 attempts');
});

runner.test('ErrorHandler: retry logic fails after max attempts', async () => {
  const operation = async () => {
    throw new Error('Persistent failure');
  };
  
  try {
    await errorHandler.retry(operation, 'test');
    throw new Error('Should have thrown');
  } catch (error) {
    assert(error.message.includes('failed after'), 'Should fail after retries');
  }
});

runner.test('ErrorHandler: circuit breaker opens after threshold', () => {
  // Simulate 5 errors
  for (let i = 0; i < 5; i++) {
    errorHandler.incrementErrorCount('test-circuit');
  }
  
  const shouldBreak = errorHandler.shouldCircuitBreak('test-circuit');
  assert(shouldBreak, 'Circuit should be open');
  
  // Reset for other tests
  errorHandler.resetCircuit('test-circuit');
});

// ===== PERFORMANCE MONITOR TESTS =====

runner.test('Monitor: tracks successful requests', () => {
  monitor.reset();
  monitor.recordSuccess(100, { test: true });
  
  const metrics = monitor.getMetrics();
  assertEqual(metrics.requests.successful, 1, 'Should track 1 success');
  assertEqual(metrics.requests.total, 1, 'Should track 1 total');
});

runner.test('Monitor: tracks failed requests', () => {
  monitor.reset();
  monitor.recordFailure(new Error('Test error'), 100);
  
  const metrics = monitor.getMetrics();
  assertEqual(metrics.requests.failed, 1, 'Should track 1 failure');
});

runner.test('Monitor: calculates success rate correctly', () => {
  monitor.reset();
  monitor.recordSuccess(100);
  monitor.recordSuccess(100);
  monitor.recordFailure(new Error('Test'), 100);
  
  const rate = monitor.getSuccessRate();
  assertEqual(rate, 67, 'Should be 67% (2/3)');
});

runner.test('Monitor: timer works correctly', async () => {
  const timer = monitor.startTimer('test');
  await new Promise(resolve => setTimeout(resolve, 100));
  const duration = monitor.endTimer(timer);
  
  assert(duration >= 100, `Duration should be >= 100ms, got ${duration}ms`);
  assert(duration < 200, `Duration should be < 200ms, got ${duration}ms`);
});

runner.test('Monitor: calculates stats correctly', () => {
  const data = [10, 20, 30, 40, 50];
  const stats = monitor.calculateStats(data);
  
  assertEqual(stats.min, 10, 'Min should be 10');
  assertEqual(stats.max, 50, 'Max should be 50');
  assertEqual(stats.avg, 30, 'Avg should be 30');
});

runner.test('Monitor: detects performance degradation', () => {
  monitor.reset();
  
  // Add slow operations
  for (let i = 0; i < 10; i++) {
    monitor.metrics.timing.totalDuration.push(35000); // 35 seconds
  }
  
  const degraded = monitor.isPerformanceDegraded();
  assert(degraded.degraded, 'Should detect degradation');
  assertEqual(degraded.reason, 'High average response time');
  
  monitor.reset();
});

// ===== CACHE TESTS =====

runner.test('Cache: stores and retrieves data', () => {
  const key = 'test:key1';
  const data = { foo: 'bar' };
  
  cache.set(key, data, 10000);
  const retrieved = cache.get(key);
  
  assert(retrieved, 'Should retrieve data');
  assertEqual(retrieved.foo, 'bar', 'Should match original data');
});

runner.test('Cache: returns null for missing keys', () => {
  const result = cache.get('nonexistent:key');
  assertEqual(result, null, 'Should return null');
});

runner.test('Cache: expires old entries', async () => {
  const key = 'test:expires';
  cache.set(key, 'data', 100); // 100ms TTL
  
  // Should exist immediately
  assert(cache.get(key), 'Should exist immediately');
  
  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Should be expired
  assertEqual(cache.get(key), null, 'Should be expired');
});

runner.test('Cache: invalidates by pattern', () => {
  cache.set('monday:board:1', 'data1');
  cache.set('monday:board:2', 'data2');
  cache.set('slack:channel:1', 'data3');
  
  const count = cache.invalidatePattern('^monday:');
  assertEqual(count, 2, 'Should invalidate 2 entries');
  
  assertEqual(cache.get('monday:board:1'), null, 'Monday data should be gone');
  assert(cache.get('slack:channel:1'), 'Slack data should remain');
  
  cache.clear();
});

runner.test('Cache: tracks hit rate', () => {
  cache.cache.clear();
  cache.stats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };
  
  cache.set('test:1', 'data');
  cache.get('test:1'); // hit
  cache.get('test:1'); // hit
  cache.get('test:2'); // miss
  
  const stats = cache.getStats();
  assertEqual(stats.hits, 2, 'Should have 2 hits');
  assertEqual(stats.misses, 1, 'Should have 1 miss');
  assertEqual(stats.hitRate, '67%', 'Hit rate should be 67%');
});

runner.test('Cache: wrap function works', async () => {
  const key = 'test:wrap';
  let fetchCount = 0;
  
  const fetchFunction = async () => {
    fetchCount++;
    return 'data';
  };
  
  // First call should fetch
  const result1 = await cache.wrap(key, fetchFunction);
  assertEqual(result1, 'data');
  assertEqual(fetchCount, 1, 'Should fetch once');
  
  // Second call should use cache
  const result2 = await cache.wrap(key, fetchFunction);
  assertEqual(result2, 'data');
  assertEqual(fetchCount, 1, 'Should not fetch again');
  
  cache.invalidate(key);
});

runner.test('Cache: cleanup removes expired entries', async () => {
  cache.clear();
  
  cache.set('test:cleanup:1', 'data', 50);
  cache.set('test:cleanup:2', 'data', 10000);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const cleaned = cache.cleanup();
  assert(cleaned >= 1, 'Should clean at least 1 entry');
  
  cache.clear();
});

// ===== INTEGRATION TESTS =====

runner.test('Integration: full automation flow simulation', async () => {
  monitor.reset();
  cache.clear();
  
  const mockTasks = [{ id: '1', name: 'Test Task' }];
  
  // Simulate fetching tasks (with caching)
  const fetchTimer = monitor.startTimer('mondayFetch');
  const tasks = mockTasks;
  monitor.endTimer(fetchTimer);
  
  // Simulate posting to Slack
  const slackTimer = monitor.startTimer('slackPost');
  monitor.endTimer(slackTimer);
  
  // Record success
  const totalTimer = monitor.startTimer('totalDuration');
  const duration = monitor.endTimer(totalTimer);
  monitor.recordSuccess(duration, { tasksProcessed: tasks.length });
  
  // Verify metrics
  const metrics = monitor.getMetrics();
  assertEqual(metrics.requests.successful, 1, 'Should record 1 success');
  assertEqual(metrics.lastRun.success, true, 'Last run should be successful');
});

// Run all tests
(async () => {
  const success = await runner.run();
  process.exit(success ? 0 : 1);
})();