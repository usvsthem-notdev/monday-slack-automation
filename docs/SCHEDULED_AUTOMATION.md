# Scheduled Automation Setup

## ✅ Solution Implemented: Daily Scheduled Automation

The multiple messages issue has been **solved** by implementing scheduled automation via GitHub Actions.

### How It Works

1. **No Startup Automation**: The service no longer runs automation when it starts or deploys
2. **Scheduled Trigger**: GitHub Actions runs the automation once per day at 9:00 AM EST (weekdays only)
3. **Single Message**: Users receive exactly ONE task summary message per day
4. **No Persistence Needed**: Since we run once per day, message store resets are irrelevant

### Schedule

**When:** Monday through Friday at 9:00 AM Eastern Time (14:00 UTC)

**What Happens:**
1. GitHub Actions wakes up at the scheduled time
2. Sends POST request to `https://monday-slack-automation.onrender.com/trigger`
3. Automation fetches tasks and sends Slack messages
4. Users see their daily task list

### Files Modified

1. **`.github/workflows/daily-sync.yml`** (NEW)
   - GitHub Action workflow
   - Runs on schedule: `0 14 * * 1-5` (cron)
   - Manual trigger available via GitHub UI

2. **`src/automation.js`** (UPDATED)
   - Removed automation from `startServer()`
   - Automation only runs when `/trigger` endpoint is called
   - Server starts without running automation

### Benefits

✅ **Predictable**: Always runs at 9 AM EST  
✅ **Single Message**: One message per day guaranteed  
✅ **No Duplicates**: Deployments don't trigger automation  
✅ **Free**: GitHub Actions is free for public repos  
✅ **Simple**: No database or external services needed  
✅ **Reliable**: GitHub's infrastructure handles scheduling  

### Manual Testing

You can manually trigger the automation anytime:

**Option 1: Via GitHub Actions UI**
1. Go to https://github.com/usvsthem-notdev/monday-slack-automation/actions
2. Click "Daily Monday.com Task Sync"
3. Click "Run workflow" → "Run workflow"

**Option 2: Via API Call**
```bash
curl -X POST https://monday-slack-automation.onrender.com/trigger
```

**Option 3: Via Browser**
Open: https://monday-slack-automation.onrender.com/health (to check status)

### Viewing Automation Runs

1. Go to [GitHub Actions](https://github.com/usvsthem-notdev/monday-slack-automation/actions)
2. Click "Daily Monday.com Task Sync"
3. See all past runs and their status
4. Click any run to see detailed logs

### Customizing the Schedule

To change when the automation runs, edit `.github/workflows/daily-sync.yml`:

```yaml
schedule:
  # Current: 9 AM EST (14:00 UTC) weekdays
  - cron: '0 14 * * 1-5'
  
  # Examples:
  # 8 AM EST weekdays: '0 13 * * 1-5'
  # 10 AM EST weekdays: '0 15 * * 1-5'
  # Every day at 9 AM: '0 14 * * *'
  # Twice daily (9 AM and 5 PM): 
  #   - cron: '0 14 * * *'
  #   - cron: '0 22 * * *'
```

**Cron Format:**
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── day of week (0-6, Sunday=0)
│ │ │ └───── month (1-12)
│ │ └─────── day of month (1-31)
│ └───────── hour (0-23, UTC timezone)
└─────────── minute (0-59)
```

### Troubleshooting

**Automation didn't run at scheduled time:**
- Check GitHub Actions status page
- Verify the workflow file is on `main` branch
- GitHub Actions can be delayed by a few minutes

**Want to test immediately:**
- Use manual trigger options above
- Don't deploy - deployments no longer trigger automation

**Need to change schedule:**
1. Edit `.github/workflows/daily-sync.yml`
2. Update the cron expression
3. Commit and push to `main` branch
4. New schedule takes effect immediately

**Automation runs but no messages:**
- Check Render logs for errors
- Verify `SLACK_BOT_TOKEN` and `MONDAY_API_KEY` are set
- Use `/health` endpoint to check service status

### What Changed from Before

**Before:**
- ❌ Automation ran on every deployment
- ❌ Multiple messages per day
- ❌ Unpredictable timing
- ❌ Message store reset issues

**After:**
- ✅ Automation runs once per day
- ✅ Single message per user
- ✅ Predictable 9 AM delivery
- ✅ No message store needed

### Cost

**Everything is FREE:**
- GitHub Actions: Free for public repos
- Render: Free tier
- Monday.com API: Included
- Slack API: Included

### Next Steps

The automation is **ready to go**! It will:
- Run tomorrow morning at 9 AM EST
- Send task summaries to users with Slack accounts
- Update the same message if run multiple times same day
- Show run status in GitHub Actions

**To verify it's working:**
1. Wait for tomorrow's 9 AM run
2. Or manually trigger now for testing
3. Check GitHub Actions for run status
4. Check Slack for the message

### Support

If you need help:
1. Check GitHub Actions logs
2. Check Render logs: https://dashboard.render.com
3. Review the debugging docs in `/docs`
4. Test manually using `/trigger` endpoint

## Summary

🎉 **Problem Solved!** The multiple messages issue is fixed. Your automation now runs on a predictable schedule, sending exactly one message per day to each user.
