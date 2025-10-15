require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');
const { handleWebhook } = require('./webhookHandler');

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

// Add body parser middleware for webhooks
receiver.app.use('/webhook/monday', require('express').json());

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
// MONDAY.COM WEBHOOK ENDPOINT
// ============================================

// Monday.com webhook endpoint for task assignments
receiver.app.post('/webhook/monday', handleWebhook);

console.log('✅ Monday.com webhook endpoint registered at POST /webhook/monday');

// ============================================
// SLACK INTERACTIVE COMPONENTS
// ============================================

// Handle button clicks for task actions - ACK IMMEDIATELY
app.action(/^task_action_.*/, async ({ action, ack, body, client }) => {
  // CRITICAL: Acknowledge IMMEDIATELY - no await, no delays
  ack();
  
  // Now process the action asynchronously
  setImmediate(async () => {
    try {
      const [_, actionType, taskId, boardId] = action.action_id.split('_');
      const userId = body.user.id;
      
      console.log(`[BUTTON] User ${userId} triggered ${actionType} on task ${taskId}`);
      
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
      console.error('[BUTTON ERROR] Error handling button click:', error);
      try {
        await client.chat.postEphemeral({
          channel: body.channel?.id || body.user.id,
          user: body.user.id,
          text: `❌ Error: ${error.message}`
        });
      } catch (notifyError) {
        console.error('[BUTTON ERROR] Failed to send error notification:', notifyError);
      }
    }
  });
});

// Handle task completion
async function handleCompleteTask(taskId, boardId, userId, client, body) {
  try {
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
    
    await client.chat.postEphemeral({
      channel: body.channel?.id || body.user.id,
      user: userId,
      text: `✅ Task marked as complete in Monday.com!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *Task completed!*\nYour task has been marked as "Done" in Monday.com.'
          }
        }
      ]
    });
    
    await refreshTaskList(userId, client);
    
  } catch (error) {
    console.error('Error completing task:', error);
    throw error;
  }
}

// Handle task update (opens modal)
async function handleUpdateTask(taskId, boardId, userId, client, body) {
  try {
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

// Handle modal submission - ACK IMMEDIATELY
app.view(/^update_task_modal_.*/, async ({ ack, body, view, client }) => {
  // CRITICAL: Acknowledge IMMEDIATELY
  ack();
  
  // Process asynchronously
  setImmediate(async () => {
    try {
      const [_, __, ___, taskId, boardId] = view.callback_id.split('_');
      const userId = body.user.id;
      
      const values = view.state.values;
      const updates = [];
      
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
      
      if (values.status_block?.status_select?.selected_option) {
        const [columnId, statusIndex] = values.status_block.status_select.selected_option.value.split(':');
        updates.push({
          columnId,
          value: `{"index": ${statusIndex}}`
        });
      }
      
      if (values.date_block?.date_select?.selected_date) {
        const dateColumn = columns.find(c => c.type === 'date');
        if (dateColumn) {
          updates.push({
            columnId: dateColumn.id,
            value: `{"date": "${values.date_block.date_select.selected_date}"}`
          });
        }
      }
      
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
      
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: userId,
        text: '✅ Task updated successfully in Monday.com!'
      });
      
      await refreshTaskList(userId, client);
      
    } catch (error) {
      console.error('[MODAL ERROR] Error processing modal submission:', error);
    }
  });
});

// Handle postpone task
async function handlePostponeTask(taskId, boardId, userId, client, body) {
  try {
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
    
    await client.chat.postEphemeral({
      channel: body.channel?.id || body.user.id,
      user: userId,
      text: `📅 Task postponed to ${newDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    });
    
    await refreshTaskList(userId, client);
    
  } catch (error) {
    console.error('Error postponing task:', error);
    throw error;
  }
}

// Handle view task details
async function handleViewTask(taskId, boardId, userId, client, body) {
  try {
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
      }
    ];
    
    task.column_values.filter(cv => cv.text).forEach(cv => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ${cv.text}`
        }
      });
    });
    
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
    
    await client.chat.postEphemeral({
      channel: body.channel?.id || body.user.id,
      user: userId,
      blocks: blocks,
      text: `Details for task: ${task.name}`
    });
    
  } catch (error) {
    console.error('Error viewing task:', error);
    throw error;
  }
}

function refreshTaskList(userId, client) {
  console.log(`Refreshing task list for user ${userId}`);
}

// ============================================
// SLACK SLASH COMMANDS
// ============================================

app.command('/tasks', async ({ command, ack, client }) => {
  await ack();
  
  try {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '🔄 Fetching your tasks from Monday.com...'
    });
  } catch (error) {
    console.error('Error handling /tasks command:', error);
  }
});

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
    version: '4.9.0-hotfix',
    endpoints: {
      health: '/health',
      slack_events: '/slack/events',
      monday_webhook: '/webhook/monday'
    }
  });
});

// Start server
(async () => {
  try {
    await app.start({ port: PORT, host: '0.0.0.0' });
    console.log(`⚡️ Slack interactive server running on port ${PORT}`);
    console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
    console.log(`📡 Slack events: /slack/events`);
    console.log(`🔔 Monday webhook: /webhook/monday`);
    console.log(`✅ Server started successfully`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();

module.exports = { app, receiver };
