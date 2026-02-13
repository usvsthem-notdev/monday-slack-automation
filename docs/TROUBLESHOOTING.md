# Troubleshooting Guide

## Slack Command Timeout (> 3 seconds)

**Symptom:** Slack shows "This app is taking too long to respond."

**Cause:** The `/tasks` command calls Monday.com synchronously before acknowledging Slack.

**Fix:** Ensure `ack()` is called synchronously, and all Monday.com work runs in `setImmediate` or `asyncQueue.add()`.

**Check:** Verify `src/tasksCommand.js` calls `ack()` at the very top of the handler.

---

## High Memory Usage

**Symptom:** Process memory grows unboundedly; Node.js OOM kills.

**Diagnose:**
```bash
npm run profile:heapprofiler
```

**Common causes:**
- Cache never evicts (check `CacheManager` TTL settings)
- DLQ growing without bound (check `GET /queue/dlq`)
- Performance monitor history too large (default 100, see `maxHistorySize`)

---

## DLQ Growing

**Symptom:** `GET /queue/dlq` returns many entries.

**Diagnose:** Check the `errorCategory` field on DLQ entries:
- `NETWORK` — Monday.com or Slack unreachable; check network/firewall
- `AUTH` — API key expired or revoked; rotate `MONDAY_API_KEY` / `SLACK_BOT_TOKEN`
- `RATE_LIMIT` — Too many requests; reduce job throughput
- `SERVER` — Upstream 5xx errors; check Monday.com/Slack status pages

**Retry a single job:**
```
POST /queue/dlq/:id/retry
```

**Clear all:**
```
DELETE /queue/dlq
```

---

## Circuit Breaker Open

**Symptom:** Requests fail immediately with "Circuit breaker opened for X".

**Cause:** 5+ consecutive errors for a service context.

**Fix:**
1. Investigate root cause (network, auth, rate limit)
2. Call `errorHandler.resetCircuit('contextName')` after fixing

---

## Debug Mode

Set `LOG_LEVEL=debug` to see all log output:
```bash
LOG_LEVEL=debug npm start
```

Set `DEBUG_TESTS=1` to see console output during tests:
```bash
DEBUG_TESTS=1 npm test
```

---

## Monday.com API Errors

**"complexityBudgetExhausted"** — Too many items queried at once. Reduce `limit` in GraphQL queries.

**"invalidColumnId"** — Board column IDs don't match. Re-fetch board structure.

**Authentication errors** — Verify `MONDAY_API_KEY` is set and valid.
