const { AsyncQueue } = require('../../asyncQueue');
const errorHandler = require('../../utils/errorHandler');

describe('Error Resilience — E2E', () => {
  beforeEach(() => {
    errorHandler.errorCounts.clear();
    errorHandler.baseDelay = 1; // speed up tests
  });

  afterEach(() => {
    errorHandler.baseDelay = 1000;
  });

  describe('ErrorHandler retry logic', () => {
    it('retries on transient failure and succeeds', async () => {
      let attempt = 0;
      const op = async () => {
        attempt++;
        if (attempt < 3) throw new Error('transient');
        return 'ok';
      };

      const result = await errorHandler.retry(op, 'resilience-test');
      expect(result).toBe('ok');
      expect(attempt).toBe(3);
    }, 10000);

    it('throws descriptive error after all retries exhausted', async () => {
      const op = jest.fn().mockRejectedValue(new Error('permanent'));
      await expect(errorHandler.retry(op, 'fail-test')).rejects.toThrow(/failed after/);
    }, 10000);
  });

  describe('Circuit breaker', () => {
    it('opens circuit after 5 consecutive failures', () => {
      for (let i = 0; i < 5; i++) {
        errorHandler.incrementErrorCount('cbService');
      }
      expect(errorHandler.shouldCircuitBreak('cbService')).toBe(true);
    });

    it('resets after explicit reset', () => {
      for (let i = 0; i < 5; i++) {
        errorHandler.incrementErrorCount('cbService2');
      }
      errorHandler.resetCircuit('cbService2');
      expect(errorHandler.shouldCircuitBreak('cbService2')).toBe(false);
    });
  });

  describe('AsyncQueue DLQ', () => {
    let queue;

    beforeEach(() => {
      queue = new AsyncQueue();
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');
    });

    afterEach(() => {
      queue.clear();
      queue.clearDLQ();
    });

    it('captures permanently failed jobs in DLQ', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('permanent failure'));
      queue.queue.push({
        id: 'e2e-j1',
        type: 'resilience-test',
        handler,
        data: {},
        retries: 0,
        maxRetries: 1,
        retryDelay: 1,
        addedAt: new Date().toISOString(),
        status: 'queued'
      });
      await queue.process();
      expect(queue.deadLetterQueue.length).toBeGreaterThan(0);
      expect(queue.deadLetterQueue[0].errorCategory).toBeDefined();
    }, 10000);

    it('DLQ entries are clearable', async () => {
      queue.handleFailedJob({ id: 'x1', type: 'test', error: 'boom', retries: 3, data: {} });
      expect(queue.getDLQ().length).toBeGreaterThan(0);
      queue.clearDLQ();
      expect(queue.getDLQ().length).toBe(0);
    });
  });
});
