# API Reference

## Slack Commands

| Command | Description |
|---------|-------------|
| `/tasks` | Shows your incomplete tasks from Monday.com, organized by due date |
| `/quick-task <title>` | Opens a task creation form |

## Webhook Endpoints

### `POST /monday/webhook`
Receives events from Monday.com (assignment changes, item updates).

**Challenge response:** Returns `{ challenge }` for verification.

**Assignment events:** Detects people column changes and sends Slack DMs to newly assigned users.

### `GET /health`
Returns server health status and performance summary.

### `GET /queue/status`
Returns AsyncQueue statistics (total, completed, failed jobs).

### `GET /queue/dlq`
Returns all Dead Letter Queue entries.

### `DELETE /queue/dlq`
Clears all DLQ entries.

### `GET /metrics`
Returns detailed performance metrics.

### `GET /metrics/prometheus`
Returns metrics in Prometheus text format.

## Internal Modules

### AsyncQueue (`src/asyncQueue.js`)

```js
const queue = require('./asyncQueue');

// Add a job
await queue.add({
  type: 'slack:notify',
  data: { userId: 'U123', message: 'Hello' },
  handler: async (data) => { /* ... */ },
  maxRetries: 3,
  retryDelay: 1000
});

// Get statistics
queue.getStats();

// Dead Letter Queue
queue.getDLQ();        // list
queue.clearDLQ();      // clear all
await queue.retryDLQJob('job_id'); // retry one
```

### CacheManager (`src/utils/cacheManager.js`)

```js
const { cache } = require('./utils/cacheManager');

cache.set('key', data, ttlMs);
const value = cache.get('key');   // null if expired/missing
cache.invalidate('key');
cache.invalidatePattern('monday:');

// Wrap with auto-cache
const result = await cache.wrap('key', async () => fetchData());
```

### PerformanceMonitor (`src/utils/performanceMonitor.js`)

```js
const monitor = require('./utils/performanceMonitor');

const timer = monitor.startTimer('mondayFetch');
// ... do work ...
const durationMs = monitor.endTimer(timer);

monitor.recordSuccess(durationMs);
monitor.recordFailure(error, durationMs);

monitor.getMetrics();
monitor.toPrometheusFormat();
monitor.exportMetrics();          // writes to data/metrics.json
monitor.getTrends('mondayFetch'); // linear regression trend
```

### ErrorHandler (`src/utils/errorHandler.js`)

```js
const errorHandler = require('./utils/errorHandler');

// Retry with exponential backoff
const result = await errorHandler.retry(operation, 'contextName');

// Circuit breaker
if (errorHandler.shouldCircuitBreak('mondayApi')) {
  throw new Error('Circuit open');
}

// Categorize errors
const { type, retry, message } = errorHandler.categorizeError(error);
// type: 'NETWORK' | 'RATE_LIMIT' | 'AUTH' | 'SERVER' | 'CLIENT' | 'UNKNOWN'
```

## Monday.com GraphQL Queries

### Get boards by workspace
```graphql
query {
  boards(workspace_ids: [WORKSPACE_ID], limit: 50) {
    id
    name
    columns { id title type settings_str }
  }
}
```

### Get items for a board
```graphql
query {
  boards(ids: [BOARD_ID]) {
    items_page(limit: 100) {
      items {
        id
        name
        column_values { id text value type }
      }
    }
  }
}
```
