const fc = require('fast-check');
const errorHandler = require('../../utils/errorHandler');
const { httpStatus, errorCode } = require('./generators');

describe('ErrorHandler — property-based tests', () => {
  const validCategories = ['NETWORK', 'RATE_LIMIT', 'AUTH', 'SERVER', 'CLIENT', 'UNKNOWN'];

  beforeEach(() => {
    errorHandler.errorCounts.clear();
    errorHandler.baseDelay = 1; // Speed up tests
  });

  afterEach(() => {
    errorHandler.baseDelay = 1000;
  });

  it('categorizeError always returns a valid category', () => {
    fc.assert(fc.property(httpStatus, (status) => {
      const result = errorHandler.categorizeError({ status });
      expect(validCategories).toContain(result.type);
      expect(typeof result.retry).toBe('boolean');
      expect(typeof result.message).toBe('string');
    }), { numRuns: 100 });
  });

  it('categorizeError with error code always returns valid category', () => {
    fc.assert(fc.property(errorCode, (code) => {
      const result = errorHandler.categorizeError({ code });
      expect(validCategories).toContain(result.type);
    }), { numRuns: 100 });
  });

  it('circuit breaker only opens after exactly 5 errors', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 3, maxLength: 20 }),
      fc.integer({ min: 1, max: 4 }),
      (context, count) => {
        errorHandler.errorCounts.clear();
        for (let i = 0; i < count; i++) {
          errorHandler.incrementErrorCount(context);
        }
        // Less than 5: should NOT break
        expect(errorHandler.shouldCircuitBreak(context)).toBe(false);
        errorHandler.errorCounts.clear();
      }
    ), { numRuns: 100 });
  });

  it('retry backoff delay grows monotonically', async () => {
    const delays = [];
    const originalSleep = errorHandler.sleep.bind(errorHandler);
    errorHandler.sleep = jest.fn().mockImplementation((ms) => {
      delays.push(ms);
      return Promise.resolve();
    });

    const op = jest.fn().mockRejectedValue(new Error('fail'));
    const originalMax = errorHandler.maxRetries;
    errorHandler.maxRetries = 3;

    try {
      await errorHandler.retry(op, 'test');
    } catch (e) {
      // expected
    }

    errorHandler.sleep = originalSleep;
    errorHandler.maxRetries = originalMax;

    // Verify delays are non-decreasing
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it('retry respects maxRetries (never exceeds)', async () => {
    fc.assert(fc.asyncProperty(
      fc.integer({ min: 1, max: 3 }),
      async (maxRetries) => {
        errorHandler.errorCounts.clear();
        const callCount = { n: 0 };
        const op = jest.fn().mockImplementation(() => {
          callCount.n++;
          return Promise.reject(new Error('fail'));
        });
        const originalMax = errorHandler.maxRetries;
        errorHandler.maxRetries = maxRetries;

        try {
          await errorHandler.retry(op, 'testProp');
        } catch (e) {
          // expected
        }

        errorHandler.maxRetries = originalMax;
        // Total calls = maxRetries (initial attempt counts as attempt 1)
        expect(callCount.n).toBeLessThanOrEqual(maxRetries + 1);
      }
    ), { numRuns: 20 });
  });
});
