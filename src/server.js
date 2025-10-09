require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const PORT = process.env.PORT || 3000;

// Create Express receiver for custom endpoints
const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
  endpoints: '/slack/events'
});

// Initialize Slack Bolt app
const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver
});

// Monday.com API helper
const mondayAxios = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: {
    'Authorization': MONDAY_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function mondayQuery(query) {
  try {
    const response = await mondayAxios.post('', { query });
    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }
    return response.data.data;
  } catch (error) {
    console.error('Monday.com API error:', error.message);
    throw error;
  }
}

// Store task metadata (in production, use a database)
const taskMetadata = new Map();

// ============================================
// SLACK INTERACTIVE COMPONENTS
// ============================================

// Handle button clicks for task actions
app.action(/^task_action_.*/, async ({ action, ack, body, client }) => {
  await ack();
  
  try {
    const [_, actionType, taskId, boardId] = action.action_id.split('_');
    const userId = body.user.id;
    
    console.log(`User ${userId} triggered ${actionType} on task ${taskId}`);
    
    switch (actionType) {
      case 'complete':
        await handleCompleteTask(taskId, boardId, userId, client, body);
        break;
      case 'update':
        await handleUpdateTask(taskId, boardId, userId, client, body);
        break;
      case 'postpone':
        await handlePostponeTask(taskId, boardId, userId, client, body);
        break;
      case 'view':
        await handleViewTask(taskId, boardId, userId, client, body);
        break;
      default:
        console.log(`Unknown action: ${actionType}`);
    }
  } catch (error) {
    console.error('Error handling button click:', error);
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `❌ Error: ${error.message}`
    });
  }
});

