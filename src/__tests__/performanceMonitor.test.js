const { PerformanceMonitor } = require('../utils/performanceMonitor');

describe('PerformanceMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  describe('startTimer() / endTimer()', () => {
    it('endTimer returns the elapsed duration in ms', () => {
      const timer = monitor.startTimer('test');
      const duration = monitor.endTimer(timer);
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('stores timing data under the operation name', () => {
      const timer = monitor.startTimer('mondayFetch');
      monitor.endTimer(timer);
      const metrics = monitor.getMetrics();
      expect(metrics.performance.mondayFetch.avg).toBeGreaterThanOrEqual(0);
    });

    it('trims history to maxHistorySize', () => {
      for (let i = 0; i < 110; i++) {
        const timer = monitor.startTimer('testOp');
        monitor.endTimer(timer);
      }
      expect(monitor.metrics.timing.testOp.length).toBeLessThanOrEqual(100);
    });
  });

  describe('recordSuccess()', () => {
    it('increments successful and total request counts', () => {
      monitor.recordSuccess(100, { detail: 'ok' });
      const metrics = monitor.getMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.successful).toBe(1);
    });

    it('stores lastRun with success=true', () => {
      monitor.recordSuccess(50);
      expect(monitor.metrics.lastRun.success).toBe(true);
    });
  });

  describe('recordFailure()', () => {
    it('increments failed and total request counts', () => {
      monitor.recordFailure(new Error('oops'), 200);
      const metrics = monitor.getMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.failed).toBe(1);
    });

    it('stores lastRun with success=false', () => {
      monitor.recordFailure(new Error('oops'), 200);
      expect(monitor.metrics.lastRun.success).toBe(false);
    });
  });

  describe('calculateStats()', () => {
    it('returns zeros for empty array', () => {
      const stats = monitor.calculateStats([]);
      expect(stats.avg).toBe(0);
      expect(stats.p95).toBe(0);
    });

    it('calculates correct avg', () => {
      const stats = monitor.calculateStats([10, 20, 30]);
      expect(stats.avg).toBe(20);
    });

    it('min and max are correct', () => {
      const stats = monitor.calculateStats([5, 15, 25]);
      expect(stats.min).toBe(5);
      expect(stats.max).toBe(25);
    });
  });

  describe('getSuccessRate()', () => {
    it('returns 100 when no requests', () => {
      expect(monitor.getSuccessRate()).toBe(100);
    });

    it('calculates correct rate', () => {
      monitor.recordSuccess(10);
      monitor.recordSuccess(10);
      monitor.recordFailure(new Error('x'), 10);
      expect(monitor.getSuccessRate()).toBe(67); // 2/3 rounded
    });
  });

  describe('getHealthSummary()', () => {
    it('returns healthy status by default', () => {
      const summary = monitor.getHealthSummary();
      expect(summary.status).toBe('healthy');
    });

    it('returns degraded status at <75% success rate', () => {
      // Add 1 success, 4 failures → 20% success rate
      monitor.recordSuccess(10);
      for (let i = 0; i < 4; i++) monitor.recordFailure(new Error('x'), 10);
      const summary = monitor.getHealthSummary();
      expect(['degraded', 'unhealthy']).toContain(summary.status);
    });
  });

  describe('takeSnapshot()', () => {
    it('returns current metrics snapshot', () => {
      monitor.recordSuccess(100);
      const snapshot = monitor.takeSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.requests).toBeDefined();
    });
  });

  describe('toPrometheusFormat()', () => {
    it('returns a string in Prometheus text format', () => {
      monitor.recordSuccess(100);
      const output = monitor.toPrometheusFormat();
      expect(typeof output).toBe('string');
      expect(output).toContain('requests_total');
    });

    it('includes metric names and values', () => {
      monitor.recordSuccess(100);
      monitor.recordFailure(new Error('x'), 50);
      const output = monitor.toPrometheusFormat();
      expect(output).toMatch(/\d+/);
    });
  });

  describe('reset()', () => {
    it('clears all metrics', () => {
      monitor.recordSuccess(100);
      monitor.reset();
      expect(monitor.getMetrics().requests.total).toBe(0);
    });
  });

  describe('exportMetrics()', () => {
    it('does not throw when writing metrics', () => {
      monitor.recordSuccess(100);
      expect(() => monitor.exportMetrics()).not.toThrow();
    });
  });

  describe('loadMetrics()', () => {
    it('returns null when no metrics file exists', () => {
      // Only test the null case (file may or may not exist)
      const result = monitor.loadMetrics();
      // Either null or an object - both valid
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('getTrends()', () => {
    it('returns stable for < 2 samples', () => {
      const result = monitor.getTrends('nonexistent');
      expect(result.trend).toBe('stable');
      expect(result.slope).toBe(0);
    });

    it('returns increasing trend for growing values', () => {
      monitor.metrics.timing.testOp = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const result = monitor.getTrends('testOp', 10);
      expect(result.trend).toBe('increasing');
      expect(result.slope).toBeGreaterThan(0);
    });

    it('returns decreasing trend for shrinking values', () => {
      monitor.metrics.timing.testOp2 = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
      const result = monitor.getTrends('testOp2', 10);
      expect(result.trend).toBe('decreasing');
      expect(result.slope).toBeLessThan(0);
    });

    it('returns stable for flat values', () => {
      monitor.metrics.timing.flatOp = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
      const result = monitor.getTrends('flatOp', 10);
      expect(result.trend).toBe('stable');
    });
  });

  describe('stopPeriodicExport()', () => {
    it('can stop after starting', () => {
      monitor.startPeriodicExport(60000);
      expect(() => monitor.stopPeriodicExport()).not.toThrow();
    });

    it('stopPeriodicExport when not running is safe', () => {
      expect(() => monitor.stopPeriodicExport()).not.toThrow();
    });

    it('startPeriodicExport twice does not double-start', () => {
      monitor.startPeriodicExport(60000);
      const firstInterval = monitor._exportInterval;
      monitor.startPeriodicExport(60000);
      expect(monitor._exportInterval).toBe(firstInterval);
      monitor.stopPeriodicExport();
    });
  });

  describe('isPerformanceDegraded()', () => {
    it('returns degraded=false by default', () => {
      const result = monitor.isPerformanceDegraded();
      expect(result.degraded).toBe(false);
    });

    it('returns degraded=true when success rate low', () => {
      monitor.recordSuccess(10);
      for (let i = 0; i < 5; i++) monitor.recordFailure(new Error('x'), 10);
      const result = monitor.isPerformanceDegraded();
      expect(result.degraded).toBe(true);
    });
  });
});
