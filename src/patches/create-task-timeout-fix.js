// Apply this patch to src/slackCommands.js to fix the /create-task timeout issue
// 
// The issue: Slack requires acknowledgment within 3 seconds
// The fix: Use fire-and-forget pattern for ACK to ensure it's non-blocking
//
// To apply: Replace the /create-task command handler in slackCommands.js with this code

slackApp.command('/create-task', async ({ command, ack, respond, client }) => {
    // CRITICAL FIX: Fire-and-forget ACK - don't await it
    // This ensures ACK happens immediately without any blocking
    const ackStart = Date.now();
    ack().then(() => {
      const ackTime = Date.now() - ackStart;
      logger.info('ACK completed', { 
        command: '/create-task',
        ackTime: ackTime + 'ms',
        warning: ackTime > 2500 ? 'APPROACHING_TIMEOUT' : 'OK'
      });
    }).catch(err => {
      logger.error('Failed to acknowledge /create-task command', err);
    });
    
    try {
      logger.info('Create task command received', { 
        userId: command.user_id,
        text: command.text,
        timestamp: new Date().toISOString()
      });
      
      // Show loading message via respond()
      // This happens after ACK, so no time pressure
      await respond({
        text: '⏳ Loading task creation form...',
        response_type: 'ephemeral'
      });
      
      // Fetch data (can take time, ACK already sent)
      const start = Date.now();
      const [boards, users] = await Promise.all([
        getCachedBoards(),
        getCachedUsers()
      ]);
      
      const fetchDuration = Date.now() - start;
      logger.info('Data fetched for form', { 
        duration: fetchDuration + 'ms',
        boards: boards.length,
        users: users.length
      });
      
      // Build the form blocks
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Create a New Task on Monday.com*\n\nFill out the form below to create your task.'
          }
        },
        { type: 'divider' },
        {
          type: 'input',
          block_id: 'task_name',
          label: {
            type: 'plain_text',
            text: 'Task Name'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_name_value',
            placeholder: {
              type: 'plain_text',
              text: 'Enter task name...'
            }
          }
        },
        {
          type: 'input',
          block_id: 'board_select',
          label: {
            type: 'plain_text',
            text: 'Board'
          },
          element: {
            type: 'static_select',
            action_id: 'board_select_value',
            placeholder: {
              type: 'plain_text',
              text: 'Select a board'
            },
            options: boards.slice(0, 100).map(board => ({
              text: {
                type: 'plain_text',
                text: `${board.name} (${board.workspace?.name || 'No workspace'})`
              },
              value: board.id
            }))
          }
        },
        {
          type: 'input',
          block_id: 'assignees',
          optional: true,
          label: {
            type: 'plain_text',
            text: 'Assign To (optional)'
          },
          element: {
            type: 'multi_static_select',
            action_id: 'assignees_value',
            placeholder: {
              type: 'plain_text',
              text: 'Select team members'
            },
            options: users.slice(0, 100).map(user => ({
              text: {
                type: 'plain_text',
                text: user.name
              },
              value: user.id
            }))
          }
        },
        {
          type: 'input',
          block_id: 'due_date',
          optional: true,
          label: {
            type: 'plain_text',
            text: 'Due Date (optional)'
          },
          element: {
            type: 'datepicker',
            action_id: 'due_date_value',
            placeholder: {
              type: 'plain_text',
              text: 'Select a date'
            }
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Create Task'
              },
              style: 'primary',
              action_id: 'create_task_submit',
              value: JSON.stringify({ userId: command.user_id })
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Cancel'
              },
              action_id: 'create_task_cancel'
            }
          ]
        }
      ];
      
      // Send the form via respond() - replaces loading message
      await respond({
        blocks: blocks,
        replace_original: true,
        response_type: 'ephemeral'
      });
      
      const totalDuration = Date.now() - start;
      logger.info('Form displayed successfully', { 
        totalDuration: totalDuration + 'ms'
      });
      
    } catch (error) {
      logger.error('Error displaying create task form', error);
      
      // Try to send error message to user
      try {
        await respond({
          text: '❌ Sorry, there was an error loading the task creation form. Please try again.',
          replace_original: true,
          response_type: 'ephemeral'
        });
      } catch (respondError) {
        logger.error('Failed to send error message to user', respondError);
      }
    }
  });
