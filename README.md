# Monday.com → Slack Automation

⚡️ **Modern Slack automation with interactive commands, real-time webhooks, and seamless task management**

## 🌟 Features

### 🤖 **Interactive Slack Commands**
- `/create-task` - Full-featured task creation with assignees, due dates, and status
- `/quick-task` - Rapidly create tasks with minimal details
- `/tasks` - View your current tasks organized by priority
- `/monday-help` - Get help with available commands
- `/task-complete` - Mark tasks as complete
- **Ultra-fast response** - All commands respond within 3 seconds

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

### 📊 **Daily Task Management**
- Automated daily task summaries (optional)
- Tasks organized by priority: Overdue, Due Today, Upcoming This Week
- Updates existing messages instead of creating spam

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

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL (e.g., `https://monday-slack-automation-xyz.onrender.com`)

5. **Configure Slack Commands** (After Deployment)
   - Update all slash command URLs to point to your Render URL
   - Test each command to ensure they work

## 🧪 Testing

### Manual Testing

**Test Slack Commands**:
- Try `/create-task` in any Slack channel
- Should respond with loading message then open modal

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

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service status and info |
| `/health` | GET | Health check |
| `/slack/events` | POST | Slack events and commands |
| `/webhook/monday` | POST | Monday.com webhook endpoint |

## 🏗️ Architecture (v5.0.0)

```
┌─────────────────────┐
│   Slack Workspace   │
│                     │
│  /create-task  ────┐│
│  /quick-task   ────┤│
│  /tasks        ────┤│
│  /monday-help  ────┤│
│  /task-complete────┤│
│                    ││
│  Interactive   ────┤│
│  Components    ────┘│
└─────────────────────┘
         │
         ↓ HTTPS
┌─────────────────────────────┐
│     Render Web Service      │
│                             │
│  ┌───────────────────────┐ │
│  │   src/server.js       │ │
│  │   (Main Slack App)    │ │
│  │                       │ │
│  │  ├─ Commands Handler  │ │
│  │  ├─ Interactive Comps │ │
│  │  ├─ Webhook Handler   │ │
│  │  └─ Express Receiver  │ │
│  └───────────────────────┘ │
│                             │
│  ┌───────────────────────┐ │
│  │   Module Imports:     │ │
│  │  ├─ slackCommands.js  │ │
│  │  ├─ tasksCommand.js   │ │
│  │  └─ webhookHandler.js │ │
│  └───────────────────────┘ │
└─────────┬─────────┬─────────┘
          │         │
          ↓         ↓
    ┌─────────┐ ┌──────────┐
    │ Monday  │ │  Slack   │
    │   API   │ │   API    │
    └─────────┘ └──────────┘
         ↑
         │ Webhooks
         └─────────┘
```

### Component Flow

**Slash Commands**:
1. User types `/create-task` in Slack
2. Slack sends request to `/slack/events`
3. Server acknowledges immediately (< 1ms)
4. Background processing fetches boards/users
5. Modal opens with task creation form

**Real-Time Notifications**:
1. User assigned to task in Monday.com
2. Monday.com sends webhook to `/webhook/monday`
3. Server processes event and sends notification
4. User receives Slack message with action buttons

**Interactive Actions**:
1. User clicks "Mark Complete" button
2. Server processes action in background
3. Task updated in Monday.com
4. User receives confirmation

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONDAY_API_KEY` | Yes | Monday.com API token |
| `SLACK_BOT_TOKEN` | Yes | Slack bot token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | Yes | Slack signing secret |
| `PORT` | No | Server port (default: 3000) |

### Customization

**Modify workspaces** (in `src/tasksCommand.js`):
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
- **Solution**: Ensure all commands use ultra-fast ACK pattern
- **Check**: Server logs for timeout errors

**Issue**: Modal not opening
- **Solution**: Verify `trigger_id` is valid and used within 3 seconds
- **Check**: Network connectivity and API responses

**Issue**: Webhook not receiving events
- **Solution**: Verify server is publicly accessible
- **Check**: `curl https://your-server.com/health` should return 200

**Issue**: Notifications not sending to Slack
- **Solution**: Ensure user's Monday.com email matches Slack email
- **Check**: Server logs for "Slack user not found" errors

### Debug Commands

**Check server status**:
```bash
curl https://your-server.com/
```

**Test webhook manually**:
```bash
curl -X POST https://your-server.com/webhook/monday \
  -H "Content-Type: application/json" \
  -d '{"challenge":"test_challenge"}'
```

## 📊 Migration from v4.x.x

If upgrading from an older version, see [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for:
- Architecture changes
- Breaking changes
- Migration steps
- Legacy code handling

## 🛡️ Security

- All API keys stored as environment variables
- HTTPS enforced for all endpoints
- Slack signing secret verification
- Monday.com webhook challenge verification
- No sensitive data in logs
- Ultra-fast ACK patterns prevent timeout attacks

## 📚 File Structure

```
monday-slack-automation/
├── src/
│   ├── server.js           # Main Slack app (ACTIVE)
│   ├── slackCommands.js    # Command definitions
│   ├── tasksCommand.js     # Tasks command logic
│   ├── webhookHandler.js   # Webhook processing
│   └── messageFormatter.js # Message formatting
├── legacy/
│   ├── automation.js       # Old automation app (ARCHIVED)
│   └── README.md          # Legacy code explanation
├── docs/                   # Documentation
├── tests/                  # Test files
├── package.json           # Points to src/server.js
├── MIGRATION_GUIDE.md     # v5.0.0 migration guide
└── README.md              # This file
```

## 🚀 Available Scripts

```bash
# Start main server (recommended)
npm start

# Development mode
npm run dev

# Run legacy automation (not recommended)
npm run legacy

# Run tests
npm test
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

**Version**: 5.0.0  
**Last Updated**: October 17, 2025  
**Status**: ✅ Production Ready - Clean Architecture
