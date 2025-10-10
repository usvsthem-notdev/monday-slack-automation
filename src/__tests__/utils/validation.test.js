/**
 * Unit tests for validation utilities
 */

const {
  validateTaskId,
  validateBoardId,
  safeJsonParse,
  validateEmail,
  sanitizeForGraphQL,
  validateDate
} = require('../../utils/validation');

describe('Validation Utils', () => {
  describe('validateTaskId', () => {
    it('should validate numeric string IDs', () => {
      expect(validateTaskId('123456')).toBe('123456');
      expect(validateTaskId('  789  ')).toBe('789');
    });
    
    it('should reject invalid IDs', () => {
      expect(validateTaskId(null)).toBeNull();
      expect(validateTaskId('')).toBeNull();
      expect(validateTaskId('abc123')).toBeNull();
      expect(validateTaskId('12.34')).toBeNull();
      expect(validateTaskId({})).toBeNull();
    });
  });
  
  describe('validateBoardId', () => {
    it('should validate board IDs same as task IDs', () => {
      expect(validateBoardId('987654')).toBe('987654');
      expect(validateBoardId('invalid')).toBeNull();
    });
  });
  
  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"key": "value"}')).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
    });
    
    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid json', {})).toEqual({});
      expect(safeJsonParse(null, 'default')).toBe('default');
      expect(safeJsonParse('', [])).toEqual([]);
    });
    
    it('should handle edge cases', () => {
      expect(safeJsonParse('null', {})).toBeNull();
      expect(safeJsonParse('true', false)).toBe(true);
      expect(safeJsonParse('123', 0)).toBe(123);
    });
  });
  
  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@company.co.uk')).toBe(true);
      expect(validateEmail('name+tag@domain.org')).toBe(true);
    });
    
    it('should reject invalid email formats', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user @example.com')).toBe(false);
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });
  
  describe('sanitizeForGraphQL', () => {
    it('should escape special characters', () => {
      expect(sanitizeForGraphQL('Hello "World"')).toBe('Hello \\"World\\"');
      expect(sanitizeForGraphQL('Line\nBreak')).toBe('Line\\nBreak');
      expect(sanitizeForGraphQL('Tab\tCharacter')).toBe('Tab\\tCharacter');
      expect(sanitizeForGraphQL('Backslash\\')).toBe('Backslash\\\\');
    });
    
    it('should handle edge cases', () => {
      expect(sanitizeForGraphQL(null)).toBe('');
      expect(sanitizeForGraphQL('')).toBe('');
      expect(sanitizeForGraphQL(123)).toBe('');
    });
  });
  
  describe('validateDate', () => {
    it('should validate correct date formats', () => {
      expect(validateDate('2024-01-01')).toBe(true);
      expect(validateDate('2024-01-01T12:00:00Z')).toBe(true);
      expect(validateDate(new Date().toISOString())).toBe(true);
    });
    
    it('should reject invalid dates', () => {
      expect(validateDate('not a date')).toBe(false);
      expect(validateDate('2024-13-01')).toBe(false);
      expect(validateDate('2024-01-32')).toBe(false);
      expect(validateDate(null)).toBe(false);
      expect(validateDate('')).toBe(false);
    });
  });
});