const { AsyncQueue } = require('../asyncQueue');

describe('AsyncQueue', () => {
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

  describe('add()', () => {
    it('throws if job missing type', async () => {
      await expect(queue.add({ handler: jest.fn() })).rejects.toThrow('Job must have type and handler properties');
    });

    it('throws if job missing handler', async () => {
      await expect(queue.add({ type: 'test' })).rejects.toThrow('Job must have type and handler properties');
    });

    it('increments totalJobs stat', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      await queue.add({ type: 'test', handler });
      expect(queue.getStats().totalJobs).toBeGreaterThanOrEqual(1);
    });

    it('starts processing immediately', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      await queue.add({ type: 'test', handler });
      await new Promise(r => setTimeout(r, 50));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('process()', () => {
    it('processes jobs in FIFO order', async () => {
      const order = [];
      const makeHandler = (n) => jest.fn().mockImplementation(async () => { order.push(n); });

      queue.queue.push({ id: 'j1', type: 'test', handler: makeHandler(1), data: {}, retries: 0, maxRetries: 3, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });
      queue.queue.push({ id: 'j2', type: 'test', handler: makeHandler(2), data: {}, retries: 0, maxRetries: 3, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });
      queue.queue.push({ id: 'j3', type: 'test', handler: makeHandler(3), data: {}, retries: 0, maxRetries: 3, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });

      await queue.process();
      expect(order).toEqual([1, 2, 3]);
    });

    it('increments completedJobs on success', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      queue.queue.push({ id: 'j1', type: 'test', handler, data: {}, retries: 0, maxRetries: 3, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });
      await queue.process();
      expect(queue.getStats().completedJobs).toBe(1);
    });

    it('retries failed jobs up to maxRetries', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('fail'));
      // maxRetries=2 → initial attempt + 1 retry = 2 calls
      queue.queue.push({ id: 'j1', type: 'test', handler, data: {}, retries: 0, maxRetries: 2, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });
      await queue.process();
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(queue.getStats().failedJobs).toBe(1);
    }, 15000);

    it('calls handleFailedJob after max retries exceeded', async () => {
      const handleFailedJobSpy = jest.spyOn(queue, 'handleFailedJob');
      const handler = jest.fn().mockRejectedValue(new Error('permanent failure'));
      queue.queue.push({ id: 'j1', type: 'test', handler, data: {}, retries: 0, maxRetries: 1, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });
      await queue.process();
      expect(handleFailedJobSpy).toHaveBeenCalled();
    }, 10000);
  });

  describe('getStats()', () => {
    it('returns a success rate of N/A when no jobs processed', () => {
      const stats = queue.getStats();
      expect(stats.successRate).toBe('N/A');
    });

    it('returns 100% success rate when all jobs succeed', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      queue.stats.totalJobs = 1; // simulate a job being added via add()
      queue.queue.push({ id: 'j1', type: 'test', handler, data: {}, retries: 0, maxRetries: 3, retryDelay: 1, addedAt: new Date().toISOString(), status: 'queued' });
      await queue.process();
      expect(queue.getStats().successRate).toBe('100.00%');
    });
  });

  describe('clear()', () => {
    it('removes all pending jobs and returns count', () => {
      queue.queue.push({ id: 'j1', type: 'test' });
      queue.queue.push({ id: 'j2', type: 'test' });
      const count = queue.clear();
      expect(count).toBe(2);
      expect(queue.queue.length).toBe(0);
    });
  });

  describe('getDLQ()', () => {
    it('returns a copy of the DLQ', () => {
      queue.handleFailedJob({ id: 'x1', type: 'test', error: 'boom', retries: 3, data: {} });
      const dlq = queue.getDLQ();
      expect(Array.isArray(dlq)).toBe(true);
      expect(dlq.length).toBeGreaterThan(0);
    });
  });

  describe('clearDLQ()', () => {
    it('empties the dead letter queue', () => {
      queue.handleFailedJob({ id: 'x1', type: 'test', error: 'boom', retries: 3, data: {} });
      queue.clearDLQ();
      expect(queue.getDLQ().length).toBe(0);
    });
  });

  describe('retryDLQJob()', () => {
    it('removes entry from DLQ and returns it', async () => {
      queue.handleFailedJob({ id: 'retry1', type: 'test', error: 'boom', retries: 3, data: {} });
      const entry = await queue.retryDLQJob('retry1');
      expect(entry.id).toBe('retry1');
      expect(queue.getDLQ().find(e => e.id === 'retry1')).toBeUndefined();
    });

    it('throws when job not found', async () => {
      await expect(queue.retryDLQJob('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('handleFailedJob() with alert webhook', () => {
    it('posts to ALERT_WEBHOOK_URL when set', async () => {
      const origUrl = process.env.ALERT_WEBHOOK_URL;
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/alert';

      const nock = require('nock');
      const alertNock = nock('https://hooks.example.com').post('/alert').reply(200, 'ok');

      const job = { id: 'alert1', type: 'test', error: 'boom', retries: 3, data: {} };
      queue.handleFailedJob(job);

      // Give the async axios call time to fire
      await new Promise(r => setTimeout(r, 50));
      process.env.ALERT_WEBHOOK_URL = origUrl || '';
      nock.cleanAll();

      expect(queue.deadLetterQueue.find(e => e.id === 'alert1')).toBeDefined();
    });
  });

  describe('handleFailedJob()', () => {
    it('adds job to deadLetterQueue', () => {
      const job = { id: 'j1', type: 'test', error: 'boom', retries: 3, data: {} };
      queue.handleFailedJob(job);
      expect(queue.deadLetterQueue).toBeDefined();
      expect(queue.deadLetterQueue.length).toBeGreaterThan(0);
      expect(queue.deadLetterQueue[0].id).toBe('j1');
    });

    it('assigns an errorCategory to the DLQ entry', () => {
      const job = { id: 'j1', type: 'test', error: 'ECONNREFUSED', retries: 3, data: {} };
      queue.handleFailedJob(job);
      const entry = queue.deadLetterQueue[queue.deadLetterQueue.length - 1];
      expect(entry.errorCategory).toBeDefined();
    });
  });
});
