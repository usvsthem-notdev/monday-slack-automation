# Task Assignment Notifications Feature

## Overview

This feature adds real-time push notifications to Slack when users are assigned to tasks in Monday.com. Instead of waiting for the daily scheduled automation, users receive immediate notifications as soon as they're assigned to a task.

## How It Works

### Flow Diagram

```
Monday.com → Webhook → Server → Slack Bot → User DM
    ↓           ↓         ↓          ↓          ↓
  Task      Detects   Processes  Formats   Receives
 Assigned   Change    Event      Message   Notification
```

### Detailed Process

1. **User Assignment**: Someone assigns a user to a task in Monday.com (adds them to the people column)

2. **Webhook Trigger**: Monday.com sends a webhook event to your server at `/webhook/monday`

3. **Event Detection**: The webhook handler:
   - Receives the webhook payload
   - Validates it's a people column change
   - Extracts newly assigned users (compares previous vs current assignments)

4. **Data Enrichment**: For each newly assigned user:
   - Fetches user details from Monday.com (name, email)
   - Retrieves full task details (name, board, due date, status)

5. **Slack Notification**: Sends a formatted DM to the user containing:
   - Task name and details
   - Board name
   - Current status
   - Due date
   - Quick action buttons (Mark Complete, Update Task, Open in Monday)

## Key Features

### ✨ Immediate Notifications
- Users are notified within seconds of being assigned
- No need to wait for scheduled automation runs
- Real-time awareness of new responsibilities

### 🎯 Smart Detection
- Only notifies newly assigned users (not existing assignees)
- Compares previous and current assignments
- Ignores unrelated column changes
- Handles multiple simultaneous assignments

### 💬 Rich Notifications
- Formatted Slack message with task details
- Interactive buttons for quick actions
- Direct link to open task in Monday.com
- Shows due date and current status

### 🔧 Interactive Actions
- **Mark Complete**: Update task status to Done
- **Update Task**: Open modal to edit status, due date, or add notes
- **Open in Monday**: Direct link to the task

## Setup Requirements

### 1. Server Deployment
Your automation server must be publicly accessible (e.g., deployed on Render) to receive webhooks from Monday.com.

### 2. Environment Variables
Ensure these are set in your deployment:
```bash
MONDAY_API_KEY=your_monday_api_key
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your_slack_signing_secret
```

### 3. Monday.com Webhook Configuration
Follow the [Webhook Setup Guide](./WEBHOOK_SETUP.md) to:
- Create webhooks for your boards
- Configure them to listen for `change_column_value` events
- Point them to your server's webhook endpoint

## Technical Implementation

### File Structure
```
src/
├── webhookHandler.js    # Main webhook processing logic
├── server.js            # Express server with webhook endpoint
└── automation.js        # Existing scheduled automation
```

### Webhook Handler (`src/webhookHandler.js`)

**Key Functions:**

1. `handleWebhook(req, res)` - Main entry point
   - Handles challenge verification
   - Validates webhook payload
   - Responds immediately to Monday.com
   - Processes event asynchronously

2. `extractNewlyAssignedUsers(event)` - User detection
   - Compares previous vs current assignments
   - Returns array of newly assigned user IDs
   - Filters out existing assignees

3. `processWebhookEvent(event)` - Event processing
   - Validates event type (people column)
   - Fetches task and user details
   - Sends notifications to new assignees

4. `formatTaskNotification(task, userName)` - Message formatting
   - Creates rich Slack message blocks
   - Includes interactive action buttons
   - Formats dates and status

5. `sendSlackNotification(userEmail, message)` - Slack delivery
   - Looks up Slack user by email
   - Opens DM channel
   - Sends formatted message

### Server Integration (`src/server.js`)

**Changes Made:**
- Added Express body parser for JSON webhooks
- Registered POST endpoint at `/webhook/monday`
- Imported and integrated webhook handler
- Updated root endpoint to show webhook URL

## Testing

### Manual Testing

1. **Run Test Suite**:
   ```bash
   node tests/webhook.test.js
   ```

2. **Test Individual Scenarios**:
   ```bash
   # Set your webhook URL
   export WEBHOOK_URL=https://your-server.onrender.com/webhook/monday
   
   # Run specific test
   node -e "require('./tests/webhook.test.js').testNewAssignment()"
   ```

### Live Testing

