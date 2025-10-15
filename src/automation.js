require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');
const { initializeSlackCommands } = require('./slackCommands');
const { handleWebhook } = require('./webhookHandler');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const TEST_MODE = process.env.TEST_MODE === 'true';
const PORT = process.env.PORT || 10000;

// Initialize Slack clients
const slack = new WebClient(SLACK_BOT_TOKEN);

// Create ExpressReceiver to have direct access to Express app
const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET
});

// Initialize Slack Bolt App with custom receiver
const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  receiver: receiver
});

const mondayAxios = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: {
    'Authorization': MONDAY_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Message store - In-memory cache (resets on restart)
const messageStore = new Map();

// Metrics
const metrics = {
  usersProcessed: 0,
  usersSkipped: 0,
  tasksFound: 0,
  messagesUpdated: 0,
  messagesSent: 0,
  errors: 0,
  webhooksReceived: 0,
  notificationsSent: 0,
  startTime: new Date(),
  lastRun: null
};

// Logger
const logger = {
  info: (msg, data = {}) => {
    console.log(JSON.stringify({ 
      level: 'info', 
      message: msg, 
      data, 
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
  success: (msg, data = {}) => {
    console.log(JSON.stringify({ 
      level: 'success', 
      message: msg, 
      data, 
      timestamp: new Date().toISOString() 
    }));
  }
};

// Monday.com GraphQL queries
const QUERIES = {
  getUsers: `
    query {
      users {
        id
        name
        email
        enabled
        is_guest
      }
    }
  `,
  
  getBoardsByWorkspace: (workspaceId) => `
    query {
      boards(workspace_ids: [${workspaceId}], limit: 50) {
        id
        name
        columns {
          id
          title
          type
          settings_str
        }
      }
    }
  `,
  
  getBoardItems: (boardId) => `
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 100) {
          cursor
          items {
            id
            name
            created_at
            updated_at
            column_values {
              id
              text
              value
              type
            }
          }
        }
      }
    }
  `
};

// Monday.com API helper
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

// Get all active users
async function getActiveUsers() {
  const data = await mondayQuery(QUERIES.getUsers);
  let users = data.users.filter(u => u.enabled && !u.is_guest && u.email);
  
  if (TEST_MODE) {
    logger.info('TEST MODE: Using only Connor Drexler');
    users = users.filter(u => u.id === '89455577');
  }
  
  return users;
}

// Get all boards from all workspaces
async function getAllBoards() {
  const workspaceIds = [12742680, 12691809, 12666498];
  const allBoards = [];
  
  for (const workspaceId of workspaceIds) {
    const data = await mondayQuery(QUERIES.getBoardsByWorkspace(workspaceId));
    allBoards.push(...data.boards);
    await delay(500);
  }
  
  logger.info(`Found ${allBoards.length} boards across ${workspaceIds.length} workspaces`);
  return allBoards;
}

// Get incomplete tasks for a user on a specific board
async function getUserTasksFromBoard(board, userId) {
  try {
    const statusColumn = board.columns.find(c => c.type === 'status');
    const peopleColumn = board.columns.find(c => c.type === 'people');
    const dateColumn = board.columns.find(c => c.type === 'date');
    
    if (!statusColumn || !peopleColumn) {
      return [];
    }
    
    const data = await mondayQuery(QUERIES.getBoardItems(board.id));
    const items = data.boards[0]?.items_page?.items || [];
    
    const userTasks = items.filter(item => {
      const peopleValue = item.column_values.find(cv => cv.id === peopleColumn.id);
      if (!peopleValue || !peopleValue.value) return false;
      
      const peopleData = JSON.parse(peopleValue.value || '{}');
      const isAssignedToUser = peopleData.personsAndTeams?.some(p => 
        p.id === parseInt(userId) && p.kind === 'person'
      );
      
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
        status: task.column_values.find(cv => cv.id === statusColumn.id)?.text || 'No Status',
        createdAt: task.created_at
      };
    });
  } catch (error) {
    logger.error(`Error fetching tasks from board ${board.name}`, error);
    return [];
  }
}

// Organize tasks by date categories
function organizeTasks(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const oneWeekFromNow = new Date(today);
  oneWeekFromNow.setDate(today.getDate() + 7);
  
  const categorized = {
    overdue: [],
    dueToday: [],
    upcoming: [],
    noDueDate: []
  };
  
  tasks.forEach(task => {
    if (!task.dueDate) {
      categorized.noDueDate.push(task);
      return;
    }
    
    const taskDate = new Date(task.dueDate);
    taskDate.setHours(0, 0, 0, 0);
    
    if (taskDate < today) {
      categorized.overdue.push(task);
    } else if (taskDate.getTime() === today.getTime()) {
      categorized.dueToday.push(task);
    } else if (taskDate <= oneWeekFromNow) {
      categorized.upcoming.push(task);
    } else {
      categorized.noDueDate.push(task);
    }
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

// Format Slack message
function formatSlackMessage(tasks, userName) {
  const now = new Date();
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 ${userName}'s Tasks for Today`,
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*Updated:* ${now.toLocaleString('en-US')}`
      }]
    },
    { type: 'divider' }
  ];
  
  if (tasks.overdue.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔴 Overdue (${tasks.overdue.length})*`
      }
    });
    
    tasks.overdue.slice(0, 5).forEach(task => {
      const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${task.name}*\n📅 ${dueDate} | 📍 ${task.boardName}`
        }
      });
    });
  }
  
  if (tasks.dueToday.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🟡 Due Today (${tasks.dueToday.length})*`
      }
    });
    
    tasks.dueToday.forEach(task => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${task.name}*\n📍 ${task.boardName}`
        }
      });
    });
  }
  
  if (tasks.upcoming.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🟢 Upcoming This Week (${tasks.upcoming.length})*`
      }
    });
    
    tasks.upcoming.slice(0, 5).forEach(task => {
      const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${task.name}*\n📅 ${dueDate} | 📍 ${task.boardName}`
        }
      });
    });
  }
  
  if (tasks.overdue.length === 0 && tasks.dueToday.length === 0 && tasks.upcoming.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✨ *No tasks due this week!*'
      }
    });
  }
  
  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [{
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📱 Open Monday.com',
          emoji: true
        },
        url: 'https://drexcorp-company.monday.com',
        style: 'primary'
      }]
    }
  );
  
  return { blocks };
}

// Send or update Slack message
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
      await slack.chat.update({
        channel: channelId,
        ts: storedMessage.messageTs,
        blocks: slackMessage.blocks,
        text: `${user.name}'s Tasks for Today`
      });
      
      metrics.messagesUpdated++;
      logger.success(`Updated message for ${user.name}`, { channelId });
    } else {
      const response = await slack.chat.postMessage({
        channel: channelId,
        blocks: slackMessage.blocks,
        text: `${user.name}'s Tasks for Today`
      });
      
      messageStore.set(storeKey, {
        channelId: channelId,
        messageTs: response.ts,
        date: today,
        lastUpdated: new Date().toISOString()
      });
      
      metrics.messagesSent++;
      logger.success(`Sent new message to ${user.name}`, { channelId });
    }
    
  } catch (error) {
    if (error.data?.error === 'users_not_found') {
      logger.warn(`Slack user not found for ${user.name} (${user.email}) - Skipping`, {
        userId: user.id,
        email: user.email
      });
      metrics.usersSkipped++;
      return;
    }
    
    if (error.data?.error === 'account_inactive' || 
        error.data?.error === 'invalid_email' ||
        error.data?.error === 'user_disabled') {
      logger.warn(`Slack account issue for ${user.name}: ${error.data.error} - Skipping`, {
        userId: user.id,
        email: user.email
      });
      metrics.usersSkipped++; 
      return;
    }
    
    logger.error(`Failed to send Slack message to ${user.name}`, error);
    throw error;
  }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main automation function
