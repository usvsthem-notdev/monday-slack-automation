const { formatSlackMessage, createTaskBlock } = require('../messageFormatter');

describe('messageFormatter', () => {
  const emptyTasks = { overdue: [], dueToday: [], upcoming: [], noDueDate: [] };

  const sampleTask = {
    id: '111',
    name: 'Fix login bug',
    boardName: 'Project Alpha',
    boardId: '1234567',
    dueDate: '2026-02-20',
    status: 'Working on it'
  };

  describe('formatSlackMessage()', () => {
    it('returns an object with a blocks array', () => {
      const result = formatSlackMessage(emptyTasks, 'John Doe');
      expect(result).toHaveProperty('blocks');
      expect(Array.isArray(result.blocks)).toBe(true);
    });

    it('includes user name in header block', () => {
      const result = formatSlackMessage(emptyTasks, 'John Doe');
      const header = result.blocks.find(b => b.type === 'header');
      expect(header).toBeDefined();
      expect(header.text.text).toContain('John Doe');
    });

    it('shows empty state when no tasks', () => {
      const result = formatSlackMessage(emptyTasks, 'Jane');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('No tasks');
    });

    it('shows overdue section when overdue tasks exist', () => {
      const tasks = { ...emptyTasks, overdue: [sampleTask] };
      const result = formatSlackMessage(tasks, 'John');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Overdue');
    });

    it('shows due today section when due today tasks exist', () => {
      const tasks = { ...emptyTasks, dueToday: [sampleTask] };
      const result = formatSlackMessage(tasks, 'John');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Due Today');
    });

    it('shows upcoming section when upcoming tasks exist', () => {
      const tasks = { ...emptyTasks, upcoming: [sampleTask] };
      const result = formatSlackMessage(tasks, 'John');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Upcoming');
    });

    it('limits overdue tasks to 5 in display', () => {
      const manyTasks = Array.from({ length: 10 }, (_, i) => ({ ...sampleTask, id: String(i) }));
      const tasks = { ...emptyTasks, overdue: manyTasks };
      const result = formatSlackMessage(tasks, 'John');
      // Count task name occurrences - should not exceed 5
      const taskBlocks = result.blocks.filter(b =>
        b.type === 'section' && b.text?.text?.includes('Fix login bug')
      );
      expect(taskBlocks.length).toBeLessThanOrEqual(5);
    });

    it('generates valid Block Kit blocks (all have type field)', () => {
      const tasks = { ...emptyTasks, overdue: [sampleTask], dueToday: [sampleTask] };
      const result = formatSlackMessage(tasks, 'John');
      result.blocks.forEach(block => {
        expect(block.type).toBeDefined();
      });
    });

    it('includes task board name in block text', () => {
      const tasks = { ...emptyTasks, upcoming: [sampleTask] };
      const result = formatSlackMessage(tasks, 'John');
      const text = JSON.stringify(result.blocks);
      expect(text).toContain('Project Alpha');
    });
  });

  describe('createTaskBlock()', () => {
    it('returns an array of blocks', () => {
      const blocks = createTaskBlock(sampleTask);
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('includes task name in block', () => {
      const blocks = createTaskBlock(sampleTask);
      const text = JSON.stringify(blocks);
      expect(text).toContain('Fix login bug');
    });

    it('includes a Complete button', () => {
      const blocks = createTaskBlock(sampleTask);
      const text = JSON.stringify(blocks);
      expect(text).toContain('Complete');
    });

    it('handles task with no dueDate gracefully', () => {
      const taskNoDue = { ...sampleTask, dueDate: null };
      expect(() => createTaskBlock(taskNoDue)).not.toThrow();
      const blocks = createTaskBlock(taskNoDue);
      const text = JSON.stringify(blocks);
      expect(text).toContain('No date');
    });

    it('includes board name in context block', () => {
      const blocks = createTaskBlock(sampleTask);
      const text = JSON.stringify(blocks);
      expect(text).toContain('Project Alpha');
    });
  });
});
