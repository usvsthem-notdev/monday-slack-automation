const { App } = require('@slack/bolt');
const axios = require('axios');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;

const mondayAxios = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: {
    'Authorization': MONDAY_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Logger helper
const logger = {
  info: (msg, data = {}) => {
    console.log(JSON.stringify({ 
      level: 'info', 
      message: msg, 
      data, 
      timestamp: new Date().toISOString() 
    }));
  },
  error: (msg, error = {}) => {
    console.error(JSON.stringify({ 
      level: 'error', 
      message: msg, 
      error: error.message || error, 
      stack: error.stack,
      timestamp: new Date().toISOString() 
    }));
  },
  warn: (msg, data = {}) => {
    console.log(JSON.stringify({ 
      level: 'warn', 
      message: msg, 
      data, 
      timestamp: new Date().toISOString() 
    }));
  }
};

// ============================================
// CACHING LAYER - Fixes timeout issue
// ============================================
let boardsCache = { data: null, timestamp: 0 };
let usersCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedBoards() {
  const now = Date.now();
  
  // Return cached data if still fresh
  if (boardsCache.data && (now - boardsCache.timestamp) < CACHE_TTL) {
    logger.info('Returning cached boards', { 
      age: Math.round((now - boardsCache.timestamp) / 1000) + 's',
      count: boardsCache.data.length 
    });
    return boardsCache.data;
  }
  
  // Fetch fresh data
  logger.info('Fetching fresh boards data from Monday.com');
  const boards = await getAllBoards();
  boardsCache = { data: boards, timestamp: now };
  logger.info('Boards cache refreshed', { count: boards.length });
  
  return boards;
}

async function getCachedUsers() {
  const now = Date.now();
  
  // Return cached data if still fresh
  if (usersCache.data && (now - usersCache.timestamp) < CACHE_TTL) {
    logger.info('Returning cached users', { 
      age: Math.round((now - usersCache.timestamp) / 1000) + 's',
      count: usersCache.data.length 
    });
    return usersCache.data;
  }
  
  // Fetch fresh data
  logger.info('Fetching fresh users data from Monday.com');
  const users = await getUsers();
  usersCache = { data: users, timestamp: now };
  logger.info('Users cache refreshed', { count: users.length });
  
  return users;
}

// Expose cache for external pre-warming
async function prewarmCache() {
  try {
    const start = Date.now();
    const [boards, users] = await Promise.all([
      getCachedBoards(),
      getCachedUsers()
    ]);
    const duration = Date.now() - start;
    
    logger.info('✅ Cache pre-warmed successfully', { 
      boards: boards.length,
      users: users.length,
      duration: duration + 'ms'
    });
    
    return { boards: boards.length, users: users.length, duration };
  } catch (error) {
    logger.error('Failed to pre-warm cache', error);
    throw error;
  }
}

// ============================================
// MONDAY.COM API FUNCTIONS
// ============================================

// Monday.com GraphQL helper
async function mondayQuery(query) {
  try {
    const response = await mondayAxios.post('', { query });
    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }
    return response.data.data;
  } catch (error) {
    logger.error('Monday.com API error', error);
    throw error;
  }
}

// Get all boards
async function getAllBoards() {
  const query = `
    query {
      boards(limit: 50) {
        id
        name
        workspace {
          id
          name
        }
        columns {
          id
          title
          type
          settings_str
        }
      }
    }
  `;
  
  const data = await mondayQuery(query);
  return data.boards;
}

// Get users for assignment
async function getUsers() {
  const query = `
    query {
      users {
        id
        name
        email
        enabled
      }
    }
  `;
  
  const data = await mondayQuery(query);
  return data.users.filter(u => u.enabled);
}

