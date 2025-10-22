# Migration Guide: Unified Server with Async Processing

## 🎯 Overview

This migration consolidates **all services** into a single, unified server (`unified-server.js`) that includes:
- ✅ All Slack interactive commands
- ✅ Daily task automation
- ✅ Real-time webhook handling
- ✅ **NEW: Asynchronous request processing with background job queue**
- ✅ All interactive components (buttons, modals)

## 🚀 Key Improvements

### 1. **Async Request Handling**
- **Immediate Slack responses** - All commands respond within milliseconds
- **Background processing** - Heavy tasks processed in a job queue
- **No more timeouts** - Slack gets instant acknowledgment
- **Better user experience** - Users see "Processing..." feedback immediately

### 2. **Unified Architecture**
- **Single codebase** - No duplicate code across files
- **Shared resources** - One connection pool, one set of helpers
- **Easier maintenance** - Update once, deploy everywhere
- **Consistent logging** - All events in one place

### 3. **All Features Preserved**
- Daily task summaries (trigger via `/trigger` endpoint)
- Interactive Slack commands (`/tasks`, `/create-task`, etc.)
- Real-time webhook notifications
- Task action buttons (Complete, Update, Postpone, View)
- Modal interactions for task updates

## 📋 Migration Steps

### Step 1: Update Package.json

```json
{
  "name": "monday-slack-automation",
  "version": "6.0.0",
  "description": "Unified Monday.com to Slack automation with async processing",
  "main": "src/unified-server.js",
  "scripts": {
    "start": "node src/unified-server.js",
    "dev": "NODE_ENV=development node src/unified-server.js",
    "test": "node tests/automation.test.js",
    "legacy-server": "node src/server.js",
    "legacy-automation": "node src/automation.js"
  }
}
```

### Step 2: Environment Variables

**No changes required!** The unified server uses the same environment variables:

```bash
MONDAY_API_KEY=your_monday_api_key
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your_slack_signing_secret
PORT=3000
TEST_MODE=false  # Set to true for testing with single user
```

### Step 3: Update Render Configuration

Update `render.yaml`:

```yaml
services:
  - type: web
    name: monday-slack-automation
    env: node
    buildCommand: npm install
    startCommand: npm start  # Now points to unified-server.js
    envVars:
      - key: MONDAY_API_KEY
        sync: false
      - key: SLACK_BOT_TOKEN
        sync: false
      - key: SLACK_SIGNING_SECRET
        sync: false
      - key: PORT
        value: 3000
```

### Step 4: Deploy

```bash
# Push to main branch
git checkout main
git merge feature/unified-server-async
git push origin main

# Render will automatically deploy the new version
```

### Step 5: Set Up Daily Automation Cron (Optional)

In Render Dashboard:
1. Go to your service
2. Add a Cron Job (if needed for daily automation)
3. Schedule: `0 9 * * *` (9 AM daily)
4. Command: `curl -X POST https://your-app.onrender.com/trigger`

**Or manually trigger:**
```bash
curl -X POST https://your-app.onrender.com/trigger
```

## 🔄 What Changed?

### Architecture Changes

**Before:**
```
server.js (Slack commands only)
automation.js (Daily tasks only)
```

**After:**
```
unified-server.js (Everything + Async queue)
```

### Async Request Pattern

**Before:**
```javascript
app.command('/create-task', async ({ command, ack }) => {
  await ack();
  // Process immediately - could timeout!
  const boards = await fetchBoards();
  await openModal(boards);
});
```

**After:**
```javascript
app.command('/create-task', async ({ command, ack }) => {
  await ack();  // Respond immediately!
  
  // Queue for background processing
  taskQueue.add(async () => {
    const boards = await fetchBoards();
    await openModal(boards);
  });
});
```

### New AsyncQueue System

```javascript
class AsyncQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(task) {
    this.queue.push(task);
    if (!this.processing) {
      this.process();
    }
  }

  async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      try {
        await task();
      } catch (error) {
        console.error('[QUEUE] Error:', error);
      }
    }
    this.processing = false;
  }
}
```

## 📊 New Endpoints

All previous endpoints are preserved, plus new monitoring:

```
GET  /              - Server info and status
GET  /health        - Health check + queue status
GET  /metrics       - Detailed metrics + queue stats
POST /trigger       - Trigger daily automation
POST /slack/events  - Slack commands and interactions
POST /webhook/monday - Monday.com webhooks
```

### New Health Response

