// src/utils/performanceMonitor.js
// Real-time performance monitoring and metrics

const fs = require('fs');
const path = require('path');

const METRICS_FILE = path.join(__dirname, '../../data/metrics.json');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0
      },
      timing: {
        mondayFetch: [],
        slackPost: [],
        totalDuration: []
      },
      lastRun: null,
      uptime: Date.now()
    };
    
    // Keep only last 100 measurements for each metric
    this.maxHistorySize = 100;
  }

  // Start timing an operation
  startTimer(operationName) {
    return {
      name: operationName,
      start: Date.now()
    };
  }

  // End timing and record
  endTimer(timer) {
    const duration = Date.now() - timer.start;
    
    if (!this.metrics.timing[timer.name]) {
      this.metrics.timing[timer.name] = [];
    }
    
    this.metrics.timing[timer.name].push(duration);
    
    // Trim history if needed
    if (this.metrics.timing[timer.name].length > this.maxHistorySize) {
      this.metrics.timing[timer.name].shift();
    }
    
    return duration;
  }

  // Record a successful request
  recordSuccess(duration, details = {}) {
    this.metrics.requests.total++;
    this.metrics.requests.successful++;
    this.metrics.lastRun = {
      timestamp: new Date().toISOString(),
      success: true,
      duration,
      ...details
    };
  }

  // Record a failed request
  recordFailure(error, duration, details = {}) {
    this.metrics.requests.total++;
    this.metrics.requests.failed++;
    this.metrics.lastRun = {
      timestamp: new Date().toISOString(),
      success: false,
      duration,
      error: error.message,
      ...details
    };
  }

  // Calculate statistics for timing data
  calculateStats(timingArray) {
    if (!timingArray || timingArray.length === 0) {
      return {
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }
    
    const sorted = [...timingArray].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      avg: Math.round(sum / sorted.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  // Get success rate
  getSuccessRate() {
    if (this.metrics.requests.total === 0) return 100;
    
    return Math.round(
      (this.metrics.requests.successful / this.metrics.requests.total) * 100
    );
  }

  // Get uptime in hours
  getUptime() {
    const uptimeMs = Date.now() - this.metrics.uptime;
    return Math.round(uptimeMs / 1000 / 60 / 60 * 100) / 100; // Hours with 2 decimals
  }

  // Get comprehensive metrics report
  getMetrics() {
    return {
      requests: {
        ...this.metrics.requests,
        successRate: `${this.getSuccessRate()}%`
      },
      performance: {
        mondayFetch: this.calculateStats(this.metrics.timing.mondayFetch),
        slackPost: this.calculateStats(this.metrics.timing.slackPost),
        totalDuration: this.calculateStats(this.metrics.timing.totalDuration)
      },
      lastRun: this.metrics.lastRun,
      uptime: `${this.getUptime()} hours`,
      timestamp: new Date().toISOString()
    };
  }

  // Get a summary for health checks
  getHealthSummary() {
    const successRate = this.getSuccessRate();
    const avgDuration = this.calculateStats(this.metrics.timing.totalDuration).avg;
    
    return {
      status: successRate >= 95 ? 'healthy' : successRate >= 75 ? 'degraded' : 'unhealthy',
      successRate: `${successRate}%`,
      avgResponseTime: `${avgDuration}ms`,
      totalRequests: this.metrics.requests.total,
      uptime: `${this.getUptime()}h`,
      lastRun: this.metrics.lastRun?.timestamp || 'Never'
    };
  }

  // Check if performance is degraded
  isPerformanceDegraded() {
    const stats = this.calculateStats(this.metrics.timing.totalDuration);
    
    // Alert if average response time > 30 seconds
    if (stats.avg > 30000) {
      return {
        degraded: true,
        reason: 'High average response time',
        avgTime: stats.avg
      };
    }
    
    // Alert if success rate < 75%
    const successRate = this.getSuccessRate();
    if (successRate < 75) {
      return {
        degraded: true,
        reason: 'Low success rate',
        successRate
      };
    }
    
    return { degraded: false };
  }

  // Format metrics for console output
  formatForConsole() {
    const metrics = this.getMetrics();
    
    return `
╔══════════════════════════════════════════╗
║       📊 PERFORMANCE METRICS            ║
╚══════════════════════════════════════════╝

📈 Requests
  • Total:    ${metrics.requests.total}
  • Success:  ${metrics.requests.successful} (${metrics.requests.successRate})
  • Failed:   ${metrics.requests.failed}

⚡ Performance (ms)
  • Monday.com Fetch:
    - Avg: ${metrics.performance.mondayFetch.avg}ms
    - P95: ${metrics.performance.mondayFetch.p95}ms
    - P99: ${metrics.performance.mondayFetch.p99}ms
  
  • Slack Post:
    - Avg: ${metrics.performance.slackPost.avg}ms
    - P95: ${metrics.performance.slackPost.p95}ms
    - P99: ${metrics.performance.slackPost.p99}ms
  
  • Total Duration:
    - Avg: ${metrics.performance.totalDuration.avg}ms
    - P95: ${metrics.performance.totalDuration.p95}ms
    - Min: ${metrics.performance.totalDuration.min}ms
    - Max: ${metrics.performance.totalDuration.max}ms

🔄 Last Run
  • Time:    ${metrics.lastRun?.timestamp || 'Never'}
  • Status:  ${metrics.lastRun?.success ? '✅ Success' : '❌ Failed'}
  • Duration: ${metrics.lastRun?.duration || 0}ms

⏱️  Uptime: ${metrics.uptime}
`;
  }

  // Reset all metrics
  reset() {
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0 },
      timing: { mondayFetch: [], slackPost: [], totalDuration: [] },
      lastRun: null,
      uptime: Date.now()
    };
  }

  // Take a snapshot of current metrics (returns plain object)
  takeSnapshot() {
    return JSON.parse(JSON.stringify(this.getMetrics()));
  }

  // Export metrics to disk
  exportMetrics() {
    try {
      const dir = path.dirname(METRICS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const snapshot = this.takeSnapshot();
      const tmp = METRICS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
      fs.renameSync(tmp, METRICS_FILE);
    } catch (err) {
      console.error('[PerformanceMonitor] Failed to export metrics:', err.message);
    }
  }

  // Load metrics from disk (on startup)
  loadMetrics() {
    try {
      if (fs.existsSync(METRICS_FILE)) {
        const raw = fs.readFileSync(METRICS_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[PerformanceMonitor] Failed to load metrics:', err.message);
    }
    return null;
  }

  // Export in Prometheus text format
  toPrometheusFormat() {
    const m = this.getMetrics();
    const lines = [
      `# HELP requests_total Total number of requests`,
      `# TYPE requests_total counter`,
      `requests_total ${m.requests.total}`,
      `# HELP requests_successful_total Successful requests`,
      `# TYPE requests_successful_total counter`,
      `requests_successful_total ${m.requests.successful}`,
      `# HELP requests_failed_total Failed requests`,
      `# TYPE requests_failed_total counter`,
      `requests_failed_total ${m.requests.failed}`,
      `# HELP monday_fetch_avg_ms Average Monday.com fetch time`,
      `# TYPE monday_fetch_avg_ms gauge`,
      `monday_fetch_avg_ms ${m.performance.mondayFetch.avg}`,
      `# HELP monday_fetch_p95_ms 95th percentile Monday.com fetch time`,
      `# TYPE monday_fetch_p95_ms gauge`,
      `monday_fetch_p95_ms ${m.performance.mondayFetch.p95}`,
      `# HELP slack_post_avg_ms Average Slack post time`,
      `# TYPE slack_post_avg_ms gauge`,
      `slack_post_avg_ms ${m.performance.slackPost.avg}`,
      `# HELP uptime_hours Service uptime in hours`,
      `# TYPE uptime_hours gauge`,
      `uptime_hours ${this.getUptime()}`
    ];
    return lines.join('\n') + '\n';
  }

  // Compute linear trend for a named metric over last `window` samples
  getTrends(metricName, window = 10) {
    const data = (this.metrics.timing[metricName] || []).slice(-window);
    if (data.length < 2) return { slope: 0, trend: 'stable' };

    const n = data.length;
    const xMean = (n - 1) / 2;
    const yMean = data.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    data.forEach((y, x) => {
      num += (x - xMean) * (y - yMean);
      den += (x - xMean) ** 2;
    });
    const slope = den === 0 ? 0 : num / den;
    const trend = slope > 5 ? 'increasing' : slope < -5 ? 'decreasing' : 'stable';
    return { slope: Math.round(slope * 100) / 100, trend };
  }

  // Start periodic export (production only)
  startPeriodicExport(intervalMs = 60000) {
    if (this._exportInterval) return;
    this._exportInterval = setInterval(() => this.exportMetrics(), intervalMs);
  }

  // Stop periodic export
  stopPeriodicExport() {
    if (this._exportInterval) {
      clearInterval(this._exportInterval);
      this._exportInterval = null;
    }
  }
}

// Singleton instance
const monitor = new PerformanceMonitor();

// Export class for testing
module.exports = monitor;
module.exports.PerformanceMonitor = PerformanceMonitor;

// Auto-start periodic export in production
if (process.env.NODE_ENV === 'production') {
  monitor.startPeriodicExport();
}