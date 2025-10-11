# Testing Guide

## How to Test the Automation

There are **3 ways** to test the Monday.com → Slack automation:

---

## Method 1: GitHub Actions UI (Recommended)

**Steps:**
1. Go to: https://github.com/usvsthem-notdev/monday-slack-automation/actions
2. Click on **"Daily Monday.com Task Sync"** workflow
3. Click the **"Run workflow"** button (top right, gray button)
4. Select branch: **main**
5. Click the green **"Run workflow"** button
6. Wait ~2-3 minutes
7. Refresh the page to see the run appear
8. Click on the run to see detailed logs
9. ✅ Check Slack for the message!

**What You'll See:**
- Workflow starts running (yellow dot 🟡)
- Workflow completes (green check ✅ or red X ❌)
- Detailed logs showing:
  - HTTP request to Render service
  - Response status
  - Success/failure message

**Screenshot guide:**
```
GitHub → Actions Tab → Daily Monday.com Task Sync → Run workflow
```

---

## Method 2: Command Line (curl)

**Prerequisites:**
- Terminal/Command Prompt
- `curl` installed (pre-installed on Mac/Linux)

**Test Command:**
```bash
curl -X POST https://monday-slack-automation.onrender.com/trigger
```

**Expected Response:**
```json
{
  "status": "triggered",
  "message": "Automation started",
  "timestamp": "2025-10-11T15:30:00.000Z"
}
```

**Check Service Health First:**
```bash
curl https://monday-slack-automation.onrender.com/health
```

**View Metrics After:**
```bash
curl https://monday-slack-automation.onrender.com/metrics
```

---

## Method 3: Automated Test Script

**Run the test script:**

```bash
# Download and run
curl -s https://raw.githubusercontent.com/usvsthem-notdev/monday-slack-automation/main/test-automation.sh | bash
```

**Or clone the repo:**
```bash
git clone https://github.com/usvsthem-notdev/monday-slack-automation.git
cd monday-slack-automation
chmod +x test-automation.sh
./test-automation.sh
```

**What the script does:**
1. ✅ Checks service health
2. 🚀 Triggers automation
3. ⏳ Waits for completion
4. 📊 Shows metrics
5. 📝 Provides links to logs

---

## What to Look For

### ✅ Success Indicators

**In GitHub Actions:**
- Green checkmark ✅
- Log shows: `✅ Automation triggered successfully!`
- HTTP Status: `200`

**In Slack:**
- Connor receives a DM from the Monday.com bot
- Message shows task summary with categories:
  - 🔴 Overdue
  - 🟡 Due Today
  - 🟢 Upcoming This Week
- Message includes "Open Monday.com" button

**In Render Logs:**
- `"level":"success","message":"Sent new message to Connor Drexler"`
- `"messagesUpdated":0,"messagesSent":1`
- `"usersProcessed":5,"usersSkipped":4`

### ❌ Failure Indicators

**Service Not Ready:**
```json
{
  "error": "Service Unavailable"
}
```
**Solution:** Wait for deployment to complete (check https://dashboard.render.com)

**Authentication Error:**
```json
{
  "error": "Unauthorized"
}
```
**Solution:** Check environment variables: `MONDAY_API_KEY`, `SLACK_BOT_TOKEN`

**No Response:**
- Service might be sleeping (free tier)
- First request may take 30-60 seconds
- Try again after waiting

---

## Verifying the Fix

### Before (Multiple Messages Problem):
```
09:00 - Deployment #1 → Message sent
12:00 - Deployment #2 → Message sent  
15:00 - Deployment #3 → Message sent
18:00 - Deployment #4 → Message sent
Result: 4 messages in one day ❌
```

### After (Scheduled Automation):
```
09:00 - Scheduled trigger → Message sent
12:00 - Deployment → NO message
15:00 - Deployment → NO message  
18:00 - Deployment → NO message
Result: 1 message per day ✅
```

**To Verify:**
1. Trigger automation manually now
2. Deploy the service (push a commit)
3. Confirm deployment does NOT send a message
4. Only manual/scheduled triggers send messages

---

## Deployment Status Check

**Is the service ready?**

Option 1: Check Render Dashboard
- https://dashboard.render.com/web/srv-d3k1gv6uk2gs739ht9d0
- Look for green "Live" status

Option 2: Check via API
```bash
curl https://monday-slack-automation.onrender.com/
```

Expected response:
```json
{
  "message": "Monday.com → Slack Automation Service",
  "status": "running",
  "version": "3.0",
  "mode": "scheduled",
  "schedule": "9:00 AM EST weekdays"
}
```

Option 3: Check latest deployment
```bash
# Service will show startup logs like:
"⏰ Automation will run on scheduled trigger (9 AM EST weekdays)"
"💡 Manual trigger available at POST /trigger"
"📅 Scheduled automation: 9 AM EST weekdays (GitHub Actions)"
```

---

## Troubleshooting

### Test Fails with 500 Error
**Cause:** Service might be deploying or restarting
**Solution:** Wait 2-3 minutes, try again

### Test Succeeds but No Slack Message
**Check:**
1. Render logs for errors
2. Is Connor's email correct in Monday.com?
3. Is Slack bot token valid?
4. Look for "Slack user not found" in logs

### GitHub Action Fails
**Check:**
1. Is the service URL correct in workflow file?
2. Is the service awake (free tier sleeps after inactivity)?
3. Review the Action logs for specific error

### Service Shows Old Version
**Cause:** Deployment in progress
**Solution:** Check deployment status, wait for "Live"

---

## Expected Timeline

**Immediate (Now):**
- ✅ Code deployed
- ✅ Service running
- ⏳ Waiting for deployment to complete

**After Deployment (2-3 minutes):**
- ✅ Service shows version 3.0
- ✅ Manual test works
- ✅ No startup automation

**Tomorrow (Monday 9 AM EST):**
- 🔔 First scheduled run
- 📬 Connor receives task summary
- 📊 GitHub Actions shows successful run

---

## Quick Test Checklist

- [ ] Service health check returns OK
- [ ] Manual trigger returns "triggered" status
- [ ] Render logs show automation running
- [ ] Metrics show `messagesSent: 1`
- [ ] Connor receives Slack message
- [ ] Message has correct format
- [ ] GitHub Actions workflow exists
- [ ] Can trigger via GitHub UI
- [ ] Deployment does NOT send message
- [ ] Only triggers send messages

---

## Need Help?

**Check these first:**
1. Render Dashboard: https://dashboard.render.com
2. GitHub Actions: https://github.com/usvsthem-notdev/monday-slack-automation/actions
3. Documentation: `docs/SCHEDULED_AUTOMATION.md`
4. Debug Guide: `docs/DEBUGGING_MULTIPLE_MESSAGES.md`

**Common Issues:**
- Service sleeping → First request wakes it (wait 30s)
- Deployment in progress → Wait for "Live" status
- No Slack message → Check logs for user lookup errors
- GitHub Action delayed → GitHub can delay cron by a few minutes

---

## Summary

✅ **Test NOW:** Use Method 1 (GitHub Actions UI) or Method 2 (curl)  
⏰ **Automatic Tomorrow:** 9 AM EST weekdays  
📊 **Monitor:** GitHub Actions + Render Dashboard  
🔧 **Troubleshoot:** Check logs and docs  

**The fix is complete - one message per day guaranteed!**
