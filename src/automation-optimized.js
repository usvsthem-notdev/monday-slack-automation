/**
 * Optimized Monday.com to Slack automation
 * Performance improvements and better error handling
 */

const config = require('./config');
const { WebClient } = require('@slack/web-api');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Utils
const { logger } = require('./utils/logger');
const { retryWithBackoff, batchProcess, rateLimit } = require('./utils/retry');
const { safeJsonParse, validateEmail, sanitizeForGraphQL } = require('./utils/validation');
const { 
  isOverdue, 
  isToday, 
  isWithinDays, 
  formatDate, 
  cleanupOldDates 
} = require('./utils/date-utils');

// Initialize clients
const slack = new WebClient(config.slack.botToken);
const mondayAxios = axios.create({
  baseURL: config.monday.apiUrl,
  headers: {
    'Authorization': config.monday.apiKey,
    'Content-Type': 'application/json',
    'API-Version': '2024-01'
  },
  timeout: 10000
});

// Message store with automatic cleanup
class MessageStore {
  constructor() {
    this.store = new Map();
    this.filePath = config.storage.messageStoreFile;
  }
  
  async load() {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const data = await fs.readFile(this.filePath, 'utf8');
      const stored = JSON.parse(data);
      
      Object.entries(stored).forEach(([key, value]) => {
        this.store.set(key, value);
      });
      
      // Clean up old entries
      const removed = cleanupOldDates(this.store, config.storage.messageRetentionDays);
      if (removed > 0) {
        logger.info(`Cleaned up ${removed} old message entries`);
      }
      
      logger.info('Loaded message store', { count: this.store.size });
    } catch (error) {
      logger.info('No existing message store found, starting fresh');
    }
  }
  
  async save() {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const stored = Object.fromEntries(this.store);
      await fs.writeFile(this.filePath, JSON.stringify(stored, null, 2));
      logger.info('Saved message store', { count: this.store.size });
    } catch (error) {
      logger.error('Failed to save message store', error);
    }
  }
  
  get(key) {
    return this.store.get(key);
  }
  
  set(key, value) {
    this.store.set(key, {
      ...value,
      date: value.date || new Date().toISOString()
    });
  }
  
  cleanup() {
    return cleanupOldDates(this.store, config.storage.messageRetentionDays);
  }
}

const messageStore = new MessageStore();

// Metrics tracking
const metrics = {
  usersProcessed: 0,
  usersSkipped: 0,
  tasksFound: 0,
  messagesUpdated: 0,
  messagesSent: 0,
  errors: 0,
  startTime: new Date(),
  boardsProcessed: 0,
  apiCallsSuccess: 0,
  apiCallsFailed: 0
};

// GraphQL Fragments for reusability
const GRAPHQL_FRAGMENTS = {
  userFields: `
    fragment UserFields on User {
      id
      name
      email
      enabled
      is_guest
    }
  `,
  columnFields: `
    fragment ColumnFields on Column {
      id
      title
      type
      settings_str
    }
  `,
  itemFields: `
    fragment ItemFields on Item {
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
  `
};

// Enhanced Monday.com GraphQL queries
const QUERIES = {
  getUsers: `
    ${GRAPHQL_FRAGMENTS.userFields}
    query GetUsers {
      users {
        ...UserFields
      }
    }
  `,
  
  getBoardsByWorkspace: (workspaceId) => `
    ${GRAPHQL_FRAGMENTS.columnFields}
    query GetBoardsByWorkspace {
      boards(workspace_ids: [${workspaceId}], limit: 50) {
        id
        name
        columns {
          ...ColumnFields
        }
      }
    }
  `,
  
  getBoardItems: (boardId) => `
    ${GRAPHQL_FRAGMENTS.itemFields}
    query GetBoardItems {
      boards(ids: [${boardId}]) {
        items_page(limit: 100) {
          cursor
          items {
            ...ItemFields
          }
        }
      }
    }
  `
};

