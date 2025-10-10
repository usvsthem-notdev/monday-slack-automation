/**
 * Unit tests for automation functions
 */

const { 
  organizeTasks, 
  formatSlackMessage 
} = require('../automation-optimized');

const {
  isToday,
  isOverdue,
  addDays
} = require('../utils/date-utils');

describe('Automation Tests', () => {
  describe('organizeTasks', () => {
    it('should categorize tasks correctly', () => {
      const today = new Date();
      const yesterday = addDays(today, -1);
      const tomorrow = addDays(today, 1);
      const nextWeek = addDays(today, 10);
      
      const tasks = [
        { id: '1', name: 'Overdue task', dueDate: yesterday.toISOString() },
        { id: '2', name: 'Today task', dueDate: today.toISOString() },
        { id: '3', name: 'Tomorrow task', dueDate: tomorrow.toISOString() },
        { id: '4', name: 'Next week task', dueDate: nextWeek.toISOString() },
        { id: '5', name: 'No date task', dueDate: null }
      ];
      
      const organized = organizeTasks(tasks);
      
      expect(organized.overdue).toHaveLength(1);
      expect(organized.overdue[0].id).toBe('1');
      
      expect(organized.dueToday).toHaveLength(1);
      expect(organized.dueToday[0].id).toBe('2');
      
      expect(organized.upcoming).toHaveLength(1);
      expect(organized.upcoming[0].id).toBe('3');
      
      expect(organized.noDueDate).toHaveLength(2);
    });
    
    it('should handle empty task list', () => {
      const organized = organizeTasks([]);
      
      expect(organized.overdue).toHaveLength(0);
      expect(organized.dueToday).toHaveLength(0);
      expect(organized.upcoming).toHaveLength(0);
      expect(organized.noDueDate).toHaveLength(0);
    });
    
    it('should sort tasks by date within categories', () => {
      const date1 = addDays(new Date(), -3);
      const date2 = addDays(new Date(), -1);
      const date3 = addDays(new Date(), -2);
      
      const tasks = [
        { id: '1', name: 'Task 1', dueDate: date1.toISOString() },
        { id: '2', name: 'Task 2', dueDate: date2.toISOString() },
        { id: '3', name: 'Task 3', dueDate: date3.toISOString() }
      ];
      
      const organized = organizeTasks(tasks);
      
      expect(organized.overdue[0].id).toBe('1');
      expect(organized.overdue[1].id).toBe('3');
      expect(organized.overdue[2].id).toBe('2');
    });
  });
  
  describe('formatSlackMessage', () => {
    it('should format message with tasks', () => {
      const tasks = {
        overdue: [
          { id: '1', name: 'Overdue Task', dueDate: '2024-01-01', boardName: 'Board 1', status: 'In Progress' }
        ],
        dueToday: [
          { id: '2', name: 'Today Task', dueDate: new Date().toISOString(), boardName: 'Board 2', status: 'Working' }
        ],
        upcoming: [],
        noDueDate: []
      };
      
      const message = formatSlackMessage(tasks, 'Test User');
      
      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);
      
      // Check header
      const header = message.blocks.find(b => b.type === 'header');
      expect(header).toBeDefined();
      expect(header.text.text).toContain('Test User');
      
      // Check for task sections
      const sections = message.blocks.filter(b => b.type === 'section');
      expect(sections.length).toBeGreaterThan(0);
    });
    
    it('should show no tasks message when empty', () => {
      const tasks = {
        overdue: [],
        dueToday: [],
        upcoming: [],
        noDueDate: []
      };
      
      const message = formatSlackMessage(tasks, 'Test User');
      
      const noTasksSection = message.blocks.find(b => 
        b.type === 'section' && 
        b.text?.text?.includes('No tasks due this week')
      );
      
      expect(noTasksSection).toBeDefined();
    });
    
    it('should include action buttons for tasks', () => {
      const tasks = {
        overdue: [],
        dueToday: [
          { 
            id: '123', 
            boardId: '456', 
            name: 'Test Task', 
            dueDate: new Date().toISOString(), 
            boardName: 'Test Board', 
            status: 'Working' 
          }
        ],
        upcoming: [],
        noDueDate: []
      };
      
      const message = formatSlackMessage(tasks, 'Test User');
      
      const actionBlock = message.blocks.find(b => 
        b.type === 'actions' && 
        b.elements?.some(e => e.action_id?.includes('task_action'))
      );
      
      expect(actionBlock).toBeDefined();
      expect(actionBlock.elements).toHaveLength(4); // Complete, Update, Postpone, View
    });
  });
});