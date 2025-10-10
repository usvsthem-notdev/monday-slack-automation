# Slack Commands Setup Guide

## Overview
This guide will help you set up Slack slash commands to create and assign Monday.com tasks directly from Slack.

## Available Commands

### `/create-task`
Opens an interactive form to create a new Monday.com task with full options:
- Task name
- Board selection
- Assignee(s)
- Due date
- Status

### `/quick-task [task name]`
Quickly create a task with just a name on the default board.
Example: `/quick-task Review Q4 budget`

### `/monday-help`
Display help information about available commands.

## Setup Instructions

### 1. Create/Update Slack App

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Select your existing app or create a new one
3. Navigate to **OAuth & Permissions**
4. Add the following Bot Token Scopes:
   - `commands` - For slash commands
   - `chat:write` - To post messages
   - `users:read` - To look up users
   - `users:read.email` - To match Monday.com users

### 2. Create Slash Commands

Navigate to **Slash Commands** in your Slack app settings and create three commands:

#### Command 1: `/create-task`
- **Command**: `/create-task`
- **Request URL**: `https://your-render-app.onrender.com/slack/events`
- **Short Description**: Create a new Monday.com task
- **Usage Hint**: Opens a form to create a task

#### Command 2: `/quick-task`
- **Command**: `/quick-task`
- **Request URL**: `https://your-render-app.onrender.com/slack/events`
- **Short Description**: Quickly create a task
- **Usage Hint**: [task name]

#### Command 3: `/monday-help`
- **Command**: `/monday-help`
- **Request URL**: `https://your-render-app.onrender.com/slack/events`
- **Short Description**: Show Monday.com commands help
- **Usage Hint**: (no parameters needed)

### 3. Enable Interactivity

1. Navigate to **Interactivity & Shortcuts**
2. Turn on Interactivity
3. Set Request URL to: `https://your-render-app.onrender.com/slack/events`

### 4. Environment Variables

Add the following environment variable to your Render service:

```bash
SLACK_SIGNING_SECRET=your_slack_signing_secret_here
```

You can find your Signing Secret in **Basic Information** > **App Credentials**

Your existing environment variables should include:
- `MONDAY_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN` (optional, for Socket Mode)

### 5. Reinstall App to Workspace

1. Go to **Install App** in your Slack app settings
2. Click **Reinstall to Workspace**
3. Authorize the new permissions

## Testing the Commands

### Test `/create-task`
1. In any Slack channel, type `/create-task`
2. A modal should appear with a form
3. Fill in the details and click "Create Task"
4. You should receive a confirmation message

### Test `/quick-task`
1. Type `/quick-task Review design mockups`
2. You should receive a confirmation that the task was created

### Test `/monday-help`
1. Type `/monday-help`
2. You should see help documentation

## Troubleshooting

### Commands not appearing
- Verify the commands are created in your Slack app settings
- Reinstall the app to your workspace
- Check that the Request URLs are correct

### "dispatch_failed" error
- Verify your Render service is running
- Check the Request URL matches your Render service URL
- Ensure the `/slack/events` endpoint is accessible

### Tasks not being created
- Check Render logs for errors
- Verify `MONDAY_API_KEY` has proper permissions
- Ensure the Monday.com board exists and is accessible

### Permission errors
- Verify all required OAuth scopes are added
- Reinstall the app after adding new scopes
- Check that the bot is invited to relevant channels

## Support

For issues or questions:
1. Check Render logs: `https://dashboard.render.com`
2. Review Slack API logs: `https://api.slack.com/apps/[YOUR_APP_ID]/event-subscriptions`
3. Test Monday.com API access using the `/health` endpoint

## Security Notes

- Never commit your `SLACK_SIGNING_SECRET` or `SLACK_BOT_TOKEN` to version control
- Use Render's environment variables for all sensitive data
- The signing secret validates that requests come from Slack
- All commands are authenticated through Slack's verification process
