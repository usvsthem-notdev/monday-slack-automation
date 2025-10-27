require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');
const express = require('express');
const path = require('path');
const os = require('os');
const { initializeSlackCommands, prewarmCache } = require('./slackCommands');
const { registerTasksCommand } = require('./tasksCommand');
const { handleWebhook } = require('./webhookHandler');
const { formatSlackMessage } = require('./messageFormatter');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const TEST_MODE = process.env.TEST_MODE === 'true';
const PORT = process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const slack = new WebClient(SLACK_BOT_TOKEN);
const receiver = new ExpressReceiver({ signingSecret: SLACK_SIGNING_SECRET });

receiver.app.use(express.json());
receiver.app.use(express.static(path.join(__dirname, '../public')));

const slackApp = new App({ token: SLACK_BOT_TOKEN, receiver });
const mondayAxios = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: { 'Authorization': MONDAY_API_KEY, 'Content-Type': 'application/json' }
});

const messageStore = new Map();
const taskMetadata = new Map(); // Store task metadata for interactive components
const metrics = {
  usersProcessed: 0, usersSkipped: 0, tasksFound: 0, messagesUpdated: 0,
  messagesSent: 0, errors: 0, webhooksReceived: 0, notificationsSent: 0,
  startTime: new Date(), lastRun: null, requestCount: 0, totalRequestDuration: 0
};

const logger = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', message: msg, data, timestamp: new Date().toISOString() })),
  warn: (msg, data = {}) => console.log(JSON.stringify({ level: 'warn', message: msg, data, timestamp: new Date().toISOString() })),
  error: (msg, error = {}) => console.error(JSON.stringify({ level: 'error', message: msg, error: error.message || error, stack: error.stack, timestamp: new Date().toISOString() })),
  success: (msg, data = {}) => console.log(JSON.stringify({ level: 'success', message: msg, data, timestamp: new Date().toISOString() }))
};

const QUERIES = {
  getUsers: `query { users { id name email enabled is_guest } }`,
  getBoardsByWorkspace: (workspaceId) => `query { boards(workspace_ids: [${workspaceId}], limit: 50) { id name columns { id title type settings_str } } }`,
  getBoardItems: (boardId) => `query { boards(ids: [${boardId}]) { items_page(limit: 100) { items { id name created_at updated_at column_values { id text value type } } } } }`
};

// Helper function to get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function mondayQuery(query) {
  try {
    const response = await mondayAxios.post('', { query });
    if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
    return response.data.data;
  } catch (error) {
    logger.error('Monday.com API error', error);
    throw error;
  }
}

async function getActiveUsers() {
  const data = await mondayQuery(QUERIES.getUsers);
  let users = data.users.filter(u => u.enabled && !u.is_guest && u.email);
  if (TEST_MODE) users = users.filter(u => u.id === '89455577');
  return users;
}

async function getAllBoards() {
  const workspaceIds = [12742680, 12691809, 12666498];
  const allBoards = [];
  for (const workspaceId of workspaceIds) {
    const data = await mondayQuery(QUERIES.getBoardsByWorkspace(workspaceId));
    allBoards.push(...data.boards);
    await delay(500);
  }
  return allBoards;
}

