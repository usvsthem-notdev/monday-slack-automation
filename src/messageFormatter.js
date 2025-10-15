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
        text: `*${task.name}*\n📅 ${dueDate} | 📍 ${task.boardName} | Status: ${task.status}`
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Complete',
            emoji: true
          },
          action_id: `task_action_complete_${task.id}_${task.boardId}`,
          style: 'primary'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📝 Update',
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
            text: '🔗 View',
            emoji: true
          },
          url: `https://drexcorp-company.monday.com/boards/${task.boardId}/pulses/${task.id}`
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
      text: `💡 *Quick Actions:* ✅ Complete • 📝 Update status • 📅 Postpone by 1 day • 🔗 View full details` 
    }] 
  });
  
  return { blocks };
}

module.exports = { formatSlackMessage, createTaskBlock };
