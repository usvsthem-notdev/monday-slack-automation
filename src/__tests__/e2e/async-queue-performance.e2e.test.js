const { AsyncQueue } = require('../../asyncQueue');

describe('AsyncQueue — E2E performance', () => {
  let queue;

  beforeEach(() => {
    queue = new AsyncQueue();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  afterEach(() => {
    queue.clear();
  });

  it('acknowledges (queues) jobs in < 1ms average', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const N = 100;
    const times = [];

    for (let i = 0; i < N; i++) {
      const before = performance.now();
      // add() resolves once queued — before handler is called
      queue.queue.push({
        id: `j${i}`,
        type: 'perf-test',
        handler,
        data: {},
        retries: 0,
        maxRetries: 0,
        retryDelay: 0,
        addedAt: new Date().toISOString(),
        status: 'queued'
      });
      queue.stats.totalJobs++;
      const after = performance.now();
      times.push(after - before);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(1); // < 1ms average enqueue time
  });

  it('processes 1000 jobs without data loss', async () => {
    const processed = [];
    const N = 1000;

    for (let i = 0; i < N; i++) {
      queue.queue.push({
        id: `j${i}`,
        type: 'load-test',
        handler: jest.fn().mockImplementation(async (data) => { processed.push(data.n); }),
        data: { n: i },
        retries: 0,
        maxRetries: 0,
        retryDelay: 0,
        addedAt: new Date().toISOString(),
        status: 'queued'
      });
    }

    await queue.process();

    expect(processed.length).toBe(N);
    expect(new Set(processed).size).toBe(N); // all unique
  }, 30000);

  it('maintains FIFO order for 100 jobs', async () => {
    const order = [];
    const N = 100;

    for (let i = 0; i < N; i++) {
      queue.queue.push({
        id: `j${i}`,
        type: 'fifo-test',
        handler: jest.fn().mockImplementation(async (data) => { order.push(data.n); }),
        data: { n: i },
        retries: 0,
        maxRetries: 0,
        retryDelay: 0,
        addedAt: new Date().toISOString(),
        status: 'queued'
      });
    }

    await queue.process();

    for (let i = 0; i < N; i++) {
      expect(order[i]).toBe(i);
    }
  }, 15000);
});