```json
{
  "status": "ok",
  "uptime": 12345,
  "lastRun": "2025-10-22T10:00:00Z",
  "metrics": {
    "commandsProcessed": 150,
    "asyncTasksQueued": 45,
    "webhooksReceived": 23,
    "notificationsSent": 23
  },
  "queueLength": 0,
  "queueProcessing": false
}
```

## 🧪 Testing the Migration

### 1. Test Async Commands

```bash
# Should respond immediately
curl -X POST https://your-app.onrender.com/slack/events \
  -H "Content-Type: application/json" \
  -d '{"command": "/tasks", "user_id": "U123"}'
```

### 2. Test Queue Status

```bash
curl https://your-app.onrender.com/health
```

Expected: `queueLength` and `queueProcessing` fields

### 3. Test Daily Automation

```bash
curl -X POST https://your-app.onrender.com/trigger
```

Expected: `{"status": "triggered", "message": "Daily automation started in background"}`

### 4. Test Slack Commands

In Slack:
- `/tasks` - Should show loading message, then tasks
- `/create-task` - Should open modal immediately
- Click "Mark Complete" button - Should show "Processing..." then confirmation

## 🔍 Monitoring

### Check Queue Status

```bash
# View current queue
curl https://your-app.onrender.com/metrics | jq '.queueStats'
```

### View Logs

```bash
# In Render dashboard
# Logs > Live Logs

# Look for:
# [QUEUE] - Queue operations
# [BUTTON] - Button interactions
# [MODAL] - Modal submissions
```

### Key Metrics to Monitor

```javascript
{
  "commandsProcessed": 0,      // Slack commands received
  "asyncTasksQueued": 0,        // Tasks added to queue
  "webhooksReceived": 0,        // Webhooks from Monday.com
  "notificationsSent": 0,       // Notifications sent
  "messagesUpdated": 0,         // Daily messages updated
  "messagesSent": 0,            // Daily messages sent
  "errors": 0                   // Total errors
}
```

## 🚨 Rollback Plan

If issues arise, quickly rollback:

### Option 1: Revert Git

```bash
git revert HEAD
git push origin main
```

### Option 2: Use Legacy Files

Update `package.json`:
```json
{
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js"
  }
}
```

### Option 3: Manual Deploy

In Render:
1. Go to service
2. Manual Deploy > Select previous commit
3. Deploy

## 📝 Deprecation Notice

The following files are deprecated but preserved for reference:
- `src/server.js` - Legacy Slack commands server
- `src/automation.js` - Legacy daily automation

These will be moved to `/legacy` in a future release.

## 🆘 Troubleshooting

### Issue: Commands timing out

**Solution:** Check queue is processing:
```bash
curl https://your-app.onrender.com/health | jq '.queueProcessing'
```

### Issue: Queue backing up

**Solution:** Monitor queue length:
```bash
curl https://your-app.onrender.com/metrics | jq '.queueStats.queueLength'
```

If > 10, investigate slow operations in logs.

### Issue: Daily automation not running

**Solution:** 
1. Check last run: `curl https://your-app.onrender.com/health | jq '.lastRun'`
2. Manually trigger: `curl -X POST https://your-app.onrender.com/trigger`
3. Verify cron job in Render dashboard

### Issue: Webhooks failing

**Solution:**
1. Check webhook endpoint: `curl -X POST https://your-app.onrender.com/webhook/monday`
2. Verify Monday.com webhook configuration
3. Check logs for webhook errors

## 📚 Additional Resources

- [Slack Bolt SDK](https://slack.dev/bolt-js/)
- [Monday.com API](https://developer.monday.com/api-reference)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## ✅ Migration Checklist

- [ ] Review new unified-server.js code
- [ ] Update package.json main field
- [ ] Test locally with `npm start`
- [ ] Verify all commands work
- [ ] Test async processing
- [ ] Check queue status
- [ ] Deploy to Render
- [ ] Verify production endpoints
- [ ] Set up cron job (if needed)
- [ ] Monitor for 24 hours
- [ ] Update documentation

## 🎉 Benefits After Migration

1. **⚡ Faster responses** - All Slack commands respond instantly
2. **🔄 Background processing** - No blocking operations
3. **📊 Better monitoring** - Queue stats and metrics
4. **🛠️ Easier maintenance** - Single codebase
5. **🚀 Scalability** - Queue handles load spikes
6. **🐛 Fewer bugs** - No duplicate code

---

**Version:** 6.0.0  
**Migration Date:** October 22, 2025  
**Status:** ✅ Ready for Production
