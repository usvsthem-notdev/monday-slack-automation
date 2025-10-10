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
  }
};

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

// Initialize Slack App with commands
function initializeSlackCommands(slackApp) {
  
  // Main command: /create-task
  slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      logger.info('Create task command received', { 
        userId: command.user_id,
        text: command.text 
      });
      
      // Open a modal for task creation
      const boards = await getAllBoards();
      const users = await getUsers();
      
      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'create_task_modal',
          title: {
            type: 'plain_text',
            text: 'Create Monday.com Task'
          },
          submit: {
            type: 'plain_text',
            text: 'Create Task'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          },
          blocks: [
            {
              type: 'input',
              block_id: 'task_name',
              label: {
                type: 'plain_text',
                text: 'Task Name'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'task_name_input',
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
                action_id: 'board_select_input',
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
                text: 'Assign To'
              },
              element: {
                type: 'multi_static_select',
                action_id: 'assignees_input',
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
                text: 'Due Date'
              },
              element: {
                type: 'datepicker',
                action_id: 'due_date_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select a date'
                }
              }
            },
            {
              type: 'input',
              block_id: 'status',
              optional: true,
              label: {
                type: 'plain_text',
                text: 'Status (optional)'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'status_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'e.g., Working on it, Stuck, Done'
                }
              }
            }
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error opening create task modal', error);
      await respond({
        text: '❌ Sorry, there was an error opening the task creation form. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });
  
  // Handle modal submission
  slackApp.view('create_task_modal', async ({ ack, body, view, client }) => {
    await ack();
    
    try {
      const values = view.state.values;
      
      const taskName = values.task_name.task_name_input.value;
      const boardId = values.board_select.board_select_input.selected_option.value;
      const assignees = values.assignees.assignees_input.selected_options?.map(opt => opt.value) || [];
      const dueDate = values.due_date.due_date_input.selected_date || null;
      const status = values.status.status_input.value || null;
      
      logger.info('Creating task', {
        taskName,
        boardId,
        assignees,
        dueDate,
        status,
        userId: body.user.id
      });
      
      // Create the task
      const createdTask = await createMondayTask(boardId, taskName, assignees, dueDate, status);
      
      // Send success message to the user
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `✅ Task created successfully!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Task Created Successfully!*\n\n*Task:* ${createdTask.name}\n*Board:* ${createdTask.board.name}\n*Assigned to:* ${assignees.length} ${assignees.length === 1 ? 'person' : 'people'}\n${dueDate ? `*Due Date:* ${dueDate}` : ''}`
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
      logger.error('Error creating task', error);
      
      // Send error message
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: '❌ Sorry, there was an error creating the task. Please try again or contact support.'
      });
    }
  });
  
  // Quick create command with inline syntax: /quick-task [task name] @[user] [board]
  slackApp.command('/quick-task', async ({ command, ack, respond }) => {
    await ack();
    
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
      
      // For quick tasks, use a default board or the first available board
      const boards = await getAllBoards();
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
  
  // Help command
  slackApp.command('/monday-help', async ({ command, ack, respond }) => {
    await ack();
    
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
  
  logger.info('Slack commands initialized');
}

module.exports = {
  initializeSlackCommands
};
