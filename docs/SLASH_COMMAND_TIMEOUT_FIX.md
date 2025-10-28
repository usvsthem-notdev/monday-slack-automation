# /create-task Command Timeout Issue Analysis & Fix

## Issue
The `/create-task` slash command is experiencing timeout errors in Slack because acknowledgment is not being sent within the required 3-second window.

## Root Cause Analysis

After reviewing the codebase:

1. **The `/create-task` command IS correctly implemented** in `src/slackCommands.js`:
   - Uses `await ack()` immediately upon receiving the command
   - Follows with `await respond()` pattern for async operations
   - Has proper error handling

2. **Potential issues that could cause timeouts:**

### Issue 1: Synchronous Operations Before ACK
Check if any synchronous operations are happening before the `ack()` call:
- Database connections
- Cache initialization  
- Heavy computations

### Issue 2: Express Middleware Blocking
The app uses `ExpressReceiver` with custom middleware. Check for blocking middleware:
```javascript
receiver.app.use(express.json());
receiver.app.use(express.static(path.join(__dirname, '../public')));
```

### Issue 3: Async/Await Chain Blocking
The current implementation in `slackCommands.js`:
```javascript
slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    // STEP 1: Acknowledge immediately (must happen within 3 seconds)
    await ack();
    // ... rest of the code
```

## Recommended Fixes

### Fix 1: Non-blocking ACK (RECOMMENDED)
Change from `await ack()` to fire-and-forget pattern:

```javascript
slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    // Don't await - let it complete in background
    ack().catch(err => logger.error('ACK failed:', err));
    
    try {
        // Rest of your async code here
        await respond({
            text: '⏳ Loading task creation form...',
            response_type: 'ephemeral'
        });
        // ... continue with form building
    } catch (error) {
        // Handle errors
    }
});
```

### Fix 2: Process.nextTick Pattern
Use Node's process.nextTick to ensure ACK happens first:

```javascript
slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    await ack();
    
    // Defer all work to next tick
    process.nextTick(async () => {
        try {
            await respond({
                text: '⏳ Loading task creation form...',
                response_type: 'ephemeral'
            });
            // ... rest of the async work
        } catch (error) {
            // Handle errors
        }
    });
});
```

### Fix 3: Implement Timeout Monitoring
Add logging to identify where delays occur:

```javascript
slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    const start = Date.now();
    
    await ack();
    console.log(`ACK completed in ${Date.now() - start}ms`);
    
    if (Date.now() - start > 2000) {
        logger.warn('ACK took over 2 seconds!', {
            duration: Date.now() - start,
            command: '/create-task'
        });
    }
    
    // Continue with async operations
});
```

### Fix 4: Verify Slack App Configuration
Ensure the Slack app configuration is correct:

1. Check if Request URL is correctly configured in Slack app settings
2. Verify the signing secret is correct
3. Ensure no proxy or network delays between Slack and your server
4. Check if the server is under heavy load

## Implementation Steps

1. **Update `src/slackCommands.js`**:
```javascript
// Replace the existing /create-task handler with:
slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    // Fire and forget ACK - don't block on it
    ack().catch(err => {
        logger.error('Failed to acknowledge /create-task command', err);
    });
    
    try {
        logger.info('Create task command received', { 
            userId: command.user_id,
            text: command.text,
            timestamp: new Date().toISOString()
        });
        
        // Continue with the existing implementation
        await respond({
            text: '⏳ Loading task creation form...',
            response_type: 'ephemeral'
        });
        
        // Rest of the existing code...
    } catch (error) {
        logger.error('Error in /create-task command', error);
        await respond({
            text: '❌ Sorry, there was an error. Please try again.',
            response_type: 'ephemeral'
        });
    }
});
```

2. **Add Performance Monitoring**:
```javascript
// Add to the beginning of initializeSlackCommands function
const commandMetrics = {
    ackTimes: [],
    timeouts: 0,
    successes: 0
};

// In each command handler:
const ackStart = Date.now();
ack().then(() => {
    const ackTime = Date.now() - ackStart;
    commandMetrics.ackTimes.push(ackTime);
    if (ackTime > 2500) {
        commandMetrics.timeouts++;
        logger.warn('ACK approaching timeout', { ackTime, command: '/create-task' });
    } else {
        commandMetrics.successes++;
    }
}).catch(err => {
    logger.error('ACK failed', err);
});
```

3. **Test the Fix**:
- Deploy the updated code
- Test `/create-task` command multiple times
- Monitor logs for ACK timing
- Verify no timeout errors in Slack

## Additional Recommendations

1. **Cache Prewarming**: The app already implements cache prewarming which is good
2. **Async Queue**: The unified-server.js uses an async queue for button actions - consider using the same pattern for slash commands
3. **Health Monitoring**: Add specific endpoint to check command handler health:
```javascript
receiver.app.get('/health/commands', (req, res) => {
    res.json({
        commandMetrics,
        cacheStatus: {
            boards: boardsCache.data ? boardsCache.data.length : 0,
            users: usersCache.data ? usersCache.data.length : 0,
            age: Date.now() - boardsCache.timestamp
        }
    });
});
```

## Conclusion

The `/create-task` command implementation appears correct with proper `await ack()` placement. The timeout is likely caused by:
1. Network latency between Slack and your server
2. Node.js event loop blocking before the ack() executes
3. Heavy server load delaying the acknowledgment

Implementing the fire-and-forget ACK pattern (Fix 1) should resolve the issue immediately.
