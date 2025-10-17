require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');
const express = require('express');
const path = require('path');
const { initializeSlackCommands } = require('./slackCommands');
const { registerTasksCommand } = require('./tasksCommand');
const { handleWebhook } = require('./webhookHandler');
const { formatSlackMessage } = require('./messageFormatter');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const TEST_MODE = process.env.TEST_MODE === 'true';
const PORT = process.env.PORT || 10000;

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
const metrics = {
  usersProcessed: 0, usersSkipped: 0, tasksFound: 0, messagesUpdated: 0,
  messagesSent: 0, errors: 0, webhooksReceived: 0, notificationsSent: 0,
  startTime: new Date(), lastRun: null
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
  logger.info('🚀 Starting automation');
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
    logger.success('✅ Automation completed', { ...metrics, durationSeconds: duration.toFixed(2) });
    return metrics;
  } catch (error) {
    logger.error('❌ Automation failed', error);
    metrics.lastRun = new Date().toISOString();
    throw error;
  }
}

async function startServer() {
  try {
    initializeSlackCommands(slackApp);
    registerTasksCommand(slackApp);
    await slackApp.start(PORT);
    logger.success(`⚡️ Server running on port ${PORT}`);
    logger.success('✅ Commands: /create-task, /quick-task, /monday-help, /tasks');
  } catch (error) {
    logger.error('❌ Failed to start', error);
    process.exit(1);
  }
}

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

receiver.app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), lastRun: metrics.lastRun, metrics }));
receiver.app.get('/', (req, res) => res.json({ message: 'Monday → Slack Automation', version: '4.7.0', status: 'running', lastRun: metrics.lastRun }));
receiver.app.get('/metrics', (req, res) => res.json({ ...metrics, uptime: process.uptime(), timestamp: new Date().toISOString() }));

startServer();
