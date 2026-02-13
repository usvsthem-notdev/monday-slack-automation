// Mock Slack API client and helpers

function createMockSlackClient(overrides = {}) {
  return {
    users: {
      info: jest.fn().mockResolvedValue({
        user: {
          id: 'U123456',
          name: 'testuser',
          profile: {
            email: 'john@example.com',
            display_name: 'John Doe'
          }
        }
      })
    },
    chat: {
      postMessage: jest.fn().mockResolvedValue({ ok: true, ts: '1234567890.123456' }),
      postEphemeral: jest.fn().mockResolvedValue({ ok: true })
    },
    conversations: {
      open: jest.fn().mockResolvedValue({ channel: { id: 'D123456' } })
    },
    views: {
      open: jest.fn().mockResolvedValue({ ok: true }),
      update: jest.fn().mockResolvedValue({ ok: true })
    },
    ...overrides
  };
}

function createMockAck() {
  return jest.fn().mockResolvedValue(undefined);
}

function createMockRespond() {
  return jest.fn().mockResolvedValue(undefined);
}

function createMockSay() {
  return jest.fn().mockResolvedValue({ ok: true });
}

function createSlackCommandPayload(overrides = {}) {
  return {
    command: '/tasks',
    user_id: 'U123456',
    user_name: 'testuser',
    channel_id: 'C123456',
    channel_name: 'general',
    text: '',
    response_url: 'https://hooks.slack.com/commands/test',
    trigger_id: 'trigger123',
    ...overrides
  };
}

function createWebhookEvent(overrides = {}) {
  return {
    type: 'event_callback',
    event: {
      type: 'app_mention',
      user: 'U123456',
      text: 'hello',
      ts: '1234567890.123456',
      channel: 'C123456'
    },
    ...overrides
  };
}

function createBlockActionPayload(overrides = {}) {
  return {
    type: 'block_actions',
    user: { id: 'U123456', username: 'testuser' },
    actions: [{
      action_id: 'mark_complete',
      value: '{"taskId":"111","boardId":"1234567"}'
    }],
    response_url: 'https://hooks.slack.com/actions/test',
    trigger_id: 'trigger123',
    ...overrides
  };
}

module.exports = {
  createMockSlackClient,
  createMockAck,
  createMockRespond,
  createMockSay,
  createSlackCommandPayload,
  createWebhookEvent,
  createBlockActionPayload
};
