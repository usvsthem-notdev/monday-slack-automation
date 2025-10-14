# Monday.com Webhook Setup Guide

This guide will help you set up Monday.com webhooks to receive real-time notifications when tasks are assigned to users.

## Overview

The webhook integration allows the automation to:
- Detect when a user is assigned to a task (people column updates)
- Send immediate Slack notifications to newly assigned users
- Provide interactive buttons for quick task actions

## Prerequisites

1. **Server deployed and accessible**: Your automation server must be publicly accessible (e.g., deployed on Render)
2. **Webhook URL**: You'll need your server's webhook endpoint URL
   - Format: `https://your-server-domain.com/webhook/monday`
   - Example: `https://monday-slack-automation.onrender.com/webhook/monday`

## Step-by-Step Setup

### 1. Get Your Webhook URL

Your webhook endpoint is automatically available at:
```
https://<your-render-url>/webhook/monday
```

For example:
```
https://monday-slack-automation-xyz.onrender.com/webhook/monday
```

### 2. Configure Monday.com Webhooks

#### Option A: Using Monday.com Integrations Center (Recommended)

1. Go to your Monday.com workspace
2. Click on your profile picture → **Developers** → **My Apps**
3. Create a new app or select an existing one
4. Navigate to **Features** → **Webhooks**
5. Click **Add Webhook**
6. Configure the webhook:
   - **Webhook URL**: Enter your webhook endpoint URL
   - **Event Type**: Select `change_column_value`
   - **Board IDs**: Select the boards you want to monitor (or leave empty for all boards)
   - **Column IDs**: (Optional) Specify the people column IDs you want to track

#### Option B: Using Monday.com API

You can also create webhooks programmatically using the Monday.com API:

```graphql
mutation {
  create_webhook (
    board_id: YOUR_BOARD_ID,
    url: "https://your-server-domain.com/webhook/monday",
    event: change_column_value
  ) {
    id
    board_id
  }
}
```

### 3. Verify Webhook Challenge

When you first create a webhook, Monday.com will send a challenge request to verify the endpoint:

1. Monday.com sends a POST request with a `challenge` field
2. Your server automatically responds with the challenge value
3. Once verified, the webhook is active

You can test this using the health check:
```bash
curl -X POST https://your-server-domain.com/webhook/monday \
  -H "Content-Type: application/json" \
  -d '{"challenge": "test_challenge"}'
```

Expected response:
```json
{"challenge": "test_challenge"}
```

### 4. Test Task Assignment

1. Go to any Monday.com board
2. Assign a user to a task (add them to the people column)
3. Check the server logs for webhook event processing
4. The assigned user should receive a Slack notification within seconds

## Webhook Event Structure

When a user is assigned to a task, Monday.com sends a webhook with this structure:

```json
{
  "event": {
    "type": "change_column_value",
    "boardId": 12345678,
    "pulseId": 98765432,
    "columnId": "people",
    "columnType": "multiple-person",
    "value": {
      "value": "{\"personsAndTeams\":[{\"id\":89455577,\"kind\":\"person\"}]}"
    },
    "previousValue": {
      "value": "{\"personsAndTeams\":[]}"
    },
    "userId": 12345678,
    "timestamp": "2025-10-14T12:00:00Z"
  }
}
```

## Monitoring Webhooks

### Check Webhook Status

View all webhooks for a board:

```graphql
query {
  boards(ids: [YOUR_BOARD_ID]) {
    webhooks {
      id
      board_id
      url
      event
      config
    }
  }
}
```

### View Server Logs

Check your Render logs to see webhook events being processed:

```bash
# Webhook received
{"level":"info","message":"Webhook event received","data":{"type":"change_column_value","boardId":12345678,"itemId":98765432}}

# User assignment detected
{"level":"info","message":"Found 1 newly assigned user(s)","data":{"userIds":[89455577]}}

# Notification sent
{"level":"success","message":"Task assignment notification sent","data":{"userName":"John Doe","taskName":"Complete project"}}
```

## Troubleshooting

### Webhook Not Triggering

1. **Verify webhook is active**:
   ```graphql
   query {
     boards(ids: [YOUR_BOARD_ID]) {
       webhooks {
         id
         is_active
       }
     }
   }
   ```

2. **Check server accessibility**: Ensure your server is publicly accessible
   ```bash
   curl https://your-server-domain.com/health
   ```

3. **Verify column type**: The webhook only triggers for `multiple-person` column types

### Notifications Not Sending

1. **Check user email**: Ensure the Monday.com user email matches their Slack email
2. **Verify Slack permissions**: The bot needs permission to send DMs
3. **Check server logs**: Look for error messages in the webhook processing

### Delete a Webhook

If you need to remove a webhook:

```graphql
mutation {
  delete_webhook(id: WEBHOOK_ID) {
    id
  }
}
```

## Security Considerations

1. **HTTPS Only**: Always use HTTPS for webhook URLs
2. **Verify Origin**: The webhook handler logs all events for audit purposes
3. **Rate Limiting**: Consider implementing rate limiting for high-volume boards
4. **Error Handling**: Failed notifications are logged but don't block the webhook response

## Advanced Configuration

### Filter by Specific Boards

To only receive webhooks from specific boards, set the `board_id` when creating the webhook:

```graphql
mutation {
  create_webhook (
    board_id: 12345678,  # Specific board ID
    url: "https://your-server-domain.com/webhook/monday",
    event: change_column_value
  ) {
    id
  }
}
```

### Multiple Webhooks

You can create multiple webhooks for different boards or event types:

- One webhook per board for granular control
- Different webhooks for different column types
- Separate webhooks for testing vs production

## Support

For issues or questions:
1. Check server logs at Render dashboard
2. Review Monday.com webhook documentation: https://developer.monday.com/apps/docs/webhooks
3. Test webhook endpoint manually using curl or Postman

## Next Steps

- Set up webhooks for all relevant boards
- Monitor notification delivery in Slack
- Customize notification format in `src/webhookHandler.js`
- Add additional webhook event types as needed