// Rate-limited Monday.com API helper
const mondayQuery = rateLimit(async function(query) {
  const startTime = Date.now();
  
  try {
    const response = await retryWithBackoff(
      async () => {
        const result = await mondayAxios.post('', { query });
        if (result.data.errors) {
          throw new Error(JSON.stringify(result.data.errors));
        }
        return result;
      },
      {
        maxRetries: config.monday.maxRetries,
        shouldRetry: (error) => {
          // Retry on network errors or rate limits
          return error.code === 'ECONNRESET' || 
                 error.response?.status === 429 ||
                 error.response?.status >= 500;
        }
      }
    );
    
    logger.trackApiCall(true);
    metrics.apiCallsSuccess++;
    logger.trackProcessingTime(Date.now() - startTime);
    
    return response.data.data;
  } catch (error) {
    logger.trackApiCall(false);
    metrics.apiCallsFailed++;
    logger.error('Monday.com API error', error);
    throw error;
  }
}, config.monday.rateLimit);

// Get all active users with validation
async function getActiveUsers() {
  const data = await mondayQuery(QUERIES.getUsers);
  let users = data.users.filter(u => 
    u.enabled && 
    !u.is_guest && 
    validateEmail(u.email)
  );
  
  if (config.app.testMode) {
    logger.info('TEST MODE: Using only test user');
    users = users.filter(u => u.id === config.app.testUserId);
  }
  
  return users;
}

// Get all boards from workspaces using batch processing
async function getAllBoards() {
  const allBoards = [];
  
  // Process workspaces in batches
  const results = await batchProcess(
    config.monday.workspaceIds,
    async (workspaceId) => {
      const data = await mondayQuery(QUERIES.getBoardsByWorkspace(workspaceId));
      return data.boards;
    },
    config.monday.batchSize
  );
  
  // Flatten results
  results.forEach(boards => {
    if (boards) {
      allBoards.push(...boards);
    }
  });
  
  logger.info(`Found ${allBoards.length} boards across ${config.monday.workspaceIds.length} workspaces`);
  return allBoards;
}

// Get incomplete tasks for a user on a specific board
async function getUserTasksFromBoard(board, userId) {
  try {
    // Find required columns
    const statusColumn = board.columns.find(c => c.type === 'status');
    const peopleColumn = board.columns.find(c => c.type === 'people');
    const dateColumn = board.columns.find(c => c.type === 'date');
    
    if (!statusColumn || !peopleColumn) {
      logger.debug(`Skipping board ${board.name} - missing required columns`);
      return [];
    }
    
    // Get items from board
    const data = await mondayQuery(QUERIES.getBoardItems(board.id));
    const items = data.boards[0]?.items_page?.items || [];
    
    // Parse status settings once
    const statusSettings = safeJsonParse(statusColumn.settings_str, {});
    const doneColors = statusSettings.done_colors || [1];
    
    // Filter for user's incomplete tasks
    const userTasks = items.filter(item => {
      // Check assignment
      const peopleValue = item.column_values.find(cv => cv.id === peopleColumn.id);
      if (!peopleValue?.value) return false;
      
      const peopleData = safeJsonParse(peopleValue.value, {});
      const isAssignedToUser = peopleData.personsAndTeams?.some(p => 
        p.id === parseInt(userId) && p.kind === 'person'
      );
      
      if (!isAssignedToUser) return false;
      
      // Check completion status
      const statusValue = item.column_values.find(cv => cv.id === statusColumn.id);
      if (!statusValue) return true; // No status = not done
      
      const statusData = safeJsonParse(statusValue.value, {});
      return !doneColors.includes(statusData.index);
    });
    
    // Enrich tasks with board info
    return userTasks.map(task => {
      const dateValue = task.column_values.find(cv => cv.id === dateColumn?.id);
      const dateData = dateValue ? safeJsonParse(dateValue.value, {}) : {};
      
      return {
        id: task.id,
        name: task.name,
        boardName: board.name,
        boardId: board.id,
        dueDate: dateData.date || null,
        status: task.column_values.find(cv => cv.id === statusColumn.id)?.text || 'No Status',
        createdAt: task.created_at,
        columnValues: task.column_values
      };
    });
  } catch (error) {
    logger.error(`Error fetching tasks from board ${board.name}`, error);
    return [];
  }
}

