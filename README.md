# Monday.com ↔ Slack Unified Automation

⚡️ **Production-ready Slack automation with async processing, real-time webhooks, and comprehensive task management**

## 🌟 Version 6.0 - Unified Architecture

### ✨ What's New in v6.0

- 🚀 **Asynchronous Request Processing** - All Slack commands respond instantly
- 🔄 **Background Job Queue** - Heavy operations processed without blocking
- 🎯 **Unified Codebase** - All services consolidated into one server
- 📊 **Enhanced Monitoring** - Real-time queue stats and metrics
- ⚡ **No More Timeouts** - Guaranteed fast responses to Slack
- 🛠️ **Easier Maintenance** - Single deployment, consistent logging

## 🌟 Core Features

### 🤖 **Interactive Slack Commands**

All commands respond **instantly** with background processing:

- `/create-task` - Full-featured task creation with assignees, due dates, and status
- `/quick-task` - Rapidly create tasks with minimal details
- `/tasks` - View your current tasks organized by priority
- `/monday-help` - Get help with available commands
- `/task-complete` - Mark tasks as complete
- **Ultra-fast response** - All commands acknowledge within milliseconds

### 🔔 **Real-Time Task Notifications**

- **Instant Slack notifications** when users are assigned to tasks
- Smart detection of newly assigned users (won't spam existing assignees)
- Rich notifications with task details, due dates, and status
- Interactive action buttons: Mark Complete, Update Task, Postpone, View Details

### ✨ **Interactive Components**

- **One-click task actions** directly from Slack messages
- Mark tasks complete without leaving Slack
- Postpone due dates with a single click
- Update task status, dates, and add notes via modals
- View detailed task information inline

### 📊 **Daily Task Automation**

- Automated daily task summaries (trigger via API endpoint)
- Tasks organized by priority: Overdue, Due Today, Upcoming This Week
- Updates existing messages instead of creating spam
- Configurable workspace filtering

### 🔄 **Background Processing**

- **Async Job Queue** - Process requests in the background
- **Immediate Feedback** - Users see "Processing..." instantly
- **No Blocking** - Server never waits for long operations
- **Queue Monitoring** - Track queue length and processing status

## 🏗️ Architecture (v6.0.0)

```
┌─────────────────────┐
│   Slack Workspace   │
│                     │
│  /create-task  ────┐│
│  /quick-task   ────┤│
│  /tasks        ────┤│   Instant ACK
│  /monday-help  ────┤│   (< 1ms)
│  /task-complete────┤│     │
│                    ││     │
│  Interactive   ────┤│     │
│  Components    ────┘│     │
└──────────┬──────────┘     │
           │                │
           ↓ HTTPS          ↓
┌──────────────────────────────────┐
│    Unified Server (v6.0)         │
│  ┌────────────────────────────┐  │
│  │   Express Receiver         │←─┤
│  │   + Slack Bolt App         │  │
│  └─────────┬──────────────────┘  │
│            │                      │
│  ┌─────────▼──────────────────┐  │
│  │   Async Job Queue          │  │
│  │  ┌──────────────────────┐  │  │
│  │  │ Button Actions       │  │  │
│  │  │ Modal Submissions    │  │  │
│  │  │ Daily Automation     │  │  │
│  │  │ Heavy Operations     │  │  │
│  │  └──────────────────────┘  │  │
│  └────────────────────────────┘  │
│                                   │
│  Features:                        │
│  • Slack Commands                 │
│  • Interactive Components         │
│  • Webhook Handler                │
│  • Daily Task Automation          │
│  • Background Processing          │
└───────┬───────────┬───────────────┘
        │           │
        ↓           ↓
  ┌─────────┐ ┌──────────┐
  │ Monday  │ │  Slack   │
  │   API   │ │   API    │
  └─────────┘ └──────────┘
       ↑
       │ Webhooks
       └─────────┘
```

### Request Flow: Async Processing

```
User types /tasks in Slack
        │
        ↓
Slack sends request
        │
        ↓
Server ACKs immediately (< 1ms)
        │
        ├─→ Return "Processing..." to user
        │
        └─→ Add task to queue
                │
                ↓
        Queue processes in background
                │
                ├─→ Fetch boards from Monday.com
                ├─→ Get user tasks
                ├─→ Organize by priority
                └─→ Send formatted message
                        │
                        ↓
                User sees complete task list
```

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
   TEST_MODE=false  # Set to true for single-user testing
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
4. **Add Slash Commands**:
   - `/create-task` → `https://your-server.com/slack/events`
   - `/quick-task` → `https://your-server.com/slack/events`
   - `/tasks` → `https://your-server.com/slack/events`
   - `/monday-help` → `https://your-server.com/slack/events`
   - `/task-complete` → `https://your-server.com/slack/events`
5. **Enable Interactive Components**:
   - Request URL: `https://your-server.com/slack/events`
6. Install the app to your workspace
7. Copy the Bot Token and Signing Secret to `.env`

### 3. Webhook Setup (For Real-Time Notifications)

**Important**: Set up webhooks after deploying your server to Render.

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
   - `PORT` (Render will auto-assign, but you can set 3000)
   - `TEST_MODE` (false for production)

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL (e.g., `https://monday-slack-automation-xyz.onrender.com`)

5. **Configure Slack Commands** (After Deployment)
   - Update all slash command URLs to point to your Render URL
   - Test each command to ensure they work

6. **Set Up Daily Automation** (Optional)
   - In Render, add a Cron Job
   - Schedule: `0 9 * * *` (9 AM daily)
   - Command: `curl -X POST https://your-app.onrender.com/trigger`

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and status |
| `/health` | GET | Health check + queue status |
| `/metrics` | GET | Detailed metrics + queue stats |
| `/slack/events` | POST | Slack events and commands |
| `/webhook/monday` | POST | Monday.com webhook endpoint |
| `/trigger` | POST | Trigger daily automation |

### Queue Status Monitoring

```bash
# Check health and queue status
curl https://your-server.com/health

# Response includes:
{
  "status": "ok",
  "queueLength": 0,
  "queueProcessing": false,
  "metrics": {
    "commandsProcessed": 150,
    "asyncTasksQueued": 45,
    "webhooksReceived": 23
  }
}
```

## 🧪 Testing

### Manual Testing

**Test Slack Commands**:
- Try `/create-task` in any Slack channel
- Should respond with "Processing..." then open modal

**Test Health Endpoint**:
```bash
curl https://your-server.com/health
```

**Test Webhook Endpoint**:
```bash
curl -X POST https://your-server.com/webhook/monday \
  -H "Content-Type: application/json" \
  -d '{"challenge":"test_challenge"}'
```

**Test Daily Automation**:
```bash
curl -X POST https://your-server.com/trigger
```

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONDAY_API_KEY` | Yes | Monday.com API token |
| `SLACK_BOT_TOKEN` | Yes | Slack bot token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | Yes | Slack signing secret |
| `PORT` | No | Server port (default: 3000) |
| `TEST_MODE` | No | Enable single-user testing (default: false) |

### Customization

**Modify workspaces** (in `src/unified-server.js`):
```javascript
const workspaceIds = [12742680, 12691809, 12666498];
```

**Customize notification format** (in `src/webhookHandler.js`):
```javascript
function formatTaskNotification(task, assignedUserName) {
  // Modify message blocks here
}
```

## 🐛 Troubleshooting

### Common Issues

**Issue**: Commands timing out
- **Solution**: Check queue status at `/health` endpoint
- **Check**: Server logs for queue processing

**Issue**: Queue backing up
- **Solution**: Monitor queue length in metrics
- **Check**: If queue length > 10, investigate slow operations

**Issue**: Modal not opening
- **Solution**: Verify `trigger_id` is valid and used within 3 seconds
- **Check**: Network connectivity and API responses

**Issue**: Webhook not receiving events
- **Solution**: Verify server is publicly accessible
- **Check**: `curl https://your-server.com/health` should return 200

**Issue**: Notifications not sending to Slack
- **Solution**: Ensure user's Monday.com email matches Slack email
- **Check**: Server logs for "Slack user not found" errors

**Issue**: Daily automation not running
- **Solution**: Manually trigger via `/trigger` endpoint
- **Check**: Verify cron job is configured correctly

## 📊 Monitoring

### Key Metrics

```javascript
{
  "commandsProcessed": 0,      // Slack commands received
  "asyncTasksQueued": 0,        // Tasks added to background queue
  "webhooksReceived": 0,        // Webhooks from Monday.com
  "notificationsSent": 0,       // Notifications sent to Slack
  "messagesUpdated": 0,         // Daily messages updated
  "messagesSent": 0,            // Daily messages sent
  "usersProcessed": 0,          // Users processed in daily automation
  "tasksFound": 0,              // Tasks found across all boards
  "errors": 0,                  // Total errors encountered
  "queueLength": 0,             // Current queue length
  "queueProcessing": false      // Is queue currently processing
}
```

### Health Checks

```bash
# Basic health check
curl https://your-server.com/health

# Detailed metrics
curl https://your-server.com/metrics

# Check queue status
curl https://your-server.com/metrics | jq '.queueStats'
```

## 📚 Migration from Previous Versions

See [UNIFIED_MIGRATION_GUIDE.md](UNIFIED_MIGRATION_GUIDE.md) for detailed migration instructions from v5.x to v6.0.

## 🛡️ Security

- All API keys stored as environment variables
- HTTPS enforced for all endpoints
- Slack signing secret verification
- Monday.com webhook challenge verification
- No sensitive data in logs
- Ultra-fast ACK patterns prevent timeout attacks
- Background queue protects against resource exhaustion

## 📚 File Structure

```
monday-slack-automation/
├── src/
│   ├── unified-server.js      # Main server (ACTIVE - v6.0)
│   ├── slackCommands.js       # Command definitions
│   ├── tasksCommand.js        # Tasks command logic
│   ├── webhookHandler.js      # Webhook processing
│   ├── messageFormatter.js    # Message formatting
│   ├── server.js              # Legacy Slack commands (deprecated)
│   └── automation.js          # Legacy daily tasks (deprecated)
├── legacy/                     # Archived old code
├── docs/                       # Documentation
├── tests/                      # Test files
├── package.json               # Points to unified-server.js
├── UNIFIED_MIGRATION_GUIDE.md # v6.0 migration guide
└── README.md                  # This file
```

## 🚀 Available Scripts

```bash
# Start unified server (recommended)
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test

# Run legacy Slack commands server (deprecated)
npm run legacy-server

# Run legacy daily automation (deprecated)
npm run legacy-automation
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code patterns
4. Test your changes thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

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

---

**Version**: 6.0.0-unified  
**Last Updated**: October 22, 2025  
**Status**: ✅ Production Ready - Unified Architecture with Async Processing