async function getUserTasksFromBoard(board, userId) {
  try {
    const statusColumn = board.columns.find(c => c.type === 'status');
    const peopleColumn = board.columns.find(c => c.type === 'people');
    const dateColumn = board.columns.find(c => c.type === 'date');
    if (!statusColumn || !peopleColumn) return [];
    
    const data = await mondayQuery(QUERIES.getBoardItems(board.id));
    const items = data.boards[0]?.items_page?.items || [];
    
    const userTasks = items.filter(item => {
      const peopleValue = item.column_values.find(cv => cv.id === peopleColumn.id);
      if (!peopleValue || !peopleValue.value) return false;
      const peopleData = JSON.parse(peopleValue.value || '{}');
      const isAssignedToUser = peopleData.personsAndTeams?.some(p => p.id === parseInt(userId) && p.kind === 'person');
      if (!isAssignedToUser) return false;
      const statusValue = item.column_values.find(cv => cv.id === statusColumn.id);
      if (!statusValue) return true;
      const statusData = JSON.parse(statusValue.value || '{}');
      const statusSettings = JSON.parse(statusColumn.settings_str || '{}');
      const doneColors = statusSettings.done_colors || [1];
      return !doneColors.includes(statusData.index);
    });
    
    return userTasks.map(task => {
      const dateValue = task.column_values.find(cv => cv.id === dateColumn?.id);
      const dateData = dateValue ? JSON.parse(dateValue.value || '{}') : {};
      return {
        id: task.id,
        name: task.name,
        boardName: board.name,
        boardId: board.id,
        dueDate: dateData.date || null,
        status: task.column_values.find(cv => cv.id === statusColumn.id)?.text || 'No Status'
      };
    });
  } catch (error) {
    logger.error(`Error fetching tasks from board ${board.name}`, error);
    return [];
  }
}

function organizeTasks(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneWeekFromNow = new Date(today);
  oneWeekFromNow.setDate(today.getDate() + 7);
  const categorized = { overdue: [], dueToday: [], upcoming: [], noDueDate: [] };
  tasks.forEach(task => {
    if (!task.dueDate) {
      categorized.noDueDate.push(task);
      return;
    }
    const taskDate = new Date(task.dueDate);
    taskDate.setHours(0, 0, 0, 0);
    if (taskDate < today) categorized.overdue.push(task);
    else if (taskDate.getTime() === today.getTime()) categorized.dueToday.push(task);
    else if (taskDate <= oneWeekFromNow) categorized.upcoming.push(task);
    else categorized.noDueDate.push(task);
  });
  const sortByDate = (a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  };
  categorized.overdue.sort(sortByDate);
  categorized.dueToday.sort(sortByDate);
  categorized.upcoming.sort(sortByDate);
  return categorized;
}

async function sendOrUpdateSlackMessage(user, slackMessage) {
  try {
    const slackUserResponse = await slack.users.lookupByEmail({ email: user.email });
    const slackUserId = slackUserResponse.user.id;
    const dmResponse = await slack.conversations.open({ users: slackUserId });
    const channelId = dmResponse.channel.id;
    const today = new Date().toDateString();
    const storeKey = `${user.id}-${today}`;
    const storedMessage = messageStore.get(storeKey);
    
    if (storedMessage && storedMessage.channelId === channelId) {
      await slack.chat.update({ channel: channelId, ts: storedMessage.messageTs, blocks: slackMessage.blocks, text: `${user.name}'s Tasks` });
      metrics.messagesUpdated++;
    } else {
      const response = await slack.chat.postMessage({ channel: channelId, blocks: slackMessage.blocks, text: `${user.name}'s Tasks` });
      messageStore.set(storeKey, { channelId, messageTs: response.ts, date: today, lastUpdated: new Date().toISOString() });
      metrics.messagesSent++;
    }
  } catch (error) {
    if (error.data?.error === 'users_not_found' || error.data?.error === 'account_inactive') {
      metrics.usersSkipped++;
      return;
    }
    throw error;
  }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAutomation() {
  logger.info('🚀 Starting daily task automation');
  metrics.usersProcessed = 0;
  metrics.usersSkipped = 0;
  metrics.tasksFound = 0;
  metrics.messagesUpdated = 0;
  metrics.messagesSent = 0;
  metrics.errors = 0;
  metrics.startTime = new Date();
  
  try {
    const users = await getActiveUsers();
    const boards = await getAllBoards();
    for (const user of users) {
      try {
        let allUserTasks = [];
        for (const board of boards) {
          const tasks = await getUserTasksFromBoard(board, user.id);
          allUserTasks.push(...tasks);
          await delay(300);
        }
        metrics.tasksFound += allUserTasks.length;
        const organizedTasks = organizeTasks(allUserTasks);
        const slackMessage = formatSlackMessage(organizedTasks, user.name);
        await sendOrUpdateSlackMessage(user, slackMessage);
        metrics.usersProcessed++;
        await delay(1000);
      } catch (userError) {
        metrics.errors++;
        logger.error(`Failed to process user ${user.name}`, userError);
      }
    }
    const duration = (new Date() - metrics.startTime) / 1000;
    metrics.lastRun = new Date().toISOString();
    logger.success('✅ Daily automation completed', { ...metrics, durationSeconds: duration.toFixed(2) });
    return metrics;
  } catch (error) {
    logger.error('❌ Automation failed', error);
    metrics.lastRun = new Date().toISOString();
    throw error;
  }
}

// ============================================
// SLACK INTERACTIVE COMPONENTS (from server.js)
// ============================================

// Handle button clicks for task actions - ULTRA FAST ACK
slackApp.action(/^task_action_.*/, ({ action, ack, body, client }) => {
  // CRITICAL: Call ack() synchronously and IMMEDIATELY
  const ackPromise = ack();
  
  // Process action in background without blocking
  process.nextTick(async () => {
    try {
      const [_, actionType, taskId, boardId] = action.action_id.split('_');
      const userId = body.user.id;
      
      logger.info(`[BUTTON] User ${userId} triggered ${actionType} on task ${taskId}`);
      
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
          logger.warn(`Unknown action: ${actionType}`);
      }
    } catch (error) {
      logger.error('[BUTTON ERROR] Error handling button click', error);
      try {
        await client.chat.postEphemeral({
          channel: body.channel?.id || body.user.id,
          user: body.user.id,
          text: `❌ Error: ${error.message}`
        });
      } catch (notifyError) {
        logger.error('[BUTTON ERROR] Failed to send error notification', notifyError);
      }
    }
  });
  
  return ackPromise;
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
          value: "{\\\"index\\\": ${doneIndex}}"
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
            text: '✅ *Task completed!*\\nYour task has been marked as "Done" in Monday.com.'
          }
        }
      ]
    });
    
    await refreshTaskList(userId, client);
    
  } catch (error) {
    logger.error('Error completing task', error);
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
    logger.error('Error opening update modal', error);
    throw error;
  }
}