// Create a new task on Monday.com
async function createMondayTask(boardId, taskName, assigneeIds, dueDate, status) {
  const columns = await getBoardColumns(boardId);
  const peopleColumn = columns.find(c => c.type === 'people');
  const dateColumn = columns.find(c => c.type === 'date');
  const statusColumn = columns.find(c => c.type === 'status');
  
  // Build column values
  const columnValues = {};
  
  // Add assignees
  if (peopleColumn && assigneeIds && assigneeIds.length > 0) {
    columnValues[peopleColumn.id] = {
      personsAndTeams: assigneeIds.map(id => ({
        id: parseInt(id),
        kind: 'person'
      }))
    };
  }
  
  // Add due date
  if (dateColumn && dueDate) {
    columnValues[dateColumn.id] = {
      date: dueDate
    };
  }
  
  // Add status
  if (statusColumn && status) {
    const statusSettings = JSON.parse(statusColumn.settings_str || '{}');
    const statusLabels = statusSettings.labels || {};
    const matchingStatus = Object.entries(statusLabels).find(
      ([_, label]) => label.toLowerCase() === status.toLowerCase()
    );
    
    if (matchingStatus) {
      columnValues[statusColumn.id] = {
        label: matchingStatus[1]
      };
    }
  }
  
  const columnValuesStr = JSON.stringify(columnValues)
    .replace(/"/g, '\\"');
  
  const mutation = `
    mutation {
      create_item(
        board_id: ${boardId},
        item_name: "${taskName.replace(/"/g, '\\"')}",
        column_values: "${columnValuesStr}"
      ) {
        id
        name
        board {
          id
          name
        }
      }
    }
  `;
  
  const data = await mondayQuery(mutation);
  return data.create_item;
}

// Get board columns
async function getBoardColumns(boardId) {
  const query = `
    query {
      boards(ids: [${boardId}]) {
        columns {
          id
          title
          type
          settings_str
        }
      }
    }
  `;
  
  const data = await mondayQuery(query);
  return data.boards[0].columns;
}

// ============================================
// SLACK COMMAND HANDLERS
// ============================================

// Initialize Slack App with commands
function initializeSlackCommands(slackApp) {
  
  // NOTE: Button action handlers (task_action_complete_, task_action_update_, etc.) 
  // are now handled in automation.js to avoid duplicate handler conflicts.
  // This prevents ReceiverMultipleAckError and timeout issues.
  
  // ============================================================================
  // OPTION 2: /create-task with respond() Pattern (Recommended)
  // ============================================================================
  // This implementation eliminates 3-second timeout issues by:
  // 1. Acknowledging immediately
  // 2. Showing loading message
  // 3. Fetching data without time pressure
  // 4. Replacing with final form
  // ============================================================================
  
  slackApp.command('/create-task', ({ command, ack, respond, client }) => {
    // CRITICAL: Synchronous function for INSTANT acknowledgment
    // Remove 'async' keyword to eliminate async overhead
    const ackPromise = ack();

    // Queue all async work - use setImmediate to ensure ack completes first
    setImmediate(async () => {
      try {
        logger.info('Create task command received', {
          userId: command.user_id,
          text: command.text
        });

        // STEP 2: Show loading message via respond()
        // This buys us time to fetch data without worrying about timeouts
        await respond({
          text: '⏳ Loading task creation form...',
          response_type: 'ephemeral'
        });

        // STEP 3: Fetch data (can take time, no rush!)
        const start = Date.now();
        const [boards, users] = await Promise.all([
          getCachedBoards(),
          getCachedUsers()
        ]);
      
      const fetchDuration = Date.now() - start;
      logger.info('Data fetched for form', { 
        duration: fetchDuration + 'ms',
        boards: boards.length,
        users: users.length
      });
      
      // STEP 4: Build the form blocks
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Create a New Task on Monday.com*\n\nFill out the form below to create your task.'
          }
        },
        { type: 'divider' },
        {
          type: 'input',
          block_id: 'task_name',
          label: {
            type: 'plain_text',
            text: 'Task Name'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_name_value',
            placeholder: {
              type: 'plain_text',
              text: 'Enter task name...'
            }
          }
        },
        {
          type: 'input',
          block_id: 'board_select',
          label: {
            type: 'plain_text',
            text: 'Board'
          },
          element: {
            type: 'static_select',
            action_id: 'board_select_value',
            placeholder: {
              type: 'plain_text',
              text: 'Select a board'
            },
            options: boards.slice(0, 100).map(board => ({
              text: {
                type: 'plain_text',
                text: `${board.name} (${board.workspace?.name || 'No workspace'})`
              },
              value: board.id
            }))
          }
        },
        {
          type: 'input',
          block_id: 'assignees',
          optional: true,
          label: {
            type: 'plain_text',
            text: 'Assign To (optional)'
          },
          element: {
            type: 'multi_static_select',
            action_id: 'assignees_value',
            placeholder: {
              type: 'plain_text',
              text: 'Select team members'
            },
            options: users.slice(0, 100).map(user => ({
              text: {
                type: 'plain_text',
                text: user.name
              },
              value: user.id
            }))
          }
        },
        {
          type: 'input',
          block_id: 'due_date',
          optional: true,
          label: {
            type: 'plain_text',
            text: 'Due Date (optional)'
          },
          element: {
            type: 'datepicker',
            action_id: 'due_date_value',
            placeholder: {
              type: 'plain_text',
              text: 'Select a date'
            }
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Create Task'
              },
              style: 'primary',
              action_id: 'create_task_submit',
              value: JSON.stringify({ userId: command.user_id })
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Cancel'
              },
              action_id: 'create_task_cancel'
            }
          ]
        }
      ];
      
      // STEP 5: Send the form via respond() - no time pressure!
      // replace_original: true replaces the loading message with the form
      await respond({
        blocks: blocks,
        replace_original: true,
        response_type: 'ephemeral'
      });
      
        const totalDuration = Date.now() - start;
        logger.info('Form displayed successfully', {
          totalDuration: totalDuration + 'ms'
        });

      } catch (error) {
        logger.error('Error displaying create task form', error);

        try {
          await respond({
            text: '❌ Sorry, there was an error loading the task creation form. Please try again.',
            replace_original: true,
            response_type: 'ephemeral'
          });
        } catch (respondError) {
          logger.error('Failed to send error message to user', respondError);
        }
      }
    });

    return ackPromise;
  });
  
  // ============================================================================
  // Handle Create Task Button Click
  // ============================================================================
  
  slackApp.action('create_task_submit', async ({ ack, body, client }) => {
    // Fire-and-forget acknowledgment for button action
    ack().catch(err => logger.error('ACK failed for create_task_submit', err));
    
    try {
      // Extract values from the message blocks
      const values = {};
      body.message.blocks.forEach(block => {
        if (block.type === 'input') {
          const element = block.element;
          if (element.type === 'plain_text_input') {
            values[block.block_id] = element.value || null;
          } else if (element.type === 'static_select') {
            values[block.block_id] = element.selected_option?.value || null;
          } else if (element.type === 'multi_static_select') {
            values[block.block_id] = element.selected_options?.map(opt => opt.value) || [];
          } else if (element.type === 'datepicker') {
            values[block.block_id] = element.selected_date || null;
          }
        }
      });
      
      const taskName = values.task_name;
      const boardId = values.board_select;
      const assignees = values.assignees || [];
      const dueDate = values.due_date;
      
      // Validate required fields
      if (!taskName || !boardId) {
        await client.chat.postEphemeral({
          channel: body.channel.id,
          user: body.user.id,
          text: '❌ Please fill in the Task Name and Board fields.'
        });
        return;
      }
      
      logger.info('Creating task from form', {
        taskName,
        boardId,
        assignees,
        dueDate,
        userId: body.user.id
      });
      
      // Update message to show progress
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: '⏳ Creating task on Monday.com...',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⏳ *Creating task...*\n\nPlease wait while we create your task on Monday.com.'
            }
          }
        ]
      });
      
      // Create the task on Monday.com
      const createdTask = await createMondayTask(boardId, taskName, assignees, dueDate, null);
      
      // Update message with success
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: '✅ Task created successfully!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Task Created Successfully!*\n\n*Task:* ${createdTask.name}\n*Board:* ${createdTask.board.name}\n*Assigned to:* ${assignees.length} ${assignees.length === 1 ? 'person' : 'people'}${dueDate ? `\n*Due Date:* ${dueDate}` : ''}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📱 View on Monday.com'
                },
                url: `https://drexcorp-company.monday.com/boards/${createdTask.board.id}/pulses/${createdTask.id}`,
                style: 'primary'
              }
            ]
          }
        ]
      });
      
      logger.info('Task created successfully', {
        taskId: createdTask.id,
        taskName: createdTask.name,
        boardId: createdTask.board.id
      });
      
    } catch (error) {
      logger.error('Error creating task from button', error);
      
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: '❌ Error creating task',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '❌ *Error creating task*\n\nSorry, there was an error creating the task. Please try again.'
            }
          }
        ]
      });
    }
  });
  
  // ============================================================================
  // Handle Cancel Button Click
  // ============================================================================
  
  slackApp.action('create_task_cancel', async ({ ack, body, client }) => {
    // Fire-and-forget acknowledgment for cancel button
    ack().catch(err => logger.error('ACK failed for create_task_cancel', err));
    
    try {
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: 'Cancelled',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '❌ Task creation cancelled.'
            }
          }
        ]
      });
    } catch (error) {
      logger.error('Error handling cancel button', error);
    }
  });
  
  // ============================================================================
  // Other Commands (Quick Task, Help)
  // ============================================================================
  
  // FIXED: Quick create command - Proper async acknowledgment
  slackApp.command('/quick-task', ({ command, ack, respond }) => {
    // CRITICAL: Synchronous function for INSTANT acknowledgment
    const ackPromise = ack();

    // Queue async work - use setImmediate to ensure ack completes first
    setImmediate(async () => {
    
    try {
      const text = command.text.trim();
      
      if (!text) {
        await respond({
          text: '💡 *Usage:* `/quick-task Task name @user board-name`\n\nExample: `/quick-task Review design doc @john sales-board`',
          response_type: 'ephemeral'
        });
        return;
      }
      
      // Parse the command (basic parsing)
      const parts = text.split(' ');
      const taskName = parts.filter(p => !p.startsWith('@')).join(' ');
      
      if (!taskName) {
        await respond({
          text: '❌ Please provide a task name.\n\nExample: `/quick-task Review design doc`',
          response_type: 'ephemeral'
        });
        return;
      }
      
      await respond({
        text: `🔄 Creating task: "${taskName}"...`,
        response_type: 'ephemeral'
      });
      
      // For quick tasks, use cached boards
      const boards = await getCachedBoards();
      if (boards.length === 0) {
        await respond({
          text: '❌ No boards found. Please create a board on Monday.com first.',
          response_type: 'ephemeral'
        });
        return;
      }
      
      const defaultBoard = boards[0];
      const createdTask = await createMondayTask(defaultBoard.id, taskName, [], null, null);
      
      await respond({
        text: `✅ Task created: "${createdTask.name}" on ${createdTask.board.name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Task Created!*\n\n*${createdTask.name}*\n📍 ${createdTask.board.name}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📱 View on Monday.com'
                },
                url: `https://drexcorp-company.monday.com/boards/${createdTask.board.id}/pulses/${createdTask.id}`,
                style: 'primary'
              }
            ]
          }
        ],
        response_type: 'ephemeral'
      });
      
      } catch (error) {
        logger.error('Error in quick task command', error);
        await respond({
          text: '❌ Sorry, there was an error creating the task. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });

    return ackPromise;
  });
  
  // Help command
  slackApp.command('/monday-help', ({ command, ack, respond }) => {
    // CRITICAL: Synchronous function for INSTANT acknowledgment
    const ackPromise = ack();

    // Queue async work - use setImmediate to ensure ack completes first
    setImmediate(async () => {
    
    await respond({
      text: '📋 *Monday.com Slack Commands*',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📋 Monday.com Slack Commands'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Available Commands:*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '`/create-task`\nOpen a form to create a new task with full options (assignees, due date, status)'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '`/quick-task [task name]`\nQuickly create a task with just a name'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '`/monday-help`\nShow this help message'
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Examples:*\n• `/create-task` - Opens interactive form\n• `/quick-task Review Q4 budget` - Creates task instantly'
          }
        }
      ],
      response_type: 'ephemeral'
    });
    });

    return ackPromise;
  });
  
  logger.info('✅ Slack commands initialized with respond() pattern for /create-task');
}

module.exports = {
  initializeSlackCommands,
  prewarmCache,
  getCachedBoards,
  getCachedUsers
};
