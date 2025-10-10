# 📋 Monday.com → Slack Task Automation

**v3.0** - Automated task syncing from Monday.com to Slack with interactive buttons and slash commands.

## ✨ Features

- 🔄 **Automated Daily Sync** - Tasks synced to Slack DMs every day at 8 AM ET
- 🎯 **Interactive Buttons** - Complete, Update, Postpone, or View tasks directly from Slack
- ⚡ **Slash Command** - `/tasks` to fetch your latest tasks on-demand
- 📊 **Smart Organization** - Tasks categorized as Overdue, Due Today, or Upcoming
- 🔔 **Message Updates** - Updates existing messages instead of spamming new ones
- 🚀 **Render-Ready** - Web service that stays alive with health checks

## 🎯 How It Works

1. **Automated Sync**: Runs daily at 8 AM ET (configurable in GitHub Actions)
2. **On-Demand**: Users can type `/tasks` in Slack anytime
3. **Interactive**: Click buttons on tasks to take action
4. **Smart Updates**: Updates the same message throughout the day

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Monday.com API key
- Slack Bot with permissions
- Render account (or any hosting platform)

### 1. Clone Repository

```bash
git clone https://github.com/usvsthem-notdev/monday-slack-automation.git
cd monday-slack-automation
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
MONDAY_API_KEY=your_monday_api_key
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
PORT=10000
TEST_MODE=false
```

### 3. Set Up Slack App

#### A. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it "Monday Tasks" and select your workspace

#### B. Configure Bot Permissions

Go to **OAuth & Permissions** and add these scopes:

- `chat:write`
- `users:read`
- `users:read.email`
- `im:write`
- `commands`

#### C. Enable Interactive Components

1. Go to **Interactivity & Shortcuts**
2. Turn on **Interactivity**
3. Set **Request URL** to: `https://your-app.onrender.com/slack/events`
4. Save Changes

#### D. Create Slash Command

1. Go to **Slash Commands**
2. Click **Create New Command**
3. Set:
   - **Command**: `/tasks`
   - **Request URL**: `https://your-app.onrender.com/slack/events`
   - **Short Description**: "Fetch my Monday.com tasks"
4. Save

#### E. Install App to Workspace

1. Go to **OAuth & Permissions**
2. Click **Install to Workspace**
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

#### F. Get Signing Secret

1. Go to **Basic Information**
2. Under **App Credentials**, copy the **Signing Secret**

### 4. Get Monday.com API Key

1. Go to your Monday.com account
2. Click your profile picture → **Admin** → **API**
3. Generate a new API token
4. Copy the token

### 5. Deploy to Render

#### A. Create Web Service

1. Go to [render.com](https://render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `monday-slack-automation`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or higher)

#### B. Add Environment Variables

In Render dashboard, add:

- `MONDAY_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `PORT` = `10000`
- `TEST_MODE` = `false`

#### C. Deploy

1. Click **Create Web Service**
2. Wait for deployment to complete
3. Copy your Render URL (e.g., `https://your-app.onrender.com`)

#### D. Update Slack URLs

Go back to your Slack app settings and update:

- **Interactivity Request URL**: `https://your-app.onrender.com/slack/events`
- **Slash Command Request URL**: `https://your-app.onrender.com/slack/events`

### 6. Test It Out!

1. Go to any Slack channel
2. Type `/tasks`
3. Check your DMs for your task list with interactive buttons!

## 🎮 Usage

### Slash Command

```
/tasks
```

Instantly fetches your latest Monday.com tasks and sends them to your DM.

### Interactive Buttons

Each task has buttons:

- **✓ Complete** - Mark task as done
- **✏️ Update** - Update task details
- **📅 +1 Day** - Postpone by one day
- **View** - Open task in Monday.com

### Manual Trigger (HTTP)

```bash
curl -X POST https://your-app.onrender.com/trigger
```

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and status |
| `/health` | GET | Health check with metrics |
| `/metrics` | GET | Detailed runtime metrics |
| `/trigger` | POST | Manually trigger automation |
| `/slack/events` | POST | Slack events (buttons & commands) |

## 🔧 Configuration

### Workspace IDs

Edit `src/automation.js` line ~209 to customize workspace IDs:

```javascript
const workspaceIds = [12742680, 12691809, 12666498];
```

### Schedule

Edit `.github/workflows/monday-slack-sync.yml` to change schedule:

```yaml
schedule:
  - cron: '0 12 * * *'  # Daily at 8 AM ET (12 PM UTC)
```

### Test Mode

Set `TEST_MODE=true` to only process Connor Drexler (user ID: 89455577).

## 🏗️ Architecture

```
┌─────────────┐
│  Monday.com │
└──────┬──────┘
       │
       │ GraphQL API
       ▼
┌─────────────────────────────┐
│   automation.js (Node.js)   │
│  - Slack Bolt Server        │
│  - Express HTTP Server      │
│  - Task Automation Logic    │
└──────┬─────────────────┬────┘
       │                 │
       │ Slack API       │ HTTP
       ▼                 ▼
┌──────────┐      ┌─────────────┐
│  Slack   │      │   Render    │
│  Users   │      │  Platform   │
└──────────┘      └─────────────┘
```

## 🐛 Troubleshooting

### Buttons Not Working

- ✅ Verify `SLACK_SIGNING_SECRET` is set
- ✅ Check Interactivity URL in Slack app settings
- ✅ Ensure URL ends with `/slack/events`

### `/tasks` Command Not Found

- ✅ Verify slash command is created in Slack app
- ✅ Check Request URL points to your Render deployment
- ✅ Reinstall app to workspace if needed

### Tasks Not Syncing

- ✅ Check Render logs for errors
- ✅ Verify Monday.com API key is valid
- ✅ Ensure workspace IDs are correct
- ✅ Check GitHub Actions are running

### User Not Found

- ✅ Verify user's Slack email matches Monday.com email
- ✅ Check user is not a guest in Monday.com
- ✅ Ensure user is enabled in Monday.com

## 📝 Development

### Run Locally

```bash
npm start
```

### Test Endpoints

```bash
# Health check
curl http://localhost:10000/health

# Trigger automation
curl -X POST http://localhost:10000/trigger

# Get metrics
curl http://localhost:10000/metrics
```

### Enable Debug Mode

Set `TEST_MODE=true` in `.env` to only process one user.

## 🔐 Security

- ✅ Never commit `.env` file
- ✅ Use environment variables for all secrets
- ✅ Slack signing secret validates all requests
- ✅ API keys stored securely in Render

## 📦 Dependencies

- `@slack/bolt` - Slack app framework
- `@slack/web-api` - Slack Web API client
- `axios` - HTTP client for Monday.com
- `express` - Web server
- `dotenv` - Environment configuration

## 🚀 Deployment Checklist

- [ ] Create Slack app with required scopes
- [ ] Enable interactivity and slash commands
- [ ] Get Monday.com API key
- [ ] Deploy to Render
- [ ] Add environment variables to Render
- [ ] Update Slack app URLs with Render URL
- [ ] Test `/tasks` command
- [ ] Test interactive buttons
- [ ] Verify GitHub Actions schedule

## 📄 License

MIT License - See LICENSE file for details

## 👨‍💻 Author

Connor Drexler - [usvsthem-notdev](https://github.com/usvsthem-notdev)

## 🙏 Support

For issues or questions:
1. Check the troubleshooting section
2. Open a GitHub issue
3. Review Render logs at `https://dashboard.render.com`

---

**Made with ❤️ for the Drexcorp team**