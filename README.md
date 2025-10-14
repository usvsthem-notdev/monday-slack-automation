# Monday.com → Slack Automation

⚡️ **Automated task synchronization between Monday.com and Slack with real-time notifications**

## 🌟 Features

### 📨 Scheduled Daily Digest
- **Automated daily task summaries** sent to Slack at 9 AM EST (weekdays)
- Tasks organized by priority: Overdue, Due Today, Upcoming This Week
- Beautiful formatted messages with task details and quick actions
- Updates existing messages instead of creating new ones

### 🔔 **NEW: Real-Time Task Assignment Notifications**
- **Instant Slack notifications** when users are assigned to tasks
- Smart detection of newly assigned users (won't spam existing assignees)
- Rich notifications with task details, due dates, and status
- Interactive action buttons: Mark Complete, Update Task, Open in Monday
- See [Feature Documentation](docs/FEATURE_TASK_NOTIFICATIONS.md) for details

### 🤖 Slack Commands
- `/tasks` - View your current tasks
- `/create-task` - Create a new task in Monday.com
- `/quick-task` - Quickly add a task with minimal details
- `/task-complete [name]` - Mark a task as complete
- `/monday-help` - Get help with available commands

### ✨ Interactive Features
- **One-click task actions** directly from Slack messages
- Mark tasks complete without leaving Slack
- Postpone due dates with a single click
- Update task status, dates, and add notes via modals
- View detailed task information inline

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm 10+
- Monday.com account with API access
- Slack workspace with bot permissions
- Render account (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/usvsthem-notdev/monday-slack-automation.git
   cd monday-slack-automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials:
   ```bash
   MONDAY_API_KEY=your_monday_api_key
   SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
   SLACK_SIGNING_SECRET=your_slack_signing_secret
   PORT=3000
   ```

4. **Run locally**
   ```bash
   npm start
   ```

## 🔧 Setup Guide

### 1. Monday.com Setup

1. Go to [Monday.com Developers](https://monday.com/developers)
2. Create a new app or use existing
3. Generate an API token with these scopes:
   - `boards:read`
   - `boards:write`
   - `users:read`
4. Copy the API token to your `.env` file

### 2. Slack Setup

1. Go to [Slack API](https://api.slack.com/apps)
2. Create a new app or select existing
3. Add the following Bot Token Scopes:
   - `chat:write`
   - `im:write`
   - `users:read`
   - `users:read.email`
   - `commands`
4. Install the app to your workspace
5. Copy the Bot Token and Signing Secret to `.env`

### 3. Webhook Setup (For Real-Time Notifications)

**Important**: Set up webhooks after deploying your server to Render (so it's publicly accessible).

Follow the comprehensive [Webhook Setup Guide](docs/WEBHOOK_SETUP.md) to:
- Configure Monday.com webhooks
- Point them to your server's webhook endpoint
- Test the integration
- Monitor webhook events

**Quick Setup**:
1. Deploy to Render (see deployment section below)
2. Get your webhook URL: `https://your-app.onrender.com/webhook/monday`
3. In Monday.com, create a webhook:
   - Event: `change_column_value`
   - URL: Your webhook endpoint
   - Boards: Select boards to monitor

### 4. Deployment to Render

1. **Connect Repository**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - Name: `monday-slack-automation`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Choose based on your needs

3. **Set Environment Variables**
   Add all variables from your `.env` file:
   - `MONDAY_API_KEY`
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
   - `PORT` (Render will auto-assign, but you can set 10000)

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL (e.g., `https://monday-slack-automation-xyz.onrender.com`)

5. **Configure Webhooks** (After Deployment)
   - Use your Render URL to set up Monday.com webhooks
   - Test the webhook endpoint
   - Monitor logs for webhook events

## 📚 Documentation

- **[Webhook Setup Guide](docs/WEBHOOK_SETUP.md)** - Complete guide for setting up Monday.com webhooks
- **[Task Notifications Feature](docs/FEATURE_TASK_NOTIFICATIONS.md)** - How real-time notifications work
- **[Deployment Report](DEPLOYMENT_REPORT.md)** - Production deployment details
- **[Configuration Status](RENDER_CONFIG_STATUS.md)** - Current configuration state

## 🧪 Testing

### Run Tests
```bash
# Test automation
node tests/automation.test.js

# Test webhook handler
node tests/webhook.test.js
```

### Manual Testing

**Test Webhook Endpoint**:
```bash
curl -X POST https://your-server.com/webhook/monday \
  -H "Content-Type: application/json" \
  -d '{"challenge":"test_challenge"}'
```

**Test Health Endpoint**:
```bash
curl https://your-server.com/health
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service status and info |
| `/health` | GET | Health check |
| `/metrics` | GET | Service metrics |
| `/trigger` | POST | Manual automation trigger |
| `/slack/events` | POST | Slack events endpoint |
| `/webhook/monday` | POST | **Monday.com webhook endpoint** |

## 🔍 Monitoring

### Check Server Status
```bash
curl https://your-server.onrender.com/health
```

### View Metrics
```bash
curl https://your-server.onrender.com/metrics
```

### View Logs (Render)
1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab
4. Filter by log level (info, error, success)

### Key Metrics
- Users processed
- Tasks found
- Messages sent/updated
- Webhook events received
- Notifications delivered
- Errors encountered

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONDAY_API_KEY` | Yes | Monday.com API token |
| `SLACK_BOT_TOKEN` | Yes | Slack bot token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | Yes | Slack signing secret |
| `PORT` | No | Server port (default: 3000) |
| `TEST_MODE` | No | Enable test mode (true/false) |

### Customization

**Modify workspaces** (in `src/automation.js`):
```javascript
const workspaceIds = [12742680, 12691809, 12666498];
```

**Change schedule** (in `.github/workflows/scheduled-trigger.yml`):
```yaml
schedule:
  - cron: '0 14 * * 1-5'  # 9 AM EST weekdays
```

**Customize notification format** (in `src/webhookHandler.js`):
```javascript
function formatTaskNotification(task, assignedUserName) {
  // Modify message blocks here
}
```

## 🐛 Troubleshooting

### Common Issues

**Issue**: Webhook not receiving events
- **Solution**: Verify server is publicly accessible and webhook URL is correct
- **Check**: `curl https://your-server.com/health` should return 200

**Issue**: Notifications not sending to Slack
- **Solution**: Ensure user's Monday.com email matches their Slack email
- **Check**: Server logs for "Slack user not found" errors

**Issue**: Task assignment detected but no notification
- **Solution**: Verify the column type is `multiple-person`
- **Check**: Review webhook event in server logs

**Issue**: Scheduled automation not running
- **Solution**: Check GitHub Actions workflow is enabled
- **Check**: Verify cron schedule and time zone

### Debug Mode

Enable detailed logging:
```javascript
// In src/automation.js
const TEST_MODE = true;
```

This will:
- Limit automation to test user only
- Add verbose logging
- Show detailed error messages

## 🛡️ Security

- All API keys stored as environment variables
- HTTPS enforced for all endpoints
- Slack signing secret verification
- Monday.com webhook challenge verification
- Rate limiting recommended for production
- No sensitive data in logs

## 📊 Architecture

```
┌───────────────────────┐
│   GitHub Actions      │
│   (Scheduled Trigger) │
└───────┬───────────────┘
        │
        ↓ POST /trigger
┌───────┴──────────────────────┐
│   Render Web Service         │
│                              │
│  ┌────────────────────────┐ │
│  │  Express Server        │ │
│  │  - Slack Bolt App      │ │
│  │  - Webhook Handler     │ │
│  │  - Automation Logic    │ │
│  └────────────────────────┘ │
└──────┬──────────┬────────────┘
       │          │
       ↓          ↓
  ┌─────────┐  ┌──────────────┐
  │ Monday  │  │    Slack     │
  │   API   │  │     API      │
  └─────────┘  └──────────────┘
       ↑              ↓
       │              │
       └──Webhooks────┘
```

### Component Flow

**Scheduled Automation**:
1. GitHub Actions triggers at 9 AM EST
2. Makes POST request to `/trigger`
3. Server fetches all boards and users
4. Processes tasks for each user
5. Sends/updates Slack messages

**Real-Time Notifications**:
1. User assigned to task in Monday.com
2. Monday.com sends webhook to `/webhook/monday`
3. Server validates and processes event
4. Fetches task and user details
5. Sends immediate Slack notification

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Connor Drexler**
- GitHub: [@usvsthem-notdev](https://github.com/usvsthem-notdev)

## 🙏 Acknowledgments

- Monday.com API Documentation
- Slack Bolt SDK
- Render Platform
- Open source community

## 📮 Support

For support, questions, or feature requests:
- Open an issue on GitHub
- Check existing documentation
- Review server logs for debugging

---

**Version**: 4.1.0  
**Last Updated**: October 2025  
**Status**: ✅ Production Ready
