// Test environment setup
process.env.MONDAY_API_KEY = 'test-monday-api-key';
process.env.SLACK_BOT_TOKEN = 'xoxb-test-slack-bot-token';
process.env.SLACK_SIGNING_SECRET = 'test-slack-signing-secret';
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.ALERT_WEBHOOK_URL = '';

// Silence console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  };
}
