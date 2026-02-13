const errorHandler = require('../utils/errorHandler');

describe('ErrorHandler', () => {
  beforeEach(() => {
    // Reset error counts between tests
    errorHandler.errorCounts.clear();
  });

  describe('categorizeError()', () => {
    it('categorizes ECONNREFUSED as NETWORK', () => {
      const error = { code: 'ECONNREFUSED' };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('NETWORK');
      expect(result.retry).toBe(true);
    });

    it('categorizes ETIMEDOUT as NETWORK', () => {
      const error = { code: 'ETIMEDOUT' };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('NETWORK');
    });

    it('categorizes 429 as RATE_LIMIT', () => {
      const error = { status: 429 };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('RATE_LIMIT');
      expect(result.retry).toBe(true);
    });

    it('categorizes 401 as AUTH with no retry', () => {
      const error = { status: 401 };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('AUTH');
      expect(result.retry).toBe(false);
    });

    it('categorizes 403 as AUTH with no retry', () => {
      const error = { status: 403 };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('AUTH');
      expect(result.retry).toBe(false);
    });

    it('categorizes 500+ as SERVER with retry', () => {
      const error = { status: 500 };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('SERVER');
      expect(result.retry).toBe(true);
    });

    it('categorizes unknown errors as UNKNOWN', () => {
      const error = { message: 'something weird' };
      const result = errorHandler.categorizeError(error);
      expect(result.type).toBe('UNKNOWN');
    });

    it('always returns a valid type string', () => {
      const validTypes = ['NETWORK', 'RATE_LIMIT', 'AUTH', 'SERVER', 'CLIENT', 'UNKNOWN'];
      const errors = [
        { code: 'ECONNREFUSED' },
        { status: 429 },
        { status: 401 },
        { status: 500 },
        { status: 400 },
        { message: 'unknown' }
      ];
      errors.forEach(err => {
        const result = errorHandler.categorizeError(err);
        expect(validTypes).toContain(result.type);
      });
    });
  });

  describe('shouldCircuitBreak()', () => {
    it('returns false when error count below threshold', () => {
      expect(errorHandler.shouldCircuitBreak('testService')).toBe(false);
    });

    it('returns true after 5 consecutive errors', () => {
      for (let i = 0; i < 5; i++) {
        errorHandler.incrementErrorCount('testService');
      }
      expect(errorHandler.shouldCircuitBreak('testService')).toBe(true);
    });

    it('resets when resetCircuit() is called', () => {
      for (let i = 0; i < 5; i++) {
        errorHandler.incrementErrorCount('testService');
      }
      errorHandler.resetCircuit('testService');
      expect(errorHandler.shouldCircuitBreak('testService')).toBe(false);
    });
  });

  describe('retry()', () => {
    it('returns result on first success', async () => {
      const op = jest.fn().mockResolvedValue('ok');
      const result = await errorHandler.retry(op, 'test');
      expect(result).toBe('ok');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds eventually', async () => {
      const op = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockResolvedValue('success');

      // Patch baseDelay to 1ms for test speed
      const originalDelay = errorHandler.baseDelay;
      errorHandler.baseDelay = 1;
      const result = await errorHandler.retry(op, 'test');
      errorHandler.baseDelay = originalDelay;

      expect(result).toBe('success');
      expect(op).toHaveBeenCalledTimes(2);
    }, 10000);

    it('throws after maxRetries exhausted', async () => {
      const op = jest.fn().mockRejectedValue(new Error('persistent'));
      const originalDelay = errorHandler.baseDelay;
      errorHandler.baseDelay = 1;

      await expect(errorHandler.retry(op, 'test')).rejects.toThrow(/failed after/);
      errorHandler.baseDelay = originalDelay;
    }, 10000);

    it('resets error count on success', async () => {
      errorHandler.incrementErrorCount('cleanCtx');
      const op = jest.fn().mockResolvedValue('ok');
      await errorHandler.retry(op, 'cleanCtx');
      expect(errorHandler.errorCounts.get('cleanCtx')).toBeUndefined();
    });
  });

  describe('formatError()', () => {
    it('returns formatted error object with required fields', () => {
      const error = { message: 'test error', status: 500, stack: 'stack' };
      const formatted = errorHandler.formatError(error, 'myContext');
      expect(formatted.timestamp).toBeDefined();
      expect(formatted.context).toBe('myContext');
      expect(formatted.type).toBeDefined();
      expect(formatted.message).toBeDefined();
    });
  });
});