// Handle task completion
async function handleCompleteTask(taskId, boardId, userId, client, body) {
  try {
    // Get board info to find status column
    const boardQuery = `
      query {
        boards(ids: [${boardId}]) {
          columns {
            id
            type
            settings_str
          }
        }
      }
    `;
    
    const boardData = await mondayQuery(boardQuery);
    const statusColumn = boardData.boards[0].columns.find(c => c.type === 'status');
    
    if (!statusColumn) {
      throw new Error('Status column not found on this board');
    }
    
    const statusSettings = JSON.parse(statusColumn.settings_str || '{}');
    const doneIndex = statusSettings.done_colors?.[0] || 1;
    
    // Update task status to "Done"
    const updateQuery = `
      mutation {
        change_column_value(
          board_id: ${boardId},
          item_id: ${taskId},
          column_id: "${statusColumn.id}",
          value: "{\\"index\\": ${doneIndex}}"
        ) {
          id
        }
      }
    `;
    
    await mondayQuery(updateQuery);
    
    // Send confirmation message
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: userId,
      text: `✅ Task marked as complete in Monday.com!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *Task completed!*\nYour task has been marked as "Done" in Monday.com.'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Undo'
              },
              action_id: `task_action_undo_${taskId}_${boardId}`,
              style: 'danger'
            }
          ]
        }
      ]
    });
    
    // Refresh the main message
    await refreshTaskList(userId, client);
    
  } catch (error) {
    console.error('Error completing task:', error);
    throw error;
  }
}

// Handle task update (opens modal)
async function handleUpdateTask(taskId, boardId, userId, client, body) {
  try {
    // Get current task data
    const taskQuery = `
      query {
        items(ids: [${taskId}]) {
          id
          name
          column_values {
            id
            text
            value
            type
          }
        }
      }
    `;
    
    const taskData = await mondayQuery(taskQuery);
    const task = taskData.items[0];
    
    // Get board columns
    const boardQuery = `
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
    
    const boardData = await mondayQuery(boardQuery);
    const columns = boardData.boards[0].columns;
    
    // Build modal blocks
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Update Task:* ${task.name}`
        }
      },
      {
        type: 'divider'
      }
    ];
    
    // Add status dropdown
    const statusColumn = columns.find(c => c.type === 'status');
    if (statusColumn) {
      const settings = JSON.parse(statusColumn.settings_str || '{}');
      const options = Object.entries(settings.labels || {}).map(([index, label]) => ({
        text: {
          type: 'plain_text',
          text: label
        },
        value: `${statusColumn.id}:${index}`
      }));
      
      blocks.push({
        type: 'input',
        block_id: 'status_block',
        element: {
          type: 'static_select',
          action_id: 'status_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select status'
          },
          options: options
        },
        label: {
          type: 'plain_text',
          text: 'Status'
        },
        optional: true
      });
    }
    
    // Add date picker
    const dateColumn = columns.find(c => c.type === 'date');
    if (dateColumn) {
      const currentDate = task.column_values.find(cv => cv.id === dateColumn.id);
      const dateValue = currentDate?.value ? JSON.parse(currentDate.value).date : null;
      
      blocks.push({
        type: 'input',
        block_id: 'date_block',
        element: {
          type: 'datepicker',
          action_id: 'date_select',
          initial_date: dateValue || undefined,
          placeholder: {
            type: 'plain_text',
            text: 'Select a date'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Due Date'
        },
        optional: true
      });
    }
    
    // Add notes field
    blocks.push({
      type: 'input',
      block_id: 'notes_block',
      element: {
        type: 'plain_text_input',
        action_id: 'notes_input',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: 'Add a note or comment...'
        }
      },
      label: {
        type: 'plain_text',
        text: 'Add Note'
      },
      optional: true
    });
    
    // Open modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: `update_task_modal_${taskId}_${boardId}`,
        title: {
          type: 'plain_text',
          text: 'Update Task'
        },
        submit: {
          type: 'plain_text',
          text: 'Save'
        },
        close: {
          type: 'plain_text',
          text: 'Cancel'
        },
        blocks: blocks
      }
    });
    
  } catch (error) {
    console.error('Error opening update modal:', error);
    throw error;
  }
}

// Handle modal submission
app.view(/^update_task_modal_.*/, async ({ ack, body, view, client }) => {
  await ack();
  
  try {
    const [_, __, ___, taskId, boardId] = view.callback_id.split('_');
    const userId = body.user.id;
    
    const values = view.state.values;
    const updates = [];
    
    // Get board info
    const boardQuery = `
      query {
        boards(ids: [${boardId}]) {
          columns {
            id
            type
          }
        }
      }
    `;
    
    const boardData = await mondayQuery(boardQuery);
    const columns = boardData.boards[0].columns;
    
    // Process status update
    if (values.status_block?.status_select?.selected_option) {
      const [columnId, statusIndex] = values.status_block.status_select.selected_option.value.split(':');
      updates.push({
        columnId,
        value: `{"index": ${statusIndex}}`
      });
    }
    
    // Process date update
    if (values.date_block?.date_select?.selected_date) {
      const dateColumn = columns.find(c => c.type === 'date');
      if (dateColumn) {
        updates.push({
          columnId: dateColumn.id,
          value: `{"date": "${values.date_block.date_select.selected_date}"}`
        });
      }
    }
    
    // Process notes
    const notes = values.notes_block?.notes_input?.value;
    if (notes) {
      const createUpdateQuery = `
        mutation {
          create_update(
            item_id: ${taskId},
            body: "${notes.replace(/"/g, '\\"')}"
          ) {
            id
          }
        }
      `;
      await mondayQuery(createUpdateQuery);
    }
    
    // Apply all column updates
    for (const update of updates) {
      const updateQuery = `
        mutation {
          change_column_value(
            board_id: ${boardId},
            item_id: ${taskId},
            column_id: "${update.columnId}",
            value: "${update.value.replace(/"/g, '\\"')}"
          ) {
            id
          }
        }
      `;
      await mondayQuery(updateQuery);
    }
    
    // Send confirmation
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: userId,
      text: '✅ Task updated successfully in Monday.com!'
    });
    
    // Refresh task list
    await refreshTaskList(userId, client);
    
  } catch (error) {
    console.error('Error processing modal submission:', error);
  }
});

// Handle postpone task (adds 1 day to due date)
async function handlePostponeTask(taskId, boardId, userId, client, body) {
  try {
    // Get current task date
    const taskQuery = `
      query {
        items(ids: [${taskId}]) {
          column_values {
            id
            value
            type
          }
        }
      }
    `;
    
    const taskData = await mondayQuery(taskQuery);
    const dateColumnValue = taskData.items[0].column_values.find(cv => cv.type === 'date');
    
    if (!dateColumnValue || !dateColumnValue.value) {
      throw new Error('No due date found on this task');
    }
    
    const currentDate = JSON.parse(dateColumnValue.value).date;
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    const newDateStr = newDate.toISOString().split('T')[0];
    
    // Update date
    const updateQuery = `
      mutation {
        change_column_value(
          board_id: ${boardId},
          item_id: ${taskId},
          column_id: "${dateColumnValue.id}",
          value: "{\\"date\\": \\"${newDateStr}\\"}"
        ) {
          id
        }
      }
    `;
    
    await mondayQuery(updateQuery);
    
    // Send confirmation
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: userId,
      text: `📅 Task postponed to ${newDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    });
    
    // Refresh task list
    await refreshTaskList(userId, client);
    
  } catch (error) {
    console.error('Error postponing task:', error);
    throw error;
  }
}