async function runAutomation() {
  logger.info('🚀 Starting Monday.com → Slack automation');
  
  metrics.usersProcessed = 0;
  metrics.usersSkipped = 0;
  metrics.tasksFound = 0;
  metrics.messagesUpdated = 0;
  metrics.messagesSent = 0;
  metrics.errors = 0;
  metrics.startTime = new Date();
  
  try {
    logger.info('Fetching users...');
    const users = await getActiveUsers();
    logger.info(`Found ${users.length} active users`);
    
    logger.info('Fetching boards...');
    const boards = await getAllBoards();
    
    for (const user of users) {
      try {
        logger.info(`Processing user: ${user.name} (${user.email})`);
        
        let allUserTasks = [];
        
        for (const board of boards) {
          const tasks = await getUserTasksFromBoard(board, user.id);
          allUserTasks.push(...tasks);
          await delay(300);
        }
        
        metrics.tasksFound += allUserTasks.length;
        logger.info(`Found ${allUserTasks.length} tasks for ${user.name}`);
        
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
    logger.success('✅ Automation completed', {
      ...metrics,
      durationSeconds: duration.toFixed(2)
    });
    
    return metrics;
    
  } catch (error) {
    logger.error('❌ Automation failed', error);
    metrics.lastRun = new Date().toISOString();
    throw error;
  }
}

// ============================================
// START SERVER - NO AUTOMATION ON STARTUP
// ============================================

async function startServer() {
  try {
    // Initialize Slack commands
    logger.info('Initializing Slack commands...');
    initializeSlackCommands(slackApp);
    
    // DO NOT run automation on startup - wait for scheduled trigger
    logger.info('⏰ Automation will run on scheduled trigger (9 AM EST weekdays)');
    logger.info('💡 Manual trigger available at POST /trigger');
    logger.info('🔔 Webhook endpoint ready at POST /webhook/monday');
    
    // Start Slack Bolt receiver (handles slash commands)
    await slackApp.start(PORT);
    
    logger.success(`⚡️ Server running on port ${PORT}`);
    logger.info(`🌐 Listening on 0.0.0.0:${PORT}`);
    logger.success('✅ Slack commands ready: /create-task, /quick-task, /monday-help');
    logger.info('📅 Scheduled automation: 9 AM EST weekdays (GitHub Actions)');
    logger.info('✅ Service ready');
    
  } catch (error) {
    logger.error('❌ Failed to start service', error);
    process.exit(1);
  }
}

// ============================================
// HTTP ENDPOINTS
// ============================================

// Monday.com webhook endpoint - properly handle challenge and events
receiver.app.post('/webhook/monday', async (req, res) => {
  metrics.webhooksReceived++;
  
  try {
    // Pass req and res directly to handleWebhook - it handles both challenge and events
    await handleWebhook(req, res);
    metrics.notificationsSent++;
  } catch (error) {
    logger.error('Webhook handler error', error);
    metrics.errors++;
    // Only send response if not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Manual trigger endpoint
receiver.app.post('/trigger', async (req, res) => {
  logger.info('Manual automation trigger received');
  
  res.json({ 
    status: 'triggered', 
    message: 'Automation started',
    timestamp: new Date().toISOString()
  });
  
  runAutomation().catch(error => {
    logger.error('Manual trigger failed', error);
  });
});

// Health check endpoint
receiver.app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    lastRun: metrics.lastRun,
    metrics: {
      usersProcessed: metrics.usersProcessed,
      messagesUpdated: metrics.messagesUpdated,
      messagesSent: metrics.messagesSent,
      webhooksReceived: metrics.webhooksReceived,
      notificationsSent: metrics.notificationsSent,
      errors: metrics.errors
    }
  });
});

// Root endpoint
receiver.app.get('/', (req, res) => {
  res.json({ 
    message: 'Monday.com → Slack Automation Service',
    status: 'running',
    version: '4.3.0',
    mode: 'scheduled',
    schedule: '9:00 AM EST weekdays',
    endpoints: {
      health: '/health',
      trigger: '/trigger (POST)',
      webhook: '/webhook/monday (POST)',
      slack: '/slack/events (Slack commands)'
    },
    lastRun: metrics.lastRun
  });
});

// Metrics endpoint
receiver.app.get('/metrics', (req, res) => {
  res.json({
    ...metrics,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start the service
startServer();