// Handle modal submission - ULTRA FAST ACK
slackApp.view(/^update_task_modal_.*/, ({ ack, body, view, client }) => {
  // CRITICAL: Acknowledge IMMEDIATELY
  const ackPromise = ack();
  
  // Process asynchronously
  process.nextTick(async () => {
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
      logger.error('[MODAL ERROR] Error processing modal submission', error);
    }
  });
  
  return ackPromise;
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
          value: "{\\\"date\\\": \\\"${newDateStr}\\\"}"
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
    logger.error('Error postponing task', error);
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
            text: `*Created:*\\n${new Date(task.created_at).toLocaleDateString()}`
          },
          {
            type: 'mrkdwn',
            text: `*Creator:*\\n${task.creator?.name || 'Unknown'}`
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
            text: `*${update.creator?.name}* - ${new Date(update.created_at).toLocaleDateString()}\\n${update.body}`
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
    logger.error('Error viewing task', error);
    throw error;
  }
}

function refreshTaskList(userId, client) {
  logger.info(`Refreshing task list for user ${userId}`);
  // This could trigger a refresh of the user's task list if needed
}

// ============================================
// ADDITIONAL SLACK COMMANDS (from server.js)
// ============================================

// /task-complete command
slackApp.command('/task-complete', async ({ command, ack, client }) => {
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
  
  logger.info('Task complete command received', { userId: command.user_id, taskName });
  
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: `✅ Marking "${taskName}" as complete...`
  });
});

// ============================================
// ENHANCED SERVER STARTUP FUNCTION
// ============================================

