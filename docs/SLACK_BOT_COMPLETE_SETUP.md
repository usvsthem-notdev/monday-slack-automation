# 🤖 Complete Slack Bot Setup Guide

Step-by-step instructions for building your Slack bot from scratch.

## Quick Start Steps

1. **Create Slack App** at https://api.slack.com/apps
2. **Add Required Scopes**: chat:write, im:write, users:read, users:read.email, commands
3. **Enable Interactivity**: Set URL to `https://your-app.onrender.com/slack/events`
4. **Create Slash Commands**: `/tasks` and `/task-complete`
5. **Install to Workspace** and copy Bot Token & Signing Secret
6. **Deploy to Render** with environment variables
7. **Test** health endpoint, commands, and buttons

---

## Detailed Instructions

### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name: `Monday.com Task Bot`
4. Select your workspace
5. Click **"Create App"**

### 2. Add Bot Scopes

1. Left sidebar → **"OAuth & Permissions"**
2. Scroll to **"Bot Token Scopes"**
3. Add these scopes:

```
✅ chat:write              (Send messages)
✅ chat:write.public       (Send to public channels)
✅ im:write                (Send DMs)
✅ users:read              (View members)
✅ users:read.email        (Match users by email)
✅ commands                (Slash commands)
```

Optional but recommended:
```
⚪ channels:read           (View channels)
⚪ groups:read             (View private channels)
⚪ im:history              (Read DM history)
⚪ mpim:history            (Read group DM history)
```

### 3. Enable Interactivity

1. Left sidebar → **"Interactivity & Shortcuts"**
2. Toggle **ON**
3. Request URL: `https://your-app.onrender.com/slack/events`
4. Save Changes

⚠️ If not deployed yet, skip and return after deployment

### 4. Create Slash Commands

**Create `/tasks` command:**
- Command: `/tasks`
- Request URL: `https://your-app.onrender.com/slack/events`
- Description: `View your Monday.com tasks`
- Usage Hint: `[optional: board name]`
- Check: Escape channels, users, and links

**Create `/task-complete` command:**
- Command: `/task-complete`
- Request URL: `https://your-app.onrender.com/slack/events`
- Description: `Mark task as complete`
- Usage Hint: `task name`
- Check: Escape channels, users, and links

### 5. Install & Get Credentials

1. Left sidebar → **"Install App"**
2. Click **"Install to Workspace"** → **"Allow"**
3. Copy **Bot User OAuth Token** (starts with `xoxb-`)
4. Go to **"Basic Information"** → **"App Credentials"**
5. Copy **Signing Secret**

💾 Save both tokens!

### 6. Deploy to Render

1. Go to https://dashboard.render.com
2. New + → Web Service
3. Connect GitHub repo: `monday-slack-automation`
4. Configure:
   - Name: `monday-slack-automation`
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add Environment Variables:

```bash
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-secret-here
MONDAY_API_KEY=your-monday-key-here
PORT=10000
```

6. Click **"Create Web Service"**
7. Wait for deployment (2-5 minutes)
8. Note your URL: `https://your-app.onrender.com`

### 7. Update Slack URLs (If you skipped step 3)

Now that app is deployed, go back to Slack:

1. **Interactivity & Shortcuts**
   - Update Request URL to your actual Render URL
   - Save and verify ✅ green checkmark

2. **Slash Commands** (for each command)
   - Update Request URL to your actual Render URL
   - Save each command

### 8. Test Everything

**Test health endpoint:**
```bash
curl https://your-app.onrender.com/health
```

Expected:
```json
{"status":"ok","timestamp":"2025-10-15T17:30:00.000Z"}
```

**Test slash command in Slack:**
1. Type `/tasks` in any channel
2. Press Enter
3. Should see bot response

**Test buttons:**
1. Assign yourself a task in Monday.com
2. Check Slack for notification
3. Click a button (✅ Complete, 📝 Update, etc.)
4. Should complete without "operation_timeout" error

---

## Troubleshooting

### ❌ "Couldn't verify your URL"

**Fix:**
1. Verify Render deployment completed
2. Test: `curl https://your-app.onrender.com/health`
3. Check URL is exactly `/slack/events`
4. Wait 30 seconds and retry
5. Check Render logs for errors

### ❌ "Token is invalid"

**Fix:**
1. Re-copy Bot Token from OAuth & Permissions
2. Must start with `xoxb-`
3. No spaces or line breaks
4. Update in Render Environment variables
5. Redeploy

### ❌ Buttons show "operation_timeout"

