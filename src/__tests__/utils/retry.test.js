/**
 * Unit tests for retry utilities
 */

const {
  retryWithBackoff,
  batchProcess,
  rateLimit
} = require('../../utils/retry');

describe('Retry Utils', () => {
  describe('retryWithBackoff', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
    
    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 10
      });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
    
    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent error'));
      
      await expect(
        retryWithBackoff(fn, { maxRetries: 2, initialDelay: 10 })
      ).rejects.toThrow('persistent error');
      
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
    
    it('should respect shouldRetry function', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('special error'));
      const shouldRetry = jest.fn().mockReturnValue(false);
      
      await expect(
        retryWithBackoff(fn, { 
          maxRetries: 3, 
          shouldRetry,
          initialDelay: 10 
        })
      ).rejects.toThrow('special error');
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalled();
    });
    
    it('should apply exponential backoff', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      
      await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelay: 50,
        factor: 2
      });
      
      const duration = Date.now() - start;
      
      // Should have delays of ~50ms and ~100ms
      expect(duration).toBeGreaterThanOrEqual(150);
      expect(duration).toBeLessThan(300);
    });
  });
  
  describe('batchProcess', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const processor = jest.fn().mockImplementation(async (item) => item * 2);
      
      const results = await batchProcess(items, processor, 3);
      
      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      expect(processor).toHaveBeenCalledTimes(10);
    });
    
    it('should handle errors gracefully', async () => {
      const items = [1, 2, 3, 4];
      const processor = jest.fn()
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      
      const results = await batchProcess(items, processor, 2);
      
      expect(results).toEqual([1, null, 3, 4]);
      expect(processor).toHaveBeenCalledTimes(4);
    });
    
    it('should respect batch size', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      
      const processor = jest.fn().mockImplementation(async (item) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(resolve => setTimeout(resolve, 10));
        currentConcurrent--;
        return item;
      });
      
      await batchProcess(items, processor, 5);
      
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });
  });
  
  describe('rateLimit', () => {
    it('should enforce minimum interval between calls', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const limitedFn = rateLimit(fn, 100);
      
      const start = Date.now();
      
      await limitedFn();
      await limitedFn();
      await limitedFn();
      
      const duration = Date.now() - start;
      
      expect(fn).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThanOrEqual(200); // At least 2 intervals
    });
    
    it('should pass arguments correctly', async () => {
      const fn = jest.fn().mockImplementation(async (a, b) => a + b);
      const limitedFn = rateLimit(fn, 50);
      
      const result1 = await limitedFn(1, 2);
      const result2 = await limitedFn(3, 4);
      
      expect(result1).toBe(3);
      expect(result2).toBe(7);
      expect(fn).toHaveBeenCalledWith(1, 2);
      expect(fn).toHaveBeenCalledWith(3, 4);
    });
    
    it('should handle errors without affecting rate limiting', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');
      
      const limitedFn = rateLimit(fn, 50);
      
      await expect(limitedFn()).rejects.toThrow('error');
      
      const start = Date.now();
      const result = await limitedFn();
      const duration = Date.now() - start;
      
      expect(result).toBe('success');
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });
});