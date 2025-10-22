/**
 * AsyncQueue Test Suite
 * 
 * Tests the async queue functionality including:
 * - Job queueing and processing
 * - Retry logic
 * - Error handling
 * - Metrics tracking
 */

const { AsyncQueue } = require('../asyncQueue');

describe('AsyncQueue', () => {
  let queue;

  beforeEach(() => {
    // Create fresh queue for each test
    queue = new AsyncQueue();
  });

  afterEach(() => {
    // Clear queue after each test
    queue.clear();
  });

  describe('Job Queueing', () => {
    test('should add job to queue', async () => {
      const handler = jest.fn().mockResolvedValue();
      
      await queue.add({
        type: 'test_job',
        data: { value: 123 },
        handler
      });

      const stats = queue.getStats();
      expect(stats.totalJobs).toBe(1);
    });

    test('should process job in background', async () => {
      const handler = jest.fn().mockResolvedValue();
      
      await queue.add({
        type: 'test_job',
        data: { value: 123 },
        handler
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler).toHaveBeenCalledWith({ value: 123 });
      
      const stats = queue.getStats();
      expect(stats.completedJobs).toBe(1);
      expect(stats.currentQueueSize).toBe(0);
    });

    test('should process multiple jobs in order', async () => {
      const results = [];
      
      for (let i = 1; i <= 3; i++) {
        await queue.add({
          type: `job_${i}`,
          data: { index: i },
          handler: async (data) => {
            results.push(data.index);
          }
        });
      }

      // Wait for all jobs to process
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(results).toEqual([1, 2, 3]);
      
      const stats = queue.getStats();
      expect(stats.completedJobs).toBe(3);
    });
  });

  describe('Error Handling', () => {
    test('should retry failed jobs', async () => {
      let attempts = 0;
      
      const handler = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      await queue.add({
        type: 'retry_job',
        data: {},
        handler,
        maxRetries: 3,
        retryDelay: 50
      });

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(attempts).toBe(3);
      
      const stats = queue.getStats();
      expect(stats.completedJobs).toBe(1);
      expect(stats.failedJobs).toBe(0);
    });

    test('should mark job as failed after max retries', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      await queue.add({
        type: 'failing_job',
        data: {},
        handler,
        maxRetries: 2,
        retryDelay: 50
      });

      // Wait for all retries
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(handler).toHaveBeenCalledTimes(3); // Initial + 2 retries
      
      const stats = queue.getStats();
      expect(stats.completedJobs).toBe(0);
      expect(stats.failedJobs).toBe(1);
    });
  });

  describe('Metrics', () => {
    test('should track job statistics', async () => {
      const successHandler = jest.fn().mockResolvedValue();
      const failHandler = jest.fn().mockRejectedValue(new Error('Failed'));

      // Add successful jobs
      for (let i = 0; i < 5; i++) {
        await queue.add({
          type: 'success_job',
          data: {},
          handler: successHandler,
          maxRetries: 0
        });
      }

      // Add failing job
      await queue.add({
        type: 'fail_job',
        data: {},
        handler: failHandler,
        maxRetries: 0
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = queue.getStats();
      expect(stats.totalJobs).toBe(6);
      expect(stats.completedJobs).toBe(5);
      expect(stats.failedJobs).toBe(1);
      expect(stats.successRate).toBe('83.33%');
    });

    test('should track current queue size', async () => {
      const slowHandler = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      // Add multiple jobs
      for (let i = 0; i < 5; i++) {
        await queue.add({
          type: 'slow_job',
          data: {},
          handler: slowHandler
        });
      }

      const statsBefore = queue.getStats();
      expect(statsBefore.currentQueueSize).toBeGreaterThan(0);

      // Wait for all to process
      await new Promise(resolve => setTimeout(resolve, 600));

      const statsAfter = queue.getStats();
      expect(statsAfter.currentQueueSize).toBe(0);
    });
  });

  describe('Queue Management', () => {
    test('should get queue contents', async () => {
      const handler = jest.fn().mockResolvedValue();

      await queue.add({
        type: 'test_job',
        data: { value: 1 },
        handler
      });

      const queueContents = queue.getQueue();
      expect(queueContents).toHaveLength(1);
      expect(queueContents[0].type).toBe('test_job');
      expect(queueContents[0]).toHaveProperty('id');
      expect(queueContents[0]).toHaveProperty('status');
    });

    test('should clear queue', async () => {
      const handler = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      for (let i = 0; i < 5; i++) {
        await queue.add({
          type: 'job',
          data: {},
          handler
        });
      }

      const cleared = queue.clear();
      
      expect(cleared).toBeGreaterThan(0);
      expect(queue.getQueue()).toHaveLength(0);
      
      const stats = queue.getStats();
      expect(stats.currentQueueSize).toBe(0);
    });
  });

  describe('Job Validation', () => {
    test('should throw error if job missing type', async () => {
      await expect(
        queue.add({
          data: {},
          handler: jest.fn()
        })
      ).rejects.toThrow('Job must have type and handler');
    });

    test('should throw error if job missing handler', async () => {
      await expect(
        queue.add({
          type: 'test',
          data: {}
        })
      ).rejects.toThrow('Job must have type and handler');
    });
  });
});

describe('Integration Tests', () => {
  test('should handle high volume of jobs', async () => {
    const queue = new AsyncQueue();
    const handler = jest.fn().mockResolvedValue();

    // Add 100 jobs
    for (let i = 0; i < 100; i++) {
      await queue.add({
        type: 'volume_test',
        data: { index: i },
        handler
      });
    }

    // Wait for all to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    const stats = queue.getStats();
    expect(stats.completedJobs).toBe(100);
    expect(handler).toHaveBeenCalledTimes(100);
    
    queue.clear();
  });

  test('should handle concurrent job additions', async () => {
    const queue = new AsyncQueue();
    const handler = jest.fn().mockResolvedValue();

    // Add jobs concurrently
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        queue.add({
          type: 'concurrent_test',
          data: { index: i },
          handler
        })
      );
    }

    await Promise.all(promises);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const stats = queue.getStats();
    expect(stats.completedJobs).toBe(50);
    
    queue.clear();
  });
});
