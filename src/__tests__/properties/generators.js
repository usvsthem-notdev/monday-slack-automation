// fast-check Arbitraries for property-based testing
const fc = require('fast-check');

// Valid task ID: numeric string
const taskId = fc.integer({ min: 1, max: 999999999 }).map(n => String(n));

// ISO 8601 date string (YYYY-MM-DD)
const isoDate = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31')
}).map(d => d.toISOString().split('T')[0]);

// Cache key: alphanumeric + colons + underscores
const cacheKey = fc.stringMatching(/^[a-zA-Z0-9:_]{1,50}$/);

// HTTP status codes
const httpStatus = fc.constantFrom(
  200, 201, 204,
  400, 401, 403, 404, 429,
  500, 502, 503
);

// Error codes
const errorCode = fc.constantFrom(
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET',
  'ERR_NETWORK', 'ERR_SERVER', 'ERR_AUTH', 'ERR_RATE_LIMIT'
);

// Job type string
const jobType = fc.constantFrom(
  'slack:notify', 'monday:update', 'slack:dm', 'webhook:process', 'cache:warm'
);

// Arbitrary cache value (JSON-serializable)
const cacheValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.object({ values: [fc.string()], maxDepth: 2 })
);

// TTL in milliseconds (100ms to 1 hour)
const ttlMs = fc.integer({ min: 100, max: 3600000 });

// User ID (Slack-style)
const slackUserId = fc.stringMatching(/^[A-F0-9]{8,11}$/).map(s => 'U' + s);

module.exports = {
  taskId,
  isoDate,
  cacheKey,
  httpStatus,
  errorCode,
  jobType,
  cacheValue,
  ttlMs,
  slackUserId
};