1. Deploy your server to Render
2. Set up a Monday.com webhook (see setup guide)
3. Go to a Monday.com board
4. Assign yourself to a task
5. Check your Slack DMs for the notification
6. Check server logs in Render dashboard

### Expected Behavior

**Scenario 1: New Assignment**
- Webhook received and processed ✓
- User details fetched from Monday.com ✓
- Task details retrieved ✓
- Slack notification sent ✓
- User receives DM with task details ✓

**Scenario 2: Multiple Assignments**
- Each new user receives individual notification
- Existing assignees are not notified again

**Scenario 3: Non-People Column Change**
- Event received but ignored (no notification sent)
- Logged for debugging purposes

## Monitoring

### Server Logs

Key log messages to watch for:

```json
// Webhook received
{"level":"info","message":"Webhook event received","data":{"type":"change_column_value","boardId":12345,"itemId":67890}}

// New assignment detected
{"level":"info","message":"Found 1 newly assigned user(s)","data":{"userIds":[89455577]}}

// Notification sent successfully
{"level":"success","message":"Task assignment notification sent","data":{"userName":"John Doe","taskName":"Complete report"}}

// User not found in Slack
{"level":"error","message":"Slack user not found for email: user@example.com"}
```

### Metrics to Track

- Webhooks received per day
- Notifications sent successfully
- Failed notifications (user not found in Slack)
- Average notification delivery time
- Webhook processing errors

## Troubleshooting

### Notifications Not Sending

**Problem**: User assigned but no Slack notification received

**Solutions**:
1. Check if user's Monday.com email matches Slack email
2. Verify Slack bot has permission to send DMs
3. Check server logs for errors
4. Ensure webhook is active in Monday.com
5. Test webhook endpoint manually

### Webhook Not Triggering

**Problem**: Webhook endpoint not receiving events

**Solutions**:
1. Verify server is publicly accessible
2. Check webhook URL is correct
3. Confirm webhook is active in Monday.com
4. Test endpoint with curl:
   ```bash
   curl -X POST https://your-server.com/webhook/monday \
     -H "Content-Type: application/json" \
     -d '{"challenge":"test"}'
   ```

### Duplicate Notifications

**Problem**: User receives multiple notifications for same assignment

**Solutions**:
1. Check for duplicate webhooks in Monday.com
2. Verify the extraction logic is working correctly
3. Review server logs for multiple webhook calls

## Performance Considerations

### Response Time
- Webhook handler responds to Monday.com within 100ms
- Notification processing happens asynchronously
- Users typically receive notifications within 1-3 seconds

### Scalability
- Each webhook event processes independently
- No shared state between webhook calls
- Handles concurrent assignments gracefully
- Recommended: Add rate limiting for high-volume boards

### Error Handling
- Failed notifications don't block webhook response
- Errors are logged for debugging
- Graceful degradation if Monday.com or Slack APIs fail

## Future Enhancements

### Potential Improvements

1. **Notification Preferences**
   - Allow users to opt-in/opt-out of notifications
   - Customize notification frequency
   - Choose notification channels

2. **Enhanced Detection**
   - Notify on task updates (status changes, due date changes)
   - Notify on @mentions in task comments
   - Notify on task completion

3. **Batch Processing**
   - Group multiple assignments into single notification
   - Digest mode for high-volume users

4. **Analytics Dashboard**
   - Track notification delivery rates
   - Monitor webhook performance
   - User engagement metrics

5. **Database Storage**
   - Store webhook events for audit trail
   - Track notification history
   - Enable notification replay

## Security Considerations

1. **Webhook Verification**: Future enhancement to verify webhook signatures from Monday.com
2. **HTTPS Only**: All webhook endpoints use HTTPS
3. **Rate Limiting**: Consider adding rate limiting for production
4. **Error Messages**: Avoid exposing sensitive data in error logs
5. **Access Control**: Webhook endpoint is public but only processes valid Monday.com events

## Support

For issues or questions:
1. Review server logs in Render dashboard
2. Check [Webhook Setup Guide](./WEBHOOK_SETUP.md)
3. Test webhook manually using test suite
4. Verify environment variables are set correctly

## Related Documentation

- [Webhook Setup Guide](./WEBHOOK_SETUP.md)
- [Monday.com Webhooks Documentation](https://developer.monday.com/apps/docs/webhooks)
- [Slack API Documentation](https://api.slack.com/messaging/sending)
