# Monday.com → Slack Task Automation v2.0

[![CI/CD](https://github.com/usvsthem-notdev/monday-slack-automation/actions/workflows/monday-slack-sync.yml/badge.svg)](https://github.com/usvsthem-notdev/monday-slack-automation/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automatically sync incomplete tasks from Monday.com to individual Slack DMs daily, with interactive buttons to update tasks directly from Slack.

## 🚀 What's New in v2.0

### Performance Optimizations
- **3x Faster Processing**: Batch processing and parallel API calls
- **Reduced API Calls**: Optimized GraphQL queries with fragments
- **Automatic Retry Logic**: Exponential backoff for failed requests
- **Rate Limiting**: Built-in rate limiting to prevent API throttling

### Improved Reliability
- **Comprehensive Error Handling**: Graceful error recovery
- **Input Validation**: Secure validation for all user inputs
- **Message Store Cleanup**: Automatic cleanup of old messages
- **Metrics & Monitoring**: Track performance and error rates

### Enhanced Testing
- **Unit Tests**: 90%+ code coverage
- **Validation Scripts**: Pre-flight environment checks
- **Structured Logging**: JSON-formatted logs for better debugging

### Better Configuration
- **Centralized Config**: All settings in one place
- **Environment Validation**: Automatic validation on startup
- **Flexible Settings**: Configurable batch sizes, rate limits, and retries

## 🎯 Features

- **Daily Updates**: Automatic sync at 8 AM ET (configurable)
- **Smart Organization**: Tasks categorized as Overdue, Due Today, and Upcoming
- **Interactive Buttons**: Complete, Update, Postpone, or View tasks from Slack
- **User-Specific**: Each user gets their personalized task list
- **Message Deduplication**: Updates existing messages instead of sending new ones
- **Test Mode**: Test with a single user before full deployment

## 📋 Prerequisites

- Node.js v18.0.0 or higher
- Monday.com API key
- Slack Bot Token and App configured
- GitHub account (for Actions deployment)
- Optional: Render account for interactive server

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/usvsthem-notdev/monday-slack-automation.git
cd monday-slack-automation
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Required
MONDAY_API_KEY=your_monday_api_key
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token

# Optional (for interactive server)
SLACK_SIGNING_SECRET=your_slack_signing_secret

# Configuration (optional, these are defaults)
WORKSPACE_IDS=12742680,12691809,12666498
RATE_LIMIT_MS=500
MAX_RETRIES=3
TEST_MODE=false
```

### 3. Validate Configuration

```bash
npm run validate
```

### 4. Run Tests

```bash
npm test
```

### 5. Test Locally

```bash
# Test with single user
TEST_MODE=true npm start

# Run full automation
npm start
```

## 📅 Deployment Options

### Option 1: GitHub Actions (Recommended)

1. Fork this repository
2. Add secrets to your GitHub repository:
   - Go to Settings → Secrets and variables → Actions
   - Add `MONDAY_API_KEY` and `SLACK_BOT_TOKEN`
3. The automation runs daily at 8 AM ET automatically
4. Manual trigger: Actions tab → "Monday.com to Slack Task Sync" → Run workflow

### Option 2: Interactive Server (Render)

1. Deploy to Render using the `render.yaml` file
2. Set environment variables in Render dashboard
3. Run `npm run server` for interactive button support

### Option 3: Custom Deployment

- **Docker**: Use the provided Dockerfile (coming soon)
- **AWS Lambda**: Deploy as serverless function
- **Heroku**: Deploy with Heroku Scheduler
- **Cron Job**: Run on any Linux server

## 🛠️ Configuration

All configuration is centralized in `src/config.js`. Key settings:

| Variable | Description | Default |
|----------|-------------|------|
| `WORKSPACE_IDS` | Comma-separated Monday.com workspace IDs | `12742680,12691809,12666498` |
| `RATE_LIMIT_MS` | Milliseconds between API calls | `500` |
| `MAX_RETRIES` | Maximum retry attempts for failed requests | `3` |
| `BATCH_SIZE` | Number of concurrent API calls | `5` |
| `MESSAGE_RETENTION_DAYS` | Days to keep message history | `7` |
| `MAX_TASKS_PER_SECTION` | Maximum tasks shown per category | `5` |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Validate environment
npm run validate
```

## 📊 Monitoring & Metrics

The automation tracks and saves metrics including:

- Users processed/skipped
- Tasks found and messages sent
- API call success/failure rates
- Average processing time
- Error rates and thresholds

Metrics are saved to `./metrics/` directory and logs to `./logs/`.

## 🔧 API Usage

### Monday.com API

- Uses GraphQL API v2
- Implements query fragments for efficiency
- Rate-limited to prevent throttling
- Automatic retry with exponential backoff

### Slack API

- Uses Bolt framework for interactions
- Web API for message sending
- Supports interactive components
- Handles user lookup gracefully

## 🐛 Troubleshooting

### Common Issues

1. **"User not found in Slack"**
   - Ensure the user's email in Monday.com matches their Slack email
   - Check that the Slack bot has permissions to message users

2. **Rate limiting errors**
   - Increase `RATE_LIMIT_MS` in configuration
   - Reduce `BATCH_SIZE` for fewer concurrent requests

3. **Missing tasks**
   - Verify workspace IDs are correct
   - Check that boards have status and people columns
   - Ensure users are properly assigned to tasks

4. **Authentication failures**
   - Regenerate API keys if expired
   - Verify bot has required Slack scopes

### Debug Mode

```bash
LOG_LEVEL=debug npm start
```

## 📝 Project Structure

```
monday-slack-automation/
├── src/
│   ├── automation.js          # Original automation script
│   ├── automation-optimized.js # Optimized v2.0 script
│   ├── server.js              # Interactive Slack server
│   ├── config.js              # Centralized configuration
│   ├── utils/
│   │   ├── logger.js          # Structured logging
│   │   ├── retry.js           # Retry and batch utilities
│   │   ├── validation.js      # Input validation
│   │   ├── date-utils.js      # Date manipulation
│   │   └── validate-env.js    # Environment validation
│   └── __tests__/             # Unit tests
├── .github/
│   └── workflows/
│       └── monday-slack-sync.yml
├── logs/                      # Application logs
├── metrics/                   # Performance metrics
├── data/                      # Message store
└── package.json
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 💰 Cost

- **GitHub Actions**: Free (2,000 minutes/month)
- **Render**: Free tier available, $7/month for always-on
- **Monday.com API**: Included with your Monday.com plan
- **Slack API**: Free

## 🔐 Security

- Never commit `.env` files
- Use GitHub Secrets for sensitive data
- Validate all user inputs
- Implement webhook signature verification
- Regular dependency updates

## 📚 Documentation

- [Monday.com API Documentation](https://developer.monday.com/api-reference/docs)
- [Slack Bolt Documentation](https://slack.dev/bolt-js)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## 👏 Acknowledgments

Built with ❤️ for productivity by Connor Drexler

## 📮 Support

For issues or questions:
1. Check the [Troubleshooting](#-troubleshooting) section
2. Search [existing issues](https://github.com/usvsthem-notdev/monday-slack-automation/issues)
3. Create a new issue with:
   - Error messages
   - Environment details
   - Steps to reproduce

---

**v2.0.0** | Last Updated: October 2025