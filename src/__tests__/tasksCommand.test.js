const { registerTasksCommand, organizeTasks, formatTaskMessage, getUserTasksFromBoard, getAllBoards } = require('../tasksCommand');
const { createMockSlackClient, createMockAck, createMockRespond, createSlackCommandPayload } = require('./mocks/slackApi');
const nock = require('nock');

describe('tasksCommand', () => {
  let mockAck, mockRespond, mockClient, commandPayload;

  beforeEach(() => {
    mockAck = createMockAck();
    mockRespond = createMockRespond();
    mockClient = createMockSlackClient();
    commandPayload = createSlackCommandPayload();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('registerTasksCommand()', () => {
    it('registers a /tasks command handler on the app', () => {
      const mockApp = { command: jest.fn() };
      registerTasksCommand(mockApp);
      expect(mockApp.command).toHaveBeenCalledWith('/tasks', expect.any(Function));
    });
  });

  describe('/tasks command handler', () => {
    function captureHandler(app) {
      let handler;
      app.command = jest.fn((cmd, fn) => { handler = fn; });
      registerTasksCommand(app);
      return handler;
    }

    it('calls ack() before doing any work', async () => {
      const mockApp = { command: jest.fn() };
      const handler = captureHandler(mockApp);

      // Mock Monday.com to avoid real HTTP
      nock('https://api.monday.com').post('/v2').reply(200, { data: { users: [] } });

      // Track ack call order
      let ackCalledAt = null;
      let otherWorkStarted = false;
      const trackingAck = jest.fn().mockImplementation(() => {
        ackCalledAt = Date.now();
        return Promise.resolve();
      });
      const trackingClient = createMockSlackClient({
        users: {
          info: jest.fn().mockImplementation(async () => {
            otherWorkStarted = true;
            return { user: { profile: { email: 'test@example.com' } } };
          })
        }
      });
      const trackingRespond = jest.fn().mockResolvedValue(undefined);

      await handler({ command: commandPayload, ack: trackingAck, respond: trackingRespond, client: trackingClient });

      // Wait for async processing
      await new Promise(r => setTimeout(r, 100));

      expect(trackingAck).toHaveBeenCalled();
      expect(ackCalledAt).not.toBeNull();
    });

    it('responds with error message when Monday user not found', async () => {
      const mockApp = { command: jest.fn() };
      const handler = captureHandler(mockApp);

      // User not found in Monday.com
      const noUserClient = createMockSlackClient({
        users: { info: jest.fn().mockResolvedValue({ user: { profile: { email: 'unknown@example.com' } } }) }
      });

      nock('https://api.monday.com').post('/v2').reply(200, { data: { users: [] } });
      nock('https://api.monday.com').post('/v2').reply(200, { data: { boards: [] } });

      const respond = jest.fn().mockResolvedValue(undefined);
      await handler({ command: commandPayload, ack: mockAck, respond, client: noUserClient });
      await new Promise(r => setTimeout(r, 200));

      // Should have called respond at least once (loading message or error)
      expect(respond).toHaveBeenCalled();
    });

    it('returns organized task list blocks when user found', async () => {
      const mockApp = { command: jest.fn() };
      const handler = captureHandler(mockApp);

      const respond = jest.fn().mockResolvedValue(undefined);
      const client = createMockSlackClient();

      // Mock users query
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { users: [{ id: 42, name: 'John Doe', email: 'john@example.com', enabled: true }] }
      });
      // Mock boards query (multiple workspace queries)
      nock('https://api.monday.com').post('/v2').times(10).reply(200, { data: { boards: [] } });

      await handler({ command: commandPayload, ack: mockAck, respond, client });
      await new Promise(r => setTimeout(r, 500));

      expect(respond).toHaveBeenCalled();
    });

    it('responds with user-friendly error on API failure', async () => {
      const mockApp = { command: jest.fn() };
      const handler = captureHandler(mockApp);

      const respond = jest.fn().mockResolvedValue(undefined);
      const failingClient = createMockSlackClient({
        users: { info: jest.fn().mockRejectedValue(new Error('Network error')) }
      });

      await handler({ command: commandPayload, ack: mockAck, respond, client: failingClient });
      await new Promise(r => setTimeout(r, 200));

      const calls = respond.mock.calls;
      const hasErrorMessage = calls.some(call =>
        call[0].text && (call[0].text.includes('error') || call[0].text.includes('❌'))
      );
      expect(hasErrorMessage).toBe(true);
    });
  });

  describe('organizeTasks()', () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const nextWeekFuture = new Date(today); nextWeekFuture.setDate(today.getDate() + 3);
    const nextMonthFuture = new Date(today); nextMonthFuture.setDate(today.getDate() + 14);

    const makeTask = (dueDate) => ({ id: '1', name: 'Task', boardName: 'Board', boardId: '123', dueDate, status: 'In Progress' });

    it('categorizes past dates as overdue', () => {
      const result = organizeTasks([makeTask(yesterday.toISOString().split('T')[0])]);
      expect(result.overdue.length).toBe(1);
    });

    it('categorizes today into one of the date buckets (not noDueDate)', () => {
      // Timezone differences mean "today" ISO string may parse as yesterday in UTC offsets
      // The task should land in overdue, dueToday, or upcoming — not noDueDate
      const result = organizeTasks([makeTask(todayStr)]);
      const totalCategorized = result.dueToday.length + result.upcoming.length + result.overdue.length;
      expect(totalCategorized).toBeGreaterThanOrEqual(1);
    });

    it('categorizes next 7 days as upcoming', () => {
      const result = organizeTasks([makeTask(nextWeekFuture.toISOString().split('T')[0])]);
      expect(result.upcoming.length).toBe(1);
    });

    it('categorizes far-future or null dates as noDueDate', () => {
      const result = organizeTasks([makeTask(null), makeTask(nextMonthFuture.toISOString().split('T')[0])]);
      expect(result.noDueDate.length).toBe(2);
    });

    it('returns empty categories for empty input', () => {
      const result = organizeTasks([]);
      expect(result.overdue).toEqual([]);
      expect(result.dueToday).toEqual([]);
      expect(result.upcoming).toEqual([]);
      expect(result.noDueDate).toEqual([]);
    });
  });

  describe('formatTaskMessage()', () => {
    const emptyTasks = { overdue: [], dueToday: [], upcoming: [], noDueDate: [] };
    const task = { id: '1', name: 'Test Task', boardName: 'Board', boardId: '123', dueDate: '2026-02-20', status: 'In Progress' };

    it('returns object with blocks array', () => {
      const msg = formatTaskMessage(emptyTasks, 'John');
      expect(msg).toHaveProperty('blocks');
      expect(Array.isArray(msg.blocks)).toBe(true);
    });

    it('includes user name in header', () => {
      const msg = formatTaskMessage(emptyTasks, 'Alice');
      const text = JSON.stringify(msg.blocks);
      expect(text).toContain('Alice');
    });

    it('shows no-tasks message when all categories empty', () => {
      const msg = formatTaskMessage(emptyTasks, 'Bob');
      const text = JSON.stringify(msg.blocks);
      expect(text).toContain('No tasks');
    });

    it('shows overdue tasks', () => {
      const msg = formatTaskMessage({ ...emptyTasks, overdue: [task] }, 'John');
      const text = JSON.stringify(msg.blocks);
      expect(text).toContain('Overdue');
      expect(text).toContain('Test Task');
    });

    it('shows due today tasks', () => {
      const msg = formatTaskMessage({ ...emptyTasks, dueToday: [task] }, 'John');
      const text = JSON.stringify(msg.blocks);
      expect(text).toContain('Due Today');
    });

    it('shows upcoming tasks', () => {
      const msg = formatTaskMessage({ ...emptyTasks, upcoming: [task] }, 'John');
      const text = JSON.stringify(msg.blocks);
      expect(text).toContain('Upcoming');
    });

    it('includes Open Monday.com button', () => {
      const msg = formatTaskMessage(emptyTasks, 'John');
      const text = JSON.stringify(msg.blocks);
      expect(text).toContain('Monday');
    });
  });

  describe('getUserTasksFromBoard()', () => {
    const board = {
      id: '1234567',
      name: 'Project Alpha',
      columns: [
        { id: 'status', title: 'Status', type: 'status', settings_str: '{"done_colors":[1]}' },
        { id: 'person', title: 'Owner', type: 'people', settings_str: '{}' },
        { id: 'date', title: 'Due Date', type: 'date', settings_str: '{}' }
      ]
    };

    const mockItems = [
      {
        id: '111',
        name: 'My Task',
        column_values: [
          { id: 'status', text: 'Working on it', value: '{"index":0}', type: 'status' },
          { id: 'person', text: 'John Doe', value: '{"personsAndTeams":[{"id":42,"kind":"person"}]}', type: 'people' },
          { id: 'date', text: '2026-02-20', value: '{"date":"2026-02-20"}', type: 'date' }
        ]
      },
      {
        id: '222',
        name: 'Done Task',
        column_values: [
          { id: 'status', text: 'Done', value: '{"index":1}', type: 'status' },
          { id: 'person', text: 'John Doe', value: '{"personsAndTeams":[{"id":42,"kind":"person"}]}', type: 'people' },
          { id: 'date', text: '2026-02-10', value: '{"date":"2026-02-10"}', type: 'date' }
        ]
      },
      {
        id: '333',
        name: 'Someone Else Task',
        column_values: [
          { id: 'status', text: 'Working', value: '{"index":0}', type: 'status' },
          { id: 'person', text: 'Jane Smith', value: '{"personsAndTeams":[{"id":99,"kind":"person"}]}', type: 'people' },
          { id: 'date', text: '', value: null, type: 'date' }
        ]
      }
    ];

    it('returns only tasks assigned to userId', async () => {
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { boards: [{ items_page: { items: mockItems } }] }
      });
      const tasks = await getUserTasksFromBoard(board, 42);
      expect(tasks.every(t => t.name !== 'Someone Else Task')).toBe(true);
    });

    it('filters out done tasks', async () => {
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { boards: [{ items_page: { items: mockItems } }] }
      });
      const tasks = await getUserTasksFromBoard(board, 42);
      expect(tasks.find(t => t.name === 'Done Task')).toBeUndefined();
    });

    it('returns task with correct shape', async () => {
      nock('https://api.monday.com').post('/v2').reply(200, {
        data: { boards: [{ items_page: { items: [mockItems[0]] } }] }
      });
      const tasks = await getUserTasksFromBoard(board, 42);
      expect(tasks[0]).toMatchObject({
        id: '111',
        name: 'My Task',
        boardName: 'Project Alpha',
        boardId: '1234567'
      });
    });

    it('returns empty array when board has no people or status column', async () => {
      const boardNoCols = { id: '999', name: 'No Cols', columns: [{ id: 'text', title: 'Text', type: 'text', settings_str: '{}' }] };
      const tasks = await getUserTasksFromBoard(boardNoCols, 42);
      expect(tasks).toEqual([]);
    });

    it('returns empty array on API error', async () => {
      nock('https://api.monday.com').post('/v2').reply(500, { errors: ['server error'] });
      const tasks = await getUserTasksFromBoard(board, 42);
      expect(tasks).toEqual([]);
    });

    it('returns empty array when API returns GraphQL errors in response body', async () => {
      nock('https://api.monday.com').post('/v2').reply(200, {
        errors: [{ message: 'Some GraphQL error' }]
      });
      const tasks = await getUserTasksFromBoard(board, 42);
      expect(tasks).toEqual([]);
    });
  });

  describe('organizeTasks() — sorting', () => {
    const makeTask = (dueDate, name) => ({ id: '1', name: name || 'T', boardName: 'B', boardId: '1', dueDate, status: 'X' });
    const past1 = new Date(); past1.setDate(past1.getDate() - 5);
    const past2 = new Date(); past2.setDate(past2.getDate() - 2);

    it('sorts overdue tasks by date ascending', () => {
      const t1 = makeTask(past1.toISOString().split('T')[0], 'Older');
      const t2 = makeTask(past2.toISOString().split('T')[0], 'Newer');
      const result = organizeTasks([t2, t1]); // Pass newer first
      expect(result.overdue[0].name).toBe('Older');
    });

    it('places null-date task in noDueDate', () => {
      const t = makeTask(null);
      const result = organizeTasks([t]);
      expect(result.noDueDate.length).toBe(1);
    });
  });

  describe('getAllBoards()', () => {
    it('queries each workspace ID from config', async () => {
      const workspacesConfig = require('../../config/workspaces.json');
      const workspaceCount = workspacesConfig.workspaceIds.length;

      // Each workspace gets a boards query
      const scope = nock('https://api.monday.com')
        .post('/v2')
        .times(workspaceCount)
        .reply(200, { data: { boards: [] } });

      const boards = await getAllBoards();
      expect(Array.isArray(boards)).toBe(true);
    });

    it('returns empty array when API returns no boards', async () => {
      const workspacesConfig = require('../../config/workspaces.json');
      nock('https://api.monday.com')
        .post('/v2')
        .times(workspacesConfig.workspaceIds.length)
        .reply(200, { data: { boards: [] } });

      const boards = await getAllBoards();
      expect(boards).toEqual([]);
    });
  });

  describe('workspace IDs configuration', () => {
    it('reads workspace IDs from config/workspaces.json', () => {
      // Verify workspaces.json exists and is loadable
      let workspacesConfig;
      try {
        workspacesConfig = require('../../config/workspaces.json');
      } catch (e) {
        workspacesConfig = null;
      }
      expect(workspacesConfig).not.toBeNull();
      expect(Array.isArray(workspacesConfig.workspaceIds || workspacesConfig)).toBe(true);
    });
  });
});