// Organize tasks by date categories
function organizeTasks(tasks) {
  const categorized = {
    overdue: [],
    dueToday: [],
    upcoming: [],
    noDueDate: []
  };
  
  tasks.forEach(task => {
    if (!task.dueDate) {
      categorized.noDueDate.push(task);
    } else if (isOverdue(task.dueDate)) {
      categorized.overdue.push(task);
    } else if (isToday(task.dueDate)) {
      categorized.dueToday.push(task);
    } else if (isWithinDays(task.dueDate, 7)) {
      categorized.upcoming.push(task);
    } else {
      categorized.noDueDate.push(task);
    }
  });
  
  // Sort each category by date
  const sortByDate = (a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  };
  
  Object.keys(categorized).forEach(key => {
    if (key !== 'noDueDate') {
      categorized[key].sort(sortByDate);
    }
  });
  
  return categorized;
}

// Format a single task
function formatTask(task) {
  const dueDate = formatDate(task.dueDate);
  
  let text = `*${task.name}*\n`;
  text += `📅 Due: ${dueDate}\n`;
  text += `📍 Board: ${task.boardName}\n`;
  text += `⚡ Status: ${task.status}`;
  
  return text;
}

// Format task section with action buttons
function formatTaskSection(task) {
  const taskText = formatTask(task);
  
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: taskText
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✓ Complete',
            emoji: true
          },
          action_id: `task_action_complete_${task.id}_${task.boardId}`,
          style: 'primary'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✏️ Update',
            emoji: true
          },
          action_id: `task_action_update_${task.id}_${task.boardId}`
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📅 +1 Day',
            emoji: true
          },
          action_id: `task_action_postpone_${task.id}_${task.boardId}`
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View',
            emoji: true
          },
          action_id: `task_action_view_${task.id}_${task.boardId}`
        }
      ]
    }
  ];
}

// Format Slack message with improved structure
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
        text: `*Date:* ${formatDate(now, { weekday: 'long' })} | *Updated:* ${now.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}`
      }]
    },
    { type: 'divider' }
  ];
  
  const maxTasksPerSection = config.slack.maxTasksPerSection;
  
  // Add sections with task limits
  const sections = [
    { title: '🔴 Overdue', tasks: tasks.overdue, color: 'danger' },
    { title: '🟡 Due Today', tasks: tasks.dueToday, color: 'warning' },
    { title: '🟢 Upcoming This Week', tasks: tasks.upcoming, color: 'good' }
  ];
  
  sections.forEach(({ title, tasks, color }) => {
    if (tasks.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title} (${tasks.length})*`
        }
      });
      
      tasks.slice(0, maxTasksPerSection).forEach(task => {
        blocks.push(...formatTaskSection(task));
        blocks.push({ type: 'divider' });
      });
      
      if (tasks.length > maxTasksPerSection) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `_+ ${tasks.length - maxTasksPerSection} more tasks_`
          }]
        });
        blocks.push({ type: 'divider' });
      }
    }
  });
  
  // No tasks message
  if (tasks.overdue.length === 0 && tasks.dueToday.length === 0 && tasks.upcoming.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✨ *No tasks due this week!* Great job staying on top of things.'
      }
    });
  }
  
  // Footer
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

// Send or update Slack message with better error handling
async function sendOrUpdateSlackMessage(user, slackMessage) {
  try {
    // Get Slack user ID by email with retry
    const slackUserResponse = await retryWithBackoff(
      () => slack.users.lookupByEmail({ email: user.email }),
      { maxRetries: 2 }
    );
    
    const slackUserId = slackUserResponse.user.id;
    
    // Open DM channel
    const dmResponse = await slack.conversations.open({ users: slackUserId });
    const channelId = dmResponse.channel.id;
    
    const today = new Date().toDateString();
    const storeKey = `${user.id}-${today}`;
    const storedMessage = messageStore.get(storeKey);
    
    if (storedMessage?.channelId === channelId) {
      // Update existing message
      await slack.chat.update({
        channel: channelId,
        ts: storedMessage.messageTs,
        blocks: slackMessage.blocks,
        text: `${user.name}'s Tasks for Today`
      });
      
      metrics.messagesUpdated++;
      logger.success(`Updated message for ${user.name}`, { channelId });
    } else {
      // Send new message
      const response = await slack.chat.postMessage({
        channel: channelId,
        blocks: slackMessage.blocks,
        text: `${user.name}'s Tasks for Today`
      });
      
      // Store message info
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
    // Handle specific Slack errors
    const errorCode = error.data?.error;
    const skipErrors = ['users_not_found', 'account_inactive', 'invalid_email', 'user_disabled'];
    
    if (skipErrors.includes(errorCode)) {
      logger.warn(`Slack issue for ${user.name} (${user.email}): ${errorCode} - Skipping`, {
        userId: user.id,
        email: user.email,
        slackError: errorCode
      });
      metrics.usersSkipped++;
      return;
    }
    
    logger.error(`Failed to send Slack message to ${user.name}`, error);
    throw error;
  }
}

