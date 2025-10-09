require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const TEST_MODE = process.env.TEST_MODE === 'true';

// Initialize clients
const slack = new WebClient(SLACK_BOT_TOKEN);
const mondayAxios = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: {
    'Authorization': MONDAY_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Message store (in-memory for GitHub Actions, persists across same-day runs)
const messageStore = new Map();
const MESSAGE_STORE_FILE = './data/message-store.json';

// Metrics
const metrics = {
  usersProcessed: 0,
  usersSkipped: 0,
  tasksFound: 0,
  messagesUpdated: 0,
  messagesSent: 0,
  errors: 0,
  startTime: new Date()
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
  
  getWorkspaces: `
    query {
      workspaces {
        id
        name
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

// Load message store
async function loadMessageStore() {
  try {
    await fs.mkdir('./data', { recursive: true });
    const data = await fs.readFile(MESSAGE_STORE_FILE, 'utf8');
    const stored = JSON.parse(data);
    Object.entries(stored).forEach(([key, value]) => {
      messageStore.set(key, value);
    });
    logger.info('Loaded message store', { count: messageStore.size });
  } catch (error) {
    logger.info('No existing message store found, starting fresh');
  }
}

// Save message store
async function saveMessageStore() {
  try {
    await fs.mkdir('./data', { recursive: true });
    const stored = Object.fromEntries(messageStore);
    await fs.writeFile(MESSAGE_STORE_FILE, JSON.stringify(stored, null, 2));
    logger.info('Saved message store', { count: messageStore.size });
  } catch (error) {
    logger.error('Failed to save message store', error);
  }
}

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
    await delay(500); // Rate limiting
  }
  
  logger.info(`Found ${allBoards.length} boards across ${workspaceIds.length} workspaces`);
  return allBoards;
}

// Get incomplete tasks for a user on a specific board
async function getUserTasksFromBoard(board, userId) {
  try {
    // Find column IDs
    const statusColumn = board.columns.find(c => c.type === 'status');
    const peopleColumn = board.columns.find(c => c.type === 'people');
    const dateColumn = board.columns.find(c => c.type === 'date');
    
    if (!statusColumn || !peopleColumn) {
      logger.info(`Skipping board ${board.name} - missing required columns`);
      return [];
    }
    
    // Get all items (we'll filter in post-processing since Monday API filtering is complex)
    const data = await mondayQuery(QUERIES.getBoardItems(board.id));
    const items = data.boards[0]?.items_page?.items || [];
    
    // Filter for this user and incomplete tasks
    const userTasks = items.filter(item => {
      // Check if assigned to user
      const peopleValue = item.column_values.find(cv => cv.id === peopleColumn.id);
      if (!peopleValue || !peopleValue.value) return false;
      
      const peopleData = JSON.parse(peopleValue.value || '{}');
      const isAssignedToUser = peopleData.personsAndTeams?.some(p => 
        p.id === parseInt(userId) && p.kind === 'person'
      );
      
      if (!isAssignedToUser) return false;
      
      // Check if not done
      const statusValue = item.column_values.find(cv => cv.id === statusColumn.id);
      if (!statusValue) return true; // No status = not done
      
      const statusData = JSON.parse(statusValue.value || '{}');
      const statusSettings = JSON.parse(statusColumn.settings_str || '{}');
      const doneColors = statusSettings.done_colors || [1];
      
      return !doneColors.includes(statusData.index);
    });
    
    // Enrich tasks with board info and date
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
  
  // Sort each category by date
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

// Format a single task
function formatTask(task) {
  const dueDate = task.dueDate 
    ? new Date(task.dueDate).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      })
    : 'No date';
  
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
        text: `*Date:* ${now.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })} | *Updated:* ${now.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}`
      }]
    },
    { type: 'divider' }
  ];
  
  // Overdue section
  if (tasks.overdue.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔴 Overdue (${tasks.overdue.length})*`
      }
    });
    
    tasks.overdue.slice(0, 5).forEach(task => {
      blocks.push(...formatTaskSection(task));
      blocks.push({ type: 'divider' });
    });
    
    if (tasks.overdue.length > 5) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `_+ ${tasks.overdue.length - 5} more overdue tasks_`
        }]
      });
      blocks.push({ type: 'divider' });
    }
  }
  
  // Due today section
  if (tasks.dueToday.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🟡 Due Today (${tasks.dueToday.length})*`
      }
    });
    
    tasks.dueToday.forEach(task => {
      blocks.push(...formatTaskSection(task));
      blocks.push({ type: 'divider' });
    });
  }
  
  // Upcoming section
  if (tasks.upcoming.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🟢 Upcoming This Week (${tasks.upcoming.length})*`
      }
    });
    
    tasks.upcoming.slice(0, 5).forEach(task => {
      blocks.push(...formatTaskSection(task));
      blocks.push({ type: 'divider' });
    });
    
    if (tasks.upcoming.length > 5) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `_+ ${tasks.upcoming.length - 5} more upcoming tasks_`
        }]
      });
    }
  }
  
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

