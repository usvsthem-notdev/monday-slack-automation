// src/utils/performanceMonitor.js
// Real-time performance monitoring and metrics

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
}

// Singleton instance
const monitor = new PerformanceMonitor();

module.exports = monitor;