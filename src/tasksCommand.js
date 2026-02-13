const axios = require('axios');
const path = require('path');
const workspacesConfig = require(path.join(__dirname, '../config/workspaces.json'));

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;

const mondayAxios = axios.create({
  baseURL: 'https://api.monday.com/v2',
  headers: {
    'Authorization': MONDAY_API_KEY,
    'Content-Type': 'application/json'
  }
});

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

// Get all boards from all workspaces
async function getAllBoards() {
  const workspaceIds = workspacesConfig.workspaceIds;
  const allBoards = [];
  
  for (const workspaceId of workspaceIds) {
    const query = `
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
    `;
    const data = await mondayQuery(query);
    allBoards.push(...data.boards);
  }
  
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
    
    const query = `
      query {
        boards(ids: [${board.id}]) {
          items_page(limit: 100) {
            items {
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
        }
      }
    `;
    
    const data = await mondayQuery(query);
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
        status: task.column_values.find(cv => cv.id === statusColumn.id)?.text || 'No Status'
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

// Format task message for Slack
function formatTaskMessage(tasks, userName) {
  const now = new Date();
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 ${userName}'s Tasks`,
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

// Get Monday user by Slack user ID
async function getMondayUserBySlackUser(slackUserId, slackClient) {
  try {
    // Get Slack user's email
    const slackUser = await slackClient.users.info({ user: slackUserId });
    const email = slackUser.user.profile.email;
    
    // Find Monday.com user by email
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
    const users = data.users.filter(u => u.enabled);
    const mondayUser = users.find(u => u.email === email);
    
    return mondayUser;
  } catch (error) {
    logger.error('Error getting Monday user', error);
    return null;
  }
}

// Register /tasks command
function registerTasksCommand(slackApp) {
  slackApp.command('/tasks', ({ command, ack, respond, client }) => {
    // CRITICAL: Synchronous function for INSTANT acknowledgment
    const ackPromise = ack();

    // Queue async work - use setImmediate to ensure ack completes first
    setImmediate(async () => {
    
    try {
      logger.info('Tasks command received', { userId: command.user_id });
      
      // Show loading message
      await respond({
        text: '⏳ Fetching your tasks from Monday.com...',
        response_type: 'ephemeral'
      });
      
      // Get Monday user from Slack user
      const mondayUser = await getMondayUserBySlackUser(command.user_id, client);
      
      if (!mondayUser) {
        await respond({
          text: '❌ Could not find your Monday.com account. Make sure your Slack email matches your Monday.com email.',
          response_type: 'ephemeral',
          replace_original: true
        });
        return;
      }
      
      // Get all boards and fetch user's tasks
      const boards = await getAllBoards();
      let allUserTasks = [];
      
      for (const board of boards) {
        const tasks = await getUserTasksFromBoard(board, mondayUser.id);
        allUserTasks.push(...tasks);
      }
      
      logger.info(`Found ${allUserTasks.length} tasks for user`, { 
        userId: mondayUser.id, 
        userName: mondayUser.name 
      });
      
      // Organize and format tasks
      const organizedTasks = organizeTasks(allUserTasks);
      const message = formatTaskMessage(organizedTasks, mondayUser.name);
      
      // Send task list
      await respond({
        ...message,
        replace_original: true,
        response_type: 'ephemeral'
      });
      
      } catch (error) {
        logger.error('Error in /tasks command', error);
        await respond({
          text: '❌ Sorry, there was an error fetching your tasks. Please try again.',
          response_type: 'ephemeral',
          replace_original: true
        });
      }
    });

    return ackPromise;
  });

  logger.info('/tasks command registered');
}

module.exports = {
  registerTasksCommand,
  organizeTasks,
  formatTaskMessage,
  getAllBoards,
  getUserTasksFromBoard
};