// Send or update Slack message
async function sendOrUpdateSlackMessage(user, slackMessage) {
  try {
    // Get Slack user ID by email
    const slackUserResponse = await slack.users.lookupByEmail({ email: user.email });
    const slackUserId = slackUserResponse.user.id;
    
    // Open DM channel
    const dmResponse = await slack.conversations.open({ users: slackUserId });
    const channelId = dmResponse.channel.id;
    
    const today = new Date().toDateString();
    const storeKey = `${user.id}-${today}`;
    const storedMessage = messageStore.get(storeKey);
    
    if (storedMessage && storedMessage.channelId === channelId) {
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
    // Check if error is due to user not found in Slack
    if (error.data?.error === 'users_not_found') {
      logger.warn(`Slack user not found for ${user.name} (${user.email}) - Skipping`, {
        userId: user.id,
        email: user.email
      });
      metrics.usersSkipped++;
      return; // Continue to next user without throwing
    }
    
    // Check for other common Slack errors that shouldn't stop automation
    if (error.data?.error === 'account_inactive' || 
        error.data?.error === 'invalid_email' ||
        error.data?.error === 'user_disabled') {
      logger.warn(`Slack account issue for ${user.name} (${user.email}): ${error.data.error} - Skipping`, {
        userId: user.id,
        email: user.email,
        slackError: error.data.error
      });
      metrics.usersSkipped++;
      return; // Continue to next user without throwing
    }
    
    // For other errors, log and rethrow
    logger.error(`Failed to send Slack message to ${user.name}`, error);
    throw error;
  }
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main automation function
async function runAutomation() {
  logger.info('🚀 Starting Monday.com → Slack automation');
  
  try {
    // Load previous message store
    await loadMessageStore();
    
    // Get users
    logger.info('Fetching users...');
    const users = await getActiveUsers();
    logger.info(`Found ${users.length} active users`);
    
    // Get all boards
    logger.info('Fetching boards...');
    const boards = await getAllBoards();
    
    // Process each user
    for (const user of users) {
      try {
        logger.info(`Processing user: ${user.name} (${user.email})`);
        
        let allUserTasks = [];
        
        // Get tasks from each board
        for (const board of boards) {
          const tasks = await getUserTasksFromBoard(board, user.id);
          allUserTasks.push(...tasks);
          await delay(300); // Rate limiting
        }
        
        metrics.tasksFound += allUserTasks.length;
        logger.info(`Found ${allUserTasks.length} tasks for ${user.name}`);
        
        // Organize tasks
        const organizedTasks = organizeTasks(allUserTasks);
        
        // Format Slack message
        const slackMessage = formatSlackMessage(organizedTasks, user.name);
        
        // Send or update message (will gracefully skip if user not found in Slack)
        await sendOrUpdateSlackMessage(user, slackMessage);
        
        metrics.usersProcessed++;
        await delay(1000); // Rate limiting between users
        
      } catch (userError) {
        metrics.errors++;
        logger.error(`Failed to process user ${user.name}`, userError);
        // Continue to next user even if this one fails
      }
    }
    
    // Save message store
    await saveMessageStore();
    
    // Log final metrics
    const duration = (new Date() - metrics.startTime) / 1000;
    logger.success('✅ Automation completed', {
      ...metrics,
      durationSeconds: duration.toFixed(2)
    });
    
    // Save logs
    await saveLogsToFile();
    
  } catch (error) {
    logger.error('❌ Automation failed', error);
    process.exit(1);
  }
}

// Save logs to file
async function saveLogsToFile() {
  try {
    await fs.mkdir('./logs', { recursive: true });
    const logFileName = `automation-${new Date().toISOString().split('T')[0]}.log`;
    const logContent = JSON.stringify(metrics, null, 2);
    await fs.writeFile(`./logs/${logFileName}`, logContent);
  } catch (error) {
    logger.error('Failed to save logs', error);
  }
}

// Run the automation
runAutomation();