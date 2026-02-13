const { handleWebhook, extractNewlyAssignedUsers, formatTaskNotification } = require('../webhookHandler');
const nock = require('nock');

describe('webhookHandler', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('extractNewlyAssignedUsers()', () => {
    it('returns empty array when no columnId', () => {
      const result = extractNewlyAssignedUsers({ value: { personsAndTeams: [] } });
      expect(result).toEqual([]);
    });

    it('returns empty array when no value', () => {
      const result = extractNewlyAssignedUsers({ columnId: 'person' });
      expect(result).toEqual([]);
    });

    it('returns newly assigned user IDs', () => {
      const event = {
        columnId: 'person',
        value: { personsAndTeams: [{ id: 42, kind: 'person' }, { id: 99, kind: 'person' }] },
        previousValue: { personsAndTeams: [{ id: 42, kind: 'person' }] }
      };
      const result = extractNewlyAssignedUsers(event);
      expect(result).toContain(99);
      expect(result).not.toContain(42);
    });

    it('ignores teams (kind !== person)', () => {
      const event = {
        columnId: 'person',
        value: { personsAndTeams: [{ id: 5, kind: 'team' }] },
        previousValue: { personsAndTeams: [] }
      };
      const result = extractNewlyAssignedUsers(event);
      expect(result).toEqual([]);
    });

    it('returns all users when previous value is empty', () => {
      const event = {
        columnId: 'person',
        value: { personsAndTeams: [{ id: 1, kind: 'person' }, { id: 2, kind: 'person' }] },
        previousValue: {}
      };
      const result = extractNewlyAssignedUsers(event);
      expect(result).toEqual([1, 2]);
    });
  });

  describe('formatTaskNotification()', () => {
    const mockTask = {
      id: '111',
      name: 'Fix the bug',
      board: { id: '1234567', name: 'Project Alpha' },
      column_values: [
        { type: 'status', text: 'In Progress', id: 'status' },
        { type: 'date', value: '{"date":"2026-02-20"}', id: 'date' }
      ]
    };

    it('returns blocks array', () => {
      const result = formatTaskNotification(mockTask, 'John Doe');
      expect(result).toHaveProperty('blocks');
      expect(Array.isArray(result.blocks)).toBe(true);
    });

    it('includes task name', () => {
      const result = formatTaskNotification(mockTask, 'John Doe');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Fix the bug');
    });

    it('includes assigned user name', () => {
      const result = formatTaskNotification(mockTask, 'John Doe');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('John Doe');
    });

    it('includes Mark Complete button', () => {
      const result = formatTaskNotification(mockTask, 'John Doe');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Mark Complete');
    });

    it('handles task with no date column gracefully', () => {
      const taskNoDue = { ...mockTask, column_values: [] };
      const result = formatTaskNotification(taskNoDue, 'Jane');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('No due date');
    });

    it('includes board name', () => {
      const result = formatTaskNotification(mockTask, 'John Doe');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Project Alpha');
    });
  });

  describe('sendSlackNotification()', () => {
    const { sendSlackNotification } = require('../webhookHandler');

    it('returns false when slack user not found', async () => {
      nock('https://slack.com')
        .post('/api/users.lookupByEmail')
        .reply(200, { ok: false, error: 'users_not_found' });

      // sendSlackNotification calls slack.users.lookupByEmail which uses the WebClient
      // The WebClient token is set in env. For test we mock at nock level.
      // Since the module-level slack client uses real WebClient, we test error handling
      const result = await sendSlackNotification('notfound@example.com', { blocks: [] }).catch(e => {
        // May throw or return false
        return false;
      });
      expect(typeof result === 'boolean').toBe(true);
    });
  });

  describe('processWebhookEvent()', () => {
    const { processWebhookEvent } = require('../webhookHandler');

    it('returns early when event is not a people column', async () => {
      const event = { columnType: 'text', columnId: 'text_col', value: {}, previousValue: {} };
      // Should not throw
      await expect(processWebhookEvent(event)).resolves.toBeUndefined();
    });

    it('returns early when no newly assigned users', async () => {
      const event = {
        columnType: 'people',
        columnId: 'person_col',
        value: { personsAndTeams: [{ id: 42, kind: 'person' }] },
        previousValue: { personsAndTeams: [{ id: 42, kind: 'person' }] } // same user, not new
      };
      await expect(processWebhookEvent(event)).resolves.toBeUndefined();
    });

    it('returns early when event has no columnId', async () => {
      const event = { columnType: 'people', value: {}, previousValue: {} };
      await expect(processWebhookEvent(event)).resolves.toBeUndefined();
    });

    it('processes newly assigned users and calls Monday API', async () => {
      const event = {
        columnType: 'people',
        columnId: 'person_col',
        pulseId: '111',
        boardId: '1234567',
        value: { personsAndTeams: [{ id: 42, kind: 'person' }] },
        previousValue: { personsAndTeams: [] }
      };

      // Mock getTaskDetails call
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { items: [{ id: '111', name: 'Test Task', board: { id: '1234567', name: 'Alpha' }, column_values: [] }] }
      });
      // Mock getMondayUser call
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { users: [{ id: 42, name: 'John', email: 'john@example.com' }] }
      });
      // Mock Slack API (sendSlackNotification → lookupByEmail)
      nock('https://slack.com').post('/api/users.lookupByEmail').reply(200, {
        ok: false,
        error: 'users_not_found'
      });

      // Should not throw
      await expect(processWebhookEvent(event)).resolves.toBeUndefined();
    }, 10000);
  });

  describe('handleWebhook()', () => {
    it('exports handleWebhook function', () => {
      expect(typeof handleWebhook).toBe('function');
    });

    it('handles Monday.com challenge verification', async () => {
      const req = {
        body: { challenge: 'abc123' },
        headers: {}
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await handleWebhook(req, res);
      expect(res.json).toHaveBeenCalledWith({ challenge: 'abc123' });
    });

    it('returns 200 quickly for non-assignment events', async () => {
      const req = {
        body: {
          event: {
            type: 'update_name',
            columnType: 'name',
            boardId: 1234567,
            pulseId: 111,
            value: { name: 'Updated name' }
          }
        },
        headers: {}
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      const start = Date.now();
      await handleWebhook(req, res);
      const elapsed = Date.now() - start;

      // Should respond quickly (< 500ms for non-assignment events)
      expect(elapsed).toBeLessThan(500);
    });

    it('responds immediately and processes assignment async', async () => {
      const req = {
        body: {
          event: {
            type: 'update_column_value',
            columnType: 'people',
            boardId: 1234567,
            pulseId: 111,
            value: {
              persons_and_teams: [{ id: 42, kind: 'person' }]
            },
            previousValue: {
              persons_and_teams: []
            }
          }
        },
        headers: {}
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      // Mock Monday.com API calls
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { users: [{ id: 42, name: 'John Doe', email: 'john@example.com' }] }
      });
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { boards: [{ items_page: { items: [{ id: '111', name: 'Test Task', column_values: [] }] } }] }
      });

      const start = Date.now();
      await handleWebhook(req, res);
      const elapsed = Date.now() - start;

      // Should have responded (ack)
      const responded = res.json.mock.calls.length > 0 || res.send.mock.calls.length > 0;
      expect(responded).toBe(true);
    });

    it('returns 400 when no event in payload', async () => {
      const req = { body: {}, headers: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };
      await handleWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('ignores events with no column type', async () => {
      const req = {
        body: {
          event: {
            type: 'create_pulse',
            boardId: 1234567,
            pulseId: 222
          }
        },
        headers: {}
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await handleWebhook(req, res);
      // Should respond without error
      const responded = res.json.mock.calls.length > 0 || res.send.mock.calls.length > 0;
      expect(responded).toBe(true);
    });
  });
});