**Fix:**
1. Verify on v4.9.0-hotfix or later
2. Check `ack()` is called without `await`
3. Review Render logs
4. Restart Render service

### ❌ Can't find users by email

**Fix:**
1. Add `users:read.email` scope
2. Reinstall app to workspace
3. Verify emails match in Slack and Monday.com
4. Test with your own email first

### ❌ Bot can't send messages

**Fix:**
1. Add `chat:write` and `chat:write.public` scopes
2. Invite bot to channel: `/invite @Monday.com Task Bot`
3. Verify bot installed in workspace
4. Check SLACK_BOT_TOKEN is correct

---

## Required Scopes Checklist

Before launching:

- [ ] `chat:write` - Send messages
- [ ] `chat:write.public` - Send to public channels
- [ ] `im:write` - Send DMs
- [ ] `users:read` - View members
- [ ] `users:read.email` - Match by email
- [ ] `commands` - Slash commands

---

## Environment Variables Reference

| Variable | Where to Get | Format |
|----------|--------------|--------|
| `SLACK_BOT_TOKEN` | OAuth & Permissions → Bot User OAuth Token | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | Basic Information → App Credentials | `abc123...` |
| `MONDAY_API_KEY` | Monday.com → Profile → Admin → API | `eyJhb...` |
| `PORT` | Set manually | `10000` |

---

## Complete Pre-Launch Checklist

**Slack Configuration:**
- [ ] App created
- [ ] 6 required scopes added
- [ ] Bot installed to workspace
- [ ] Bot token saved
- [ ] Signing secret saved
- [ ] Interactivity enabled with verified URL ✅
- [ ] Slash commands created with verified URLs ✅

**Render Deployment:**
- [ ] Service created and connected
- [ ] All environment variables set
- [ ] Deployment successful
- [ ] Health endpoint returns 200
- [ ] No errors in logs

**Testing:**
- [ ] Health endpoint works
- [ ] `/tasks` command works
- [ ] `/task-complete` command works
- [ ] Buttons work without timeout
- [ ] Bot finds users by email
- [ ] Bot sends DMs

---

## Quick Reference

**Slack API Dashboard:**
https://api.slack.com/apps

**Render Dashboard:**
https://dashboard.render.com

**Test Commands:**
```bash
# Health check
curl https://your-app.onrender.com/health

# Metrics
curl https://your-app.onrender.com/metrics

# Service info
curl https://your-app.onrender.com/
```

**Slack Test Commands:**
```
/tasks
/task-complete Task Name
/invite @Monday.com Task Bot
```

---

## App Manifest (Quick Setup Alternative)

Instead of manual setup, use this manifest:

1. Go to https://api.slack.com/apps
2. Create New App → From manifest
3. Paste this YAML:

```yaml
display_information:
  name: Monday.com Task Bot
  description: Automated task notifications from Monday.com
  background_color: "#ff3d57"
features:
  bot_user:
    display_name: Monday.com Task Bot
    always_online: true
  slash_commands:
    - command: /tasks
      url: https://your-app.onrender.com/slack/events
      description: View Monday.com tasks
      should_escape: true
    - command: /task-complete
      url: https://your-app.onrender.com/slack/events
      description: Mark task complete
      should_escape: true
oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - im:write
      - users:read
      - users:read.email
      - commands
      - channels:read
      - groups:read
      - im:history
      - mpim:history
settings:
  interactivity:
    is_enabled: true
    request_url: https://your-app.onrender.com/slack/events
  event_subscriptions:
    request_url: https://your-app.onrender.com/slack/events
    bot_events:
      - message.im
      - app_mention
```

4. Replace `your-app.onrender.com` with your URL
5. Create and install

---

## Next Steps

After setup:

1. ✅ **Configure Monday.com Webhooks** - See `WEBHOOK_SETUP.md`
2. ✅ **Test notifications** - Assign yourself a task
3. ✅ **Monitor logs** - Check Render Dashboard
4. ✅ **View metrics** - Visit `/metrics` endpoint
5. ✅ **Customize** - Edit message formats in `src/automation.js`

---

## Additional Documentation

- **Main README**: `README.md`
- **Webhook Setup**: `docs/WEBHOOK_SETUP.md`
- **Testing Guide**: `docs/TESTING_GUIDE.md`
- **Button Fix**: `docs/BUTTON_TIMEOUT_FIX.md`
- **Slack Commands**: `docs/SLACK_COMMANDS_SETUP.md`

---

**Guide Version**: 1.0  
**Last Updated**: October 15, 2025  
**App Version**: v4.9.0+  
**Status**: ✅ Production Ready

🚀 **Your Slack bot is ready!**