async function startServer() {
  let server;
  
  try {
    logger.info('🚀 Initializing Monday → Slack Automation Server...');
    
    // Initialize all Slack commands
    logger.info('📝 Registering Slack commands...');
    initializeSlackCommands(slackApp);
    registerTasksCommand(slackApp);
    logger.success('✅ Slack commands registered');
    
    // Add request logging middleware
    receiver.app.use((req, res, next) => {
      const start = Date.now();
      const method = req.method;
      const path = req.path;
      
      // Log request
      logger.info('HTTP Request', { method, path, ip: req.ip });
      
      // Track response
      res.on('finish', () => {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;
        const statusEmoji = statusCode >= 500 ? '❌' : statusCode >= 400 ? '⚠️' : '✅';
        
        metrics.requestCount++;
        metrics.totalRequestDuration += duration;
        
        logger.info('HTTP Response', {
          method,
          path,
          statusCode,
          duration: `${duration}ms`,
          emoji: statusEmoji
        });
      });
      
      next();
    });
    
    // Add enhanced health check endpoint with memory stats
    receiver.app.get('/health', (req, res) => {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const avgRequestDuration = metrics.requestCount > 0 
        ? (metrics.totalRequestDuration / metrics.requestCount).toFixed(2) 
        : 0;
      
      res.json({
        status: 'healthy',
        uptime: Math.floor(uptime),
        timestamp: new Date().toISOString(),
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
        },
        performance: {
          avgRequestDuration: `${avgRequestDuration}ms`,
          totalRequests: metrics.requestCount
        },
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          env: NODE_ENV
        },
        lastRun: metrics.lastRun,
        metrics: {
          ...metrics,
          uptime: Math.floor(uptime)
        }
      });
    });
    
    // Add error handling middleware
    receiver.app.use((err, req, res, next) => {
      logger.error('Express middleware error', err);
      metrics.errors++;
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: err.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Pre-warm the cache immediately on startup
    logger.info('🔥 Pre-warming Monday.com data cache...');
    await prewarmCache().catch(err => {
      logger.error('Failed to pre-warm cache on startup', err);
    });
    logger.success('✅ Cache pre-warmed successfully');
    
    // Set up periodic cache refresh (every 4 minutes to stay ahead of 5min TTL)
    logger.info('⏰ Setting up periodic cache refresh (every 4 minutes)...');
    const cacheRefreshInterval = setInterval(async () => {
      logger.info('🔄 Refreshing cache (periodic)...');
      await prewarmCache().catch(err => {
        logger.error('Failed to refresh cache', err);
      });
    }, 4 * 60 * 1000);
    
    // Start the Slack app
    logger.info(`🌐 Starting server on port ${PORT}...`);
    server = await slackApp.start(PORT);
    
    // Get local IP for network access
    const localIP = getLocalIP();
    
    // Print beautiful startup banner
    console.log('\n' + '='.repeat(70));
    console.log('🎉  SERVER STARTED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log(`\n📍 Local:      http://localhost:${PORT}`);
    console.log(`🌐 Network:    http://${localIP}:${PORT}`);
    console.log(`\n🔗 ENDPOINTS:`);
    console.log(`   • Root:        http://localhost:${PORT}/`);
    console.log(`   • Health:      http://localhost:${PORT}/health`);
    console.log(`   • Metrics:     http://localhost:${PORT}/metrics`);
    console.log(`   • Slack:       http://localhost:${PORT}/slack/events`);
    console.log(`   • Webhook:     http://localhost:${PORT}/webhook/monday`);
    console.log(`   • Trigger:     http://localhost:${PORT}/trigger`);
    console.log(`\n⚡ SLACK COMMANDS:`);
    console.log(`   • /tasks          - View your tasks`);
    console.log(`   • /create-task    - Create a new task`);
    console.log(`   • /quick-task     - Quick task creation`);
    console.log(`   • /monday-help    - Get help`);
    console.log(`   • /task-complete  - Mark task complete`);
    console.log(`\n✨ FEATURES:`);
    console.log(`   • Interactive task buttons`);
    console.log(`   • Task update modals`);
    console.log(`   • Monday.com webhooks`);
    console.log(`   • Automated notifications`);
    console.log(`   • Cache pre-warming (4min refresh)`);
    console.log(`   • Request logging & monitoring`);
    console.log(`   • Graceful shutdown handling`);
    console.log(`\n📊 ENVIRONMENT:`);
    console.log(`   • Node.js:     ${process.version}`);
    console.log(`   • Platform:    ${process.platform}`);
    console.log(`   • Mode:        ${NODE_ENV}`);
    console.log(`   • Test Mode:   ${TEST_MODE ? 'Enabled' : 'Disabled'}`);
    console.log('\n' + '='.repeat(70));
    console.log('💡 Press Ctrl+C to stop the server');
    console.log('='.repeat(70) + '\n');
    
    logger.success('⚡️ Server initialization complete');
    
    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`\n\n⚠️  Received ${signal} - Starting graceful shutdown...`);
      
      console.log('\n' + '='.repeat(70));
      console.log('🛑  SHUTTING DOWN SERVER...');
      console.log('='.repeat(70) + '\n');
      
      // Clear the cache refresh interval
      if (cacheRefreshInterval) {
        clearInterval(cacheRefreshInterval);
        logger.info('✅ Stopped cache refresh interval');
      }
      
      // Stop accepting new connections
      if (server && server.close) {
        logger.info('🔌 Closing server connections...');
        await new Promise((resolve) => {
          server.close((err) => {
            if (err) {
              logger.error('Error closing server', err);
            } else {
              logger.success('✅ Server connections closed');
            }
            resolve();
          });
        });
      }
      
      // Log final metrics
      const uptime = process.uptime();
      logger.info('📊 Final Server Statistics:', {
        uptime: `${Math.floor(uptime)}s`,
        totalRequests: metrics.requestCount,
        webhooksReceived: metrics.webhooksReceived,
        messagesSent: metrics.messagesSent,
        errors: metrics.errors
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('✅  SERVER SHUTDOWN COMPLETE');
      console.log('='.repeat(70) + '\n');
      
      process.exit(0);
    };
    
    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('❌ Uncaught Exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('❌ Unhandled Rejection', { reason, promise });
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server', error);
    console.error('\n' + '='.repeat(70));
    console.error('❌  SERVER STARTUP FAILED!');
    console.error('='.repeat(70));
    console.error(`\nError: ${error.message}`);
    console.error(`\nStack: ${error.stack}`);
    console.error('\n' + '='.repeat(70) + '\n');
    process.exit(1);
  }
}

// ============================================
// WEBHOOK AND API ENDPOINTS
// ============================================

receiver.app.post('/webhook/monday', async (req, res) => {
  metrics.webhooksReceived++;
  try {
    await handleWebhook(req, res);
    metrics.notificationsSent++;
  } catch (error) {
    logger.error('Webhook error', error);
    metrics.errors++;
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

receiver.app.post('/trigger', async (req, res) => {
  res.json({ status: 'triggered', timestamp: new Date().toISOString() });
  runAutomation().catch(error => logger.error('Trigger failed', error));
});

receiver.app.get('/', (req, res) => res.json({ 
  message: 'Monday → Slack Automation', 
  version: '4.10.0-enhanced-monitoring', 
  status: 'running', 
  lastRun: metrics.lastRun,
  uptime: Math.floor(process.uptime()),
  endpoints: {
    health: '/health',
    slack_events: '/slack/events',
    monday_webhook: '/webhook/monday',
    trigger: '/trigger',
    metrics: '/metrics'
  },
  commands: [
    '/tasks',
    '/create-task', 
    '/quick-task',
    '/monday-help',
    '/task-complete'
  ],
  features: [
    'Interactive task buttons',
    'Task update modals',
    'Monday.com webhooks',
    'Automated task notifications',
    'Cache pre-warming on startup',
    'Periodic cache refresh (4min)',
    'Request logging & monitoring',
    'Enhanced health checks',
    'Graceful shutdown handling'
  ]
}));

receiver.app.get('/metrics', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const avgRequestDuration = metrics.requestCount > 0 
    ? (metrics.totalRequestDuration / metrics.requestCount).toFixed(2) 
    : 0;
  
  res.json({ 
    ...metrics,
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    performance: {
      avgRequestDuration: `${avgRequestDuration}ms`,
      totalRequests: metrics.requestCount
    },
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    }
  });
});

startServer();