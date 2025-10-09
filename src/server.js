require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');

// Configuration
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Bind to all interfaces for Render

// Validate required environment variables
if (!SLACK_SIGNING_SECRET) {
  console.error('ERROR: SLACK_SIGNING_SECRET is required');
  process.exit(1);
}
if (!SLACK_BOT_TOKEN) {
  console.error('ERROR: SLACK_BOT_TOKEN is required');
  process.exit(1);
}
if (!MONDAY_API_KEY) {
  console.error('ERROR: MONDAY_API_KEY is required');
  process.exit(1);
}

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