// Handle view task details
async function handleViewTask(taskId, boardId, userId, client, body) {
  try {
    // Get full task details
    const taskQuery = `
      query {
        items(ids: [${taskId}]) {
          id
          name
          created_at
          updated_at
          creator {
            name
          }
          column_values {
            id
            text
            value
            type
            ... on StatusValue {
              label
            }
          }
          updates {
            id
            body
            created_at
            creator {
              name
            }
          }
        }
      }
    `;
    
    const taskData = await mondayQuery(taskQuery);
    const task = taskData.items[0];
    
    // Build detailed view
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: task.name
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Created:*\n${new Date(task.created_at).toLocaleDateString()}`
          },
          {
            type: 'mrkdwn',
            text: `*Creator:*\n${task.creator?.name || 'Unknown'}`
          }
        ]
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Column Values:*'
        }
      }
    ];
    
    // Add column values
    task.column_values.filter(cv => cv.text).forEach(cv => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ${cv.text}`
        }
      });
    });
    
    // Add recent updates
    if (task.updates && task.updates.length > 0) {
      blocks.push(
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Recent Updates:*'
          }
        }
      );
      
      task.updates.slice(0, 3).forEach(update => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${update.creator?.name}* - ${new Date(update.created_at).toLocaleDateString()}\n${update.body}`
          }
        });
      });
    }
    
    // Add action button to open in Monday.com
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Open in Monday.com'
          },
          url: `https://drexcorp-company.monday.com/boards/${boardId}/pulses/${taskId}`,
          style: 'primary'
        }
      ]
    });
    
    // Send ephemeral message with details
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: userId,
      blocks: blocks,
      text: `Details for task: ${task.name}`
    });
    
  } catch (error) {
    console.error('Error viewing task:', error);
    throw error;
  }
}

// Refresh task list (triggers a re-send of the automation)
async function refreshTaskList(userId, client) {
  // This would typically trigger the main automation
  // For now, just send a confirmation
  console.log(`Refreshing task list for user ${userId}`);
  // In production, you'd call the main automation function here
}

// ============================================
// SLACK SLASH COMMANDS
// ============================================

// /tasks - Show task list
app.command('/tasks', async ({ command, ack, client }) => {
  await ack();
  
  try {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '🔄 Fetching your tasks from Monday.com...'
    });
    
    // Trigger automation for this specific user
    // This would call your main automation function
    
  } catch (error) {
    console.error('Error handling /tasks command:', error);
  }
});

// /task-complete [task name] - Mark task as complete
app.command('/task-complete', async ({ command, ack, client }) => {
  await ack();
  
  const taskName = command.text.trim();
  
  if (!taskName) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '❌ Please provide a task name: `/task-complete Task Name`'
    });
    return;
  }
  
  // Search for task and mark complete
  // Implementation would search Monday.com for matching task
  
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: `✅ Marking "${taskName}" as complete...`
  });
});

// ============================================
// HEALTH CHECK & START SERVER
// ============================================

receiver.app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

receiver.app.get('/', (req, res) => {
  res.json({ 
    message: 'Monday.com → Slack Automation Server',
    status: 'running',
    endpoints: {
      health: '/health',
      slack_events: '/slack/events'
    }
  });
});

// Start server
(async () => {
  await app.start(PORT);
  console.log(`⚡️ Slack interactive server running on port ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/slack/events`);
})();

module.exports = { app, receiver };