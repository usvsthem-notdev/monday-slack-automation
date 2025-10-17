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

// Mark task as complete on Monday.com
async function markTaskComplete(boardId, itemId) {
  // Get board columns to find the status column
  const columns = await getBoardColumns(boardId);
  const statusColumn = columns.find(c => c.type === 'status');
  
  if (!statusColumn) {
    throw new Error('No status column found on this board');
  }
  
  // Parse status settings to find the "Done" status
  const statusSettings = JSON.parse(statusColumn.settings_str || '{}');
  const statusLabels = statusSettings.labels || {};
  const doneColors = statusSettings.done_colors || [1];
  
  // Find a "Done" status - look for common done labels or use the first done color
  let doneLabel = null;
  for (const [index, label] of Object.entries(statusLabels)) {
    if (doneColors.includes(parseInt(index)) || 
        label.toLowerCase().includes('done') || 
        label.toLowerCase().includes('complete')) {
      doneLabel = label;
      break;
    }
  }
  
  // If no done label found, use the label for the first done color
  if (!doneLabel && doneColors.length > 0) {
    doneLabel = statusLabels[doneColors[0]];
  }
  
  if (!doneLabel) {
    throw new Error('Could not find a "Done" status on this board');
  }
  
  // FIXED: For change_column_value, pass the value directly, NOT wrapped in column ID
  const columnValue = {
    label: doneLabel
  };
  
  const columnValueStr = JSON.stringify(columnValue).replace(/"/g, '\\"');
  
  const mutation = `
    mutation {
      change_column_value(
        board_id: ${boardId},
        item_id: ${itemId},
        column_id: "${statusColumn.id}",
        value: "${columnValueStr}"
      ) {
        id
        name
      }
    }
  `;
  
  const data = await mondayQuery(mutation);
  return data.change_column_value;
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

// Get task name for display
async function getTaskName(itemId) {
  const query = `
    query {
      items(ids: [${itemId}]) {
        id
        name
      }
    }
  `;
  
  const data = await mondayQuery(query);
  return data.items[0]?.name || 'Task';
}

// Initialize Slack App with commands
function initializeSlackCommands(slackApp) {
  
  // Handle "Mark Complete" button clicks from webhook notifications
  slackApp.action(/^task_action_complete_/, async ({ action, ack, respond, client, body }) => {
    await ack();
    
    try {
      // Extract task and board IDs from action_id
      // Format: task_action_complete_{taskId}_{boardId}
      const parts = action.action_id.split('_');
      const taskId = parts[3];
      const boardId = parts[4];
      
      logger.info('Mark complete button clicked', { taskId, boardId, user: body.user.id });
      
      // Get task name first
      const taskName = await getTaskName(taskId);
      
      // Mark the task as complete on Monday.com
      await markTaskComplete(boardId, taskId);
      
      // Send success message
      await respond({
        text: `✅ Marked "${taskName}" as complete on Monday.com!`,
        replace_original: false,
        response_type: 'ephemeral'
      });
      
      logger.info('Task marked complete', { taskId, boardId, taskName });
      
    } catch (error) {
      logger.error('Error marking task complete', error);
      await respond({
        text: `❌ Failed to mark task complete: ${error.message}`,
        replace_original: false,
        response_type: 'ephemeral'
      });
    }
  });
  
  // Handle "Update Task" button clicks
  slackApp.action(/^task_action_update_/, async ({ action, ack, client, body }) => {
    await ack();
    
    try {
      const parts = action.action_id.split('_');
      const taskId = parts[3];
      const boardId = parts[4];
      
      logger.info('Update task button clicked', { taskId, boardId });
      
      // Get task name and board columns
      const taskName = await getTaskName(taskId);
      const columns = await getBoardColumns(boardId);
      const statusColumn = columns.find(c => c.type === 'status');
      
      // Get available statuses
      let statusOptions = [];
      if (statusColumn) {
        const statusSettings = JSON.parse(statusColumn.settings_str || '{}');
        const statusLabels = statusSettings.labels || {};
        statusOptions = Object.entries(statusLabels).map(([index, label]) => ({
          text: {
            type: 'plain_text',
            text: label
          },
          value: `${taskId}_${boardId}_${statusColumn.id}_${label}`
        }));
      }
      
      // Open modal with update options
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'update_task_modal',
          title: {
            type: 'plain_text',
            text: 'Update Task'
          },
          submit: {
            type: 'plain_text',
            text: 'Update'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          },
          private_metadata: JSON.stringify({ taskId, boardId }),
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Task:* ${taskName}`
              }
            },
            {
              type: 'divider'
            },
            ...(statusOptions.length > 0 ? [{
              type: 'input',
              block_id: 'status_update',
              label: {
                type: 'plain_text',
                text: 'Update Status'
              },
              element: {
                type: 'static_select',
                action_id: 'status_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select new status'
                },
                options: statusOptions
              }
            }] : [])
          ]
        }
      });
      
    } catch (error) {
      logger.error('Error opening update modal', error);
    }
  });
  
  // Handle update task modal submission
  slackApp.view('update_task_modal', async ({ ack, body, view }) => {
    await ack();
    
    try {
      const metadata = JSON.parse(view.private_metadata);
      const { taskId, boardId } = metadata;
      
      const values = view.state.values;
      
      if (values.status_update) {
        const selectedValue = values.status_update.status_select.selected_option.value;
        const parts = selectedValue.split('_');
        const statusColumnId = parts[2];
        const statusLabel = parts.slice(3).join('_');
        
        // FIXED: For change_column_value, pass value directly, NOT wrapped in column ID
        const columnValue = {
          label: statusLabel
        };
        
        const columnValueStr = JSON.stringify(columnValue).replace(/"/g, '\\"');
        
        const mutation = `
          mutation {
            change_column_value(
              board_id: ${boardId},
              item_id: ${taskId},
              column_id: "${statusColumnId}",
              value: "${columnValueStr}"
            ) {
              id
              name
            }
          }
        `;
        
        await mondayQuery(mutation);
        
        logger.info('Task status updated', { taskId, boardId, newStatus: statusLabel });
      }
      
    } catch (error) {
      logger.error('Error updating task', error);
    }
  });
  
  // FIXED: Main command: /create-task - Proper async acknowledgment
  slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    // CRITICAL FIX: Acknowledge IMMEDIATELY as the very first operation
    await ack();
    
    try {
      logger.info('Create task command received', { 
        userId: command.user_id,
        text: command.text 
      });
      
      // Show loading message first
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: '⏳ Loading task creation form...'
      });
      
      // Now do the heavy API calls
      const [boards, users] = await Promise.all([
        getAllBoards(),
        getUsers()
      ]);
      
      // Open modal for task creation
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
      
      // Send error message to user
      try {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: '❌ Sorry, there was an error opening the task creation form. Please try again.'
        });
      } catch (notifyError) {
        logger.error('Failed to send error notification', notifyError);
      }
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
  
  // FIXED: Quick create command - Proper async acknowledgment
  slackApp.command('/quick-task', async ({ command, ack, respond }) => {
    // CRITICAL FIX: Acknowledge IMMEDIATELY
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
