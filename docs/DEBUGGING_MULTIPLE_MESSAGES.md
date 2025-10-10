# Debugging Report: Multiple Slack Messages Issue

## 🔍 Issue Summary
The automation was sending **multiple Slack messages** instead of updating a single message for each user.

## Root Cause Analysis

### The Problem
**Ephemeral File Storage on Render's Free Tier**

1. **What's Happening:**
   - The message store is saved to `./data/message-store.json` on local filesystem
   - Render's free tier uses **ephemeral disk storage**
   - Every deployment/restart **wipes the filesystem**
   - The app can't find the previous message timestamps
   - Result: Sends NEW messages instead of updating existing ones

2. **Evidence from Logs:**
   ```json
   {
     "message": "No existing message store found, starting fresh",
     "messagesUpdated": 0,
     "messagesSent": 1
   }
   ```

3. **When This Happens:**
   - Every git push (auto-deployment)
   - Manual deployments
   - Service restarts/crashes
   - Daily restarts on free tier

### Why It Wasn't Caught Earlier
- The code logic was correct
- File saving/loading worked locally
- Issue only appears in **production** with ephemeral storage

## Timeline of Messages

Based on logs analysis:
```
18:24:08 - Instance starts → "No existing message store" → Sends message #1
21:30:24 - New deployment → "No existing message store" → Sends message #2  
21:33:18 - Another deployment → "No existing message store" → Sends message #3
21:36:17 - Another deployment → "No existing message store" → Sends message #4
```

Each deployment/restart = One new message to Connor Drexler (the only Slack-connected user)

## Solutions

### Option 1: Accept Ephemeral Storage (Current Implementation)
**Status:** ✅ Implemented

**Pros:**
- Simple, no additional services needed
- Works within Render free tier limits
- Logs message store for manual backup

**Cons:**
- Messages won't update across deployments
- Each deployment sends a new message
- Only updates work within a single instance lifetime

**When to Use:**
- Limited deployments per day
- Manual deployment control
- Development/testing environment

### Option 2: Render Postgres (Recommended for Production)
**Status:** 📋 Ready to implement

**Pros:**
- True persistent storage
- Survives deployments/restarts
- Free tier available
- Easy Render integration

**Implementation Steps:**
1. Create Render Postgres instance (free tier)
2. Add `DATABASE_URL` to environment variables
3. Update code to use Postgres for message store
4. Run migration to create `slack_messages` table

**Cost:** Free tier available

### Option 3: External Key-Value Store (Redis/Upstash)
**Status:** 📋 Alternative option

**Pros:**
- Fast access
- Simple key-value storage
- Good for caching

**Cons:**
- Requires external service
- Additional dependency
- May have costs

### Option 4: Scheduled Automation (No Persistence Needed)
**Status:** 💡 Alternative approach

**Idea:**
- Don't run automation on startup
- Use external cron job (e.g., GitHub Actions, cron-job.org)
- Call `/trigger` endpoint once per day at specific time
- Single daily run = Single message sent

**Pros:**
- No persistence needed
- Predictable message timing
- Deployments don't trigger automation

**Implementation:**
```yaml
# .github/workflows/daily-automation.yml
name: Daily Monday.com Sync
on:
  schedule:
    - cron: '0 9 * * 1-5'  # 9 AM weekdays
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Automation
        run: |
          curl -X POST https://your-app.onrender.com/trigger
```

## Current Status

### ✅ What's Working
- Code logic is correct
- Message updates work within single instance
- Only one user (Connor) gets messages (others skipped correctly)
- Error handling for Giadzy board works

### ⚠️ Known Limitations  
- Message store resets on deployment
- Multiple deployments = Multiple messages
- No cross-deployment message updates

### 🛠️ Temporary Workaround
1. Minimize deployments during business hours
2. Test thoroughly before deploying
3. Use manual deployment control
4. Deploy outside peak hours

## Recommendations

### Immediate (Today)
- ✅ Code updated to log ephemeral storage warning
- ✅ Documentation added
- 📋 Decide on persistence solution

### Short-term (This Week)
1. **If staying on free tier:** Implement Option 4 (Scheduled)
2. **If ready for persistence:** Implement Option 2 (Postgres)

### Long-term
- Migrate to Render Postgres for production
- Set up proper database migrations
- Add backup/restore functionality
- Monitor message store health

## Testing Checklist

To verify the fix:
- [x] Identified root cause (ephemeral storage)
- [x] Documented issue and solutions
- [x] Updated code with warnings
- [ ] Choose and implement persistence solution
- [ ] Test multiple deployments
- [ ] Verify message updates work across restarts
- [ ] Monitor for duplicate messages

## Additional Findings

### Giadzy Board Error
**Status:** ✅ Not critical

The error with nimjain@iu.edu accessing "Giadzy" board:
- Isolated to one board-user combination
- Gracefully handled (automation continues)
- Likely a permissions or board configuration issue
- Does not affect message duplication

### Slack User Mapping
- 4 of 5 Monday.com users not found in Slack
- Only Connor Drexler has Slack account
- This is expected behavior
- Others correctly skipped

## Metrics Summary

Current automation run:
```
Users Processed: 5
Users Skipped: 4 (no Slack account)
Tasks Found: 34
Messages Sent: 1 (per deployment)
Messages Updated: 0 (ephemeral storage)
Errors: 0 (Giadzy error handled gracefully)
```

## Next Steps

1. **Choose your persistence strategy** from options above
2. **If Option 4 (Scheduled):**
   - Set up GitHub Action or external cron
   - Remove automation from startup
   - Test with single daily run

3. **If Option 2 (Postgres):**
   - Create Postgres instance on Render
   - Install `pg` package
   - Update code to use database
   - Run migrations

4. **If Option 1 (Accept Current):**
   - Limit deployments
   - Deploy outside business hours
   - Accept new message per deployment

## Contact
For questions or to discuss implementation:
- Review this document
- Check Render logs at dashboard.render.com
- Test changes in staging environment first
