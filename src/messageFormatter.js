// Helper function to create task block with interactive buttons
function createTaskBlock(task) {
  const dueDate = task.dueDate 
    ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'No date';
  
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${task.name}*\n📅 ${dueDate} | 📍 ${task.boardName}`
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✅ Complete',
          emoji: true
        },
        action_id: `task_action_complete_${task.id}_${task.boardId}`,
        style: 'primary'
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `<https://drexcorp-company.monday.com/boards/${task.boardId}/pulses/${task.id}|View on Monday> • Status: ${task.status}`
        }
      ]
    }
  ];
}

function formatSlackMessage(tasks, userName) {
  const now = new Date();
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📋 ${userName}'s Tasks for Today`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*Updated:* ${now.toLocaleString('en-US')}` }] },
    { type: 'divider' }
  ];
  
  if (tasks.overdue.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🔴 Overdue (${tasks.overdue.length})*` } });
    tasks.overdue.slice(0, 5).forEach(task => {
      blocks.push(...createTaskBlock(task));
    });
  }
  
  if (tasks.dueToday.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🟡 Due Today (${tasks.dueToday.length})*` } });
    tasks.dueToday.forEach(task => {
      blocks.push(...createTaskBlock(task));
    });
  }
  
  if (tasks.upcoming.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🟢 Upcoming This Week (${tasks.upcoming.length})*` } });
    tasks.upcoming.slice(0, 5).forEach(task => {
      blocks.push(...createTaskBlock(task));
    });
  }
  
  if (tasks.overdue.length === 0 && tasks.dueToday.length === 0 && tasks.upcoming.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '✨ *No tasks due this week!*' } });
  }
  
  blocks.push({ type: 'divider' });
  blocks.push({ 
    type: 'context', 
    elements: [{ 
      type: 'mrkdwn', 
      text: `💡 *Tip:* Click "✅ Complete" to mark tasks as done, or use \`/tasks\` to see this list anytime` 
    }] 
  });
  
  return { blocks };
}

module.exports = { formatSlackMessage, createTaskBlock };
