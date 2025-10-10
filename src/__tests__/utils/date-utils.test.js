/**
 * Unit tests for date utilities
 */

const {
  addDays,
  startOfDay,
  endOfDay,
  isToday,
  isOverdue,
  isWithinDays,
  formatDate,
  toISODateString,
  parseDate,
  daysBetween,
  cleanupOldDates
} = require('../../utils/date-utils');

describe('Date Utils', () => {
  describe('addDays', () => {
    it('should add days correctly', () => {
      const date = new Date('2024-01-15');
      const result = addDays(date, 5);
      expect(result.getDate()).toBe(20);
    });
    
    it('should handle month boundaries', () => {
      const date = new Date('2024-01-30');
      const result = addDays(date, 3);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(2);
    });
    
    it('should handle negative days', () => {
      const date = new Date('2024-01-15');
      const result = addDays(date, -5);
      expect(result.getDate()).toBe(10);
    });
  });
  
  describe('startOfDay', () => {
    it('should set time to start of day', () => {
      const date = new Date('2024-01-15T15:30:45.123Z');
      const result = startOfDay(date);
      
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });
  
  describe('endOfDay', () => {
    it('should set time to end of day', () => {
      const date = new Date('2024-01-15T15:30:45.123Z');
      const result = endOfDay(date);
      
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });
  });
  
  describe('isToday', () => {
    it('should identify today correctly', () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);
      expect(isToday(new Date())).toBe(true);
      
      const yesterday = addDays(today, -1);
      expect(isToday(yesterday)).toBe(false);
      
      const tomorrow = addDays(today, 1);
      expect(isToday(tomorrow)).toBe(false);
    });
  });
  
  describe('isOverdue', () => {
    it('should identify overdue dates', () => {
      const yesterday = addDays(new Date(), -1);
      expect(isOverdue(yesterday)).toBe(true);
      
      const today = new Date();
      expect(isOverdue(today)).toBe(false);
      
      const tomorrow = addDays(new Date(), 1);
      expect(isOverdue(tomorrow)).toBe(false);
      
      expect(isOverdue(null)).toBe(false);
    });
  });
  
  describe('isWithinDays', () => {
    it('should check if date is within range', () => {
      const today = new Date();
      const in3Days = addDays(today, 3);
      const in8Days = addDays(today, 8);
      const yesterday = addDays(today, -1);
      
      expect(isWithinDays(in3Days, 7)).toBe(true);
      expect(isWithinDays(in8Days, 7)).toBe(false);
      expect(isWithinDays(yesterday, 7)).toBe(false);
      expect(isWithinDays(today, 7)).toBe(true);
      expect(isWithinDays(null, 7)).toBe(false);
    });
  });
  
  describe('formatDate', () => {
    it('should format dates correctly', () => {
      const date = new Date('2024-01-15');
      const formatted = formatDate(date);
      expect(formatted).toContain('Jan');
      expect(formatted).toContain('15');
      expect(formatted).toContain('2024');
    });
    
    it('should handle null dates', () => {
      expect(formatDate(null)).toBe('No date');
      expect(formatDate('')).toBe('No date');
    });
    
    it('should handle invalid dates', () => {
      expect(formatDate('invalid')).toBe('Invalid date');
    });
  });
  
  describe('toISODateString', () => {
    it('should return ISO date string', () => {
      const date = new Date('2024-01-15T12:30:00Z');
      expect(toISODateString(date)).toBe('2024-01-15');
    });
    
    it('should handle invalid dates', () => {
      expect(toISODateString('invalid')).toBeNull();
      expect(toISODateString(null)).toBeNull();
    });
  });
  
  describe('parseDate', () => {
    it('should parse various date formats', () => {
      expect(parseDate('2024-01-15')).toBeInstanceOf(Date);
      expect(parseDate('01/15/2024')).toBeInstanceOf(Date);
      expect(parseDate('15/01/2024')).toBeInstanceOf(Date);
    });
    
    it('should return null for invalid dates', () => {
      expect(parseDate('invalid')).toBeNull();
      expect(parseDate(null)).toBeNull();
      expect(parseDate('')).toBeNull();
    });
  });
  
  describe('daysBetween', () => {
    it('should calculate days between dates', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-01-10');
      
      expect(daysBetween(date1, date2)).toBe(9);
      expect(daysBetween(date2, date1)).toBe(9); // Should be absolute
    });
    
    it('should handle same day', () => {
      const date = new Date('2024-01-15');
      expect(daysBetween(date, date)).toBe(0);
    });
  });
  
  describe('cleanupOldDates', () => {
    it('should remove old entries from Map', () => {
      const store = new Map();
      const oldDate = addDays(new Date(), -10);
      const recentDate = addDays(new Date(), -2);
      
      store.set('old', { date: oldDate.toISOString() });
      store.set('recent', { date: recentDate.toISOString() });
      
      const removed = cleanupOldDates(store, 7);
      
      expect(removed).toBe(1);
      expect(store.has('old')).toBe(false);
      expect(store.has('recent')).toBe(true);
    });
    
    it('should remove old entries from Object', () => {
      const store = {};
      const oldDate = addDays(new Date(), -10);
      const recentDate = addDays(new Date(), -2);
      
      store.old = { date: oldDate.toISOString() };
      store.recent = { date: recentDate.toISOString() };
      
      const removed = cleanupOldDates(store, 7);
      
      expect(removed).toBe(1);
      expect(store.old).toBeUndefined();
      expect(store.recent).toBeDefined();
    });
  });
});