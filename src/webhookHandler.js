const { WebClient } = require('@slack/web-api');
const axios = require('axios');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Initialize Slack client
const slack = new WebClient(SLACK_BOT_TOKEN);

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

// Monday.com GraphQL query helper
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

// Get user details from Monday.com
async function getMondayUser(userId) {
  const query = `
    query {
      users(ids: [${userId}]) {
        id
        name
        email
      }
    }
  `;
  
  const data = await mondayQuery(query);
  return data.users[0];
}

// Get full task details from Monday.com
async function getTaskDetails(itemId, boardId) {
  const query = `
    query {
      items(ids: [${itemId}]) {
        id
        name
        created_at
        board {
          id
          name
        }
        column_values {
          id
          text
          value
          type
        }
      }
    }
  `;
  
  const data = await mondayQuery(query);
  return data.items[0];
}

// Format task notification message for Slack
function formatTaskNotification(task, assignedUserName) {
  const dateColumn = task.column_values.find(cv => cv.type === 'date');
  const statusColumn = task.column_values.find(cv => cv.type === 'status');
  
  let dueDateText = 'No due date';
  if (dateColumn && dateColumn.value) {
    const dateData = JSON.parse(dateColumn.value);
    if (dateData.date) {
      const dueDate = new Date(dateData.date);
      dueDateText = dueDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
  }
  
  const statusText = statusColumn?.text || 'No Status';
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🎯 New Task Assigned!',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${task.name}*`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Board:*\n${task.board.name}`
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${statusText}`
        },
        {
          type: 'mrkdwn',
          text: `*Due Date:*\n${dueDateText}`
        },
        {
          type: 'mrkdwn',
          text: `*Assigned to:*\n${assignedUserName}`
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Mark Complete',
            emoji: true
          },
          action_id: `task_action_complete_${task.id}_${task.board.id}`,
          style: 'primary'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📝 Update Task',
            emoji: true
          },
          action_id: `task_action_update_${task.id}_${task.board.id}`
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔗 Open in Monday',
            emoji: true
          },
          url: `https://drexcorp-company.monday.com/boards/${task.board.id}/pulses/${task.id}`
        }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Assigned at ${new Date().toLocaleString('en-US')}`
        }
      ]
    }
  ];
  
  return { blocks };
}

// Send notification to Slack user
async function sendSlackNotification(userEmail, message) {
  try {
    // Look up Slack user by email
    const slackUserResponse = await slack.users.lookupByEmail({ email: userEmail });
    const slackUserId = slackUserResponse.user.id;
    
    // Open DM channel
    const dmResponse = await slack.conversations.open({ users: slackUserId });
    const channelId = dmResponse.channel.id;
    
    // Send message
    await slack.chat.postMessage({
      channel: channelId,
      blocks: message.blocks,
      text: '🎯 New Task Assigned!' // Fallback text for notifications
    });
    
    logger.success(`Sent task assignment notification to ${userEmail}`, { channelId });
    return true;
  } catch (error) {
    if (error.data?.error === 'users_not_found') {
      logger.error(`Slack user not found for email: ${userEmail}`, error);
      return false;
    }
    throw error;
  }
}

// Extract newly assigned users from webhook event
function extractNewlyAssignedUsers(event) {
  const newlyAssignedUsers = [];
  
  // Log the full event for debugging
  logger.info('Extracting newly assigned users', { 
    columnId: event.columnId,
    value: event.value,
    previousValue: event.previousValue
  });
  
  // Check if the event is about a people column change
  if (!event.columnId || !event.value) {
    logger.info('No columnId or value in event');
    return newlyAssignedUsers;
  }
  
  try {
    // Parse the new value (current assignments)
    const newValue = JSON.parse(event.value.value || '{}');
    const newPersonsAndTeams = newValue.personsAndTeams || [];
    
    logger.info('Parsed new value', { newPersonsAndTeams });
    
    // Parse the previous value (before change)
    const previousValue = event.previousValue ? JSON.parse(event.previousValue.value || '{}') : {};
    const previousPersonsAndTeams = previousValue.personsAndTeams || [];
    
    logger.info('Parsed previous value', { previousPersonsAndTeams });
    
    // Find users who are in the new list but not in the previous list
    const previousUserIds = new Set(
      previousPersonsAndTeams
        .filter(p => p.kind === 'person')
        .map(p => String(p.id))
    );
    
    logger.info('Previous user IDs', { previousUserIds: Array.from(previousUserIds) });
    
    newPersonsAndTeams.forEach(person => {
      if (person.kind === 'person' && !previousUserIds.has(String(person.id))) {
        logger.info('Found newly assigned user', { userId: person.id });
        newlyAssignedUsers.push(person.id);
      }
    });
    
    return newlyAssignedUsers;
  } catch (error) {
    logger.error('Error extracting newly assigned users', error);
    return [];
  }
}

// Main webhook handler
async function handleWebhook(req, res) {
  try {
    const { challenge, event } = req.body;
    
    // Handle Monday.com webhook challenge verification
    if (challenge) {
      logger.info('Webhook challenge received', { challenge });
      return res.json({ challenge });
    }
    
    // Validate webhook event
    if (!event) {
      logger.error('No event in webhook payload');
      return res.status(400).json({ error: 'No event in payload' });
    }
    
    logger.info('Webhook event received', { 
      type: event.type,
      boardId: event.boardId,
      itemId: event.pulseId,
      columnId: event.columnId,
      columnType: event.columnType,
      fullEvent: event
    });
    
    // Respond immediately to Monday.com
    res.status(200).json({ status: 'received' });
    
    // Process webhook asynchronously
    processWebhookEvent(event).catch(error => {
      logger.error('Error processing webhook event', error);
    });
    
  } catch (error) {
    logger.error('Webhook handler error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Process webhook event asynchronously
async function processWebhookEvent(event) {
  try {
    logger.info('Processing webhook event', { event });
    
    // Check if this is a people column update - be more flexible with column type checking
    const isPeopleColumn = event.columnType === 'multiple-person' || 
                          event.columnType === 'people' ||
                          event.columnType === 'person' ||
                          (event.value && event.value.value && event.value.value.includes('personsAndTeams'));
    
    if (!event.columnId || !isPeopleColumn) {
      logger.info('Event is not a people column update, skipping', { 
        columnType: event.columnType,
        hasColumnId: !!event.columnId 
      });
      return;
    }
    
    // Extract newly assigned users
    const newlyAssignedUserIds = extractNewlyAssignedUsers(event);
    
    if (newlyAssignedUserIds.length === 0) {
      logger.info('No newly assigned users detected');
      return;
    }
    
    logger.info(`Found ${newlyAssignedUserIds.length} newly assigned user(s)`, { 
      userIds: newlyAssignedUserIds 
    });
    
    // Get task details
    const task = await getTaskDetails(event.pulseId, event.boardId);
    
    // Send notification to each newly assigned user
    for (const userId of newlyAssignedUserIds) {
      try {
        // Get user details from Monday.com
        const mondayUser = await getMondayUser(userId);
        
        if (!mondayUser || !mondayUser.email) {
          logger.error(`Could not find user with ID ${userId}`);
          continue;
        }
        
        // Format and send notification
        const message = formatTaskNotification(task, mondayUser.name);
        await sendSlackNotification(mondayUser.email, message);
        
        logger.success('Task assignment notification sent', {
          userId: mondayUser.id,
          userName: mondayUser.name,
          userEmail: mondayUser.email,
          taskId: task.id,
          taskName: task.name
        });
        
      } catch (userError) {
        logger.error(`Failed to send notification for user ${userId}`, userError);
      }
    }
    
  } catch (error) {
    logger.error('Error processing webhook event', error);
  }
}

module.exports = {
  handleWebhook,
  processWebhookEvent,
  sendSlackNotification
};