// Process user tasks with optimized batching
async function processUserTasks(user, boards) {
  logger.info(`Processing user: ${user.name} (${user.email})`);
  
  // Get tasks from all boards in parallel batches
  const taskBatches = await batchProcess(
    boards,
    (board) => getUserTasksFromBoard(board, user.id),
    config.monday.batchSize
  );
  
  // Flatten and filter out nulls
  const allUserTasks = taskBatches
    .filter(tasks => tasks !== null)
    .flat();
  
  metrics.tasksFound += allUserTasks.length;
  logger.info(`Found ${allUserTasks.length} tasks for ${user.name}`);
  
  // Organize and format tasks
  const organizedTasks = organizeTasks(allUserTasks);
  const slackMessage = formatSlackMessage(organizedTasks, user.name);
  
  // Send or update message
  await sendOrUpdateSlackMessage(user, slackMessage);
  metrics.usersProcessed++;
}

// Main automation function with improved error handling
async function runAutomation() {
  logger.info('🚀 Starting Monday.com → Slack automation (Optimized)');
  
  try {
    // Load message store
    await messageStore.load();
    
    // Validate environment
    logger.info('Validating configuration...');
    
    // Get users and boards
    logger.info('Fetching users...');
    const users = await getActiveUsers();
    logger.info(`Found ${users.length} active users`);
    
    logger.info('Fetching boards...');
    const boards = await getAllBoards();
    metrics.boardsProcessed = boards.length;
    
    // Process users in batches for better performance
    await batchProcess(
      users,
      (user) => processUserTasks(user, boards),
      3 // Process 3 users concurrently
    );
    
    // Save message store
    await messageStore.save();
    
    // Calculate final metrics
    const duration = (new Date() - metrics.startTime) / 1000;
    const finalMetrics = {
      ...metrics,
      durationSeconds: duration.toFixed(2),
      avgTimePerUser: (duration / users.length).toFixed(2),
      successRate: metrics.apiCallsSuccess / (metrics.apiCallsSuccess + metrics.apiCallsFailed)
    };
    
    // Log and save metrics
    logger.success('✅ Automation completed', finalMetrics);
    await logger.saveMetrics();
    
  } catch (error) {
    metrics.errors++;
    logger.error('❌ Automation failed', error);
    await logger.saveMetrics();
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await messageStore.save();
  await logger.saveMetrics();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await messageStore.save();
  await logger.saveMetrics();
  process.exit(0);
});

// Export for testing
module.exports = {
  getActiveUsers,
  getAllBoards,
  getUserTasksFromBoard,
  organizeTasks,
  formatSlackMessage,
  runAutomation
};

// Run if called directly
if (require.main === module) {
  runAutomation();
}