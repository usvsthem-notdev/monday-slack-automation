const { Logger } = require('../utils/logger');

describe('Logger', () => {
  let logger;
  let stdoutWrite, stderrWrite;

  beforeEach(() => {
    // minLevel=0 (debug) so all levels are logged in tests
    logger = new Logger({ service: 'test' }, 0);
    stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  describe('log levels', () => {
    it('writes info to stdout as JSON', () => {
      logger.info('test message', { key: 'value' });
      expect(stdoutWrite).toHaveBeenCalled();
      const arg = stdoutWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test message');
      expect(parsed.key).toBe('value');
    });

    it('writes error to stderr as JSON', () => {
      logger.error('error occurred', { code: 500 });
      expect(stderrWrite).toHaveBeenCalled();
      const arg = stderrWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('error occurred');
    });

    it('accepts Error objects for error()', () => {
      logger.error('something failed', new Error('boom'));
      expect(stderrWrite).toHaveBeenCalled();
      const arg = stderrWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.error).toBe('boom');
      expect(parsed.stack).toBeDefined();
    });

    it('includes timestamp in every log entry', () => {
      logger.info('check timestamp');
      const arg = stdoutWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
    });

    it('includes context fields set in constructor', () => {
      logger.info('hello');
      const arg = stdoutWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.service).toBe('test');
    });
  });

  describe('warn()', () => {
    it('writes warn to stdout', () => {
      logger.warn('warning message', { code: 'W001' });
      expect(stdoutWrite).toHaveBeenCalled();
      const parsed = JSON.parse(stdoutWrite.mock.calls[0][0]);
      expect(parsed.level).toBe('warn');
    });
  });

  describe('debug()', () => {
    it('writes debug to stdout', () => {
      logger.debug('debug message');
      expect(stdoutWrite).toHaveBeenCalled();
      const parsed = JSON.parse(stdoutWrite.mock.calls[0][0]);
      expect(parsed.level).toBe('debug');
    });
  });

  describe('error() with non-Error extra', () => {
    it('writes error with plain object', () => {
      logger.error('error message', { code: 500 });
      expect(stderrWrite).toHaveBeenCalled();
      const parsed = JSON.parse(stderrWrite.mock.calls[0][0]);
      expect(parsed.level).toBe('error');
      expect(parsed.code).toBe(500);
    });
  });

  describe('getMinLevel() branching', () => {
    it('uses LOG_LEVEL env var when set to a known level', () => {
      const origEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'warn';

      // Create a logger without explicit minLevel so getMinLevel() is invoked
      const dynamicLogger = new Logger({ test: true });
      const warnSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

      // info (level 1) should be suppressed at warn (level 2)
      dynamicLogger.info('should be suppressed');
      expect(warnSpy).not.toHaveBeenCalled();

      // warn should pass
      dynamicLogger.warn('should appear');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      if (origEnv === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = origEnv;
    });

    it('falls back to info level in non-test NODE_ENV', () => {
      const origEnv = process.env.NODE_ENV;
      const origLog = process.env.LOG_LEVEL;
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_LEVEL;

      const prodLogger = new Logger({});
      const spy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

      prodLogger.info('should appear in production');
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
      process.env.NODE_ENV = origEnv;
      if (origLog !== undefined) process.env.LOG_LEVEL = origLog;
    });
  });

  describe('child()', () => {
    it('creates a new logger with merged context', () => {
      const child = logger.child({ requestId: 'req-123' });
      child.info('child log');
      const arg = stdoutWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.service).toBe('test');
      expect(parsed.requestId).toBe('req-123');
    });

    it('child does not affect parent context', () => {
      logger.child({ extra: 'field' });
      logger.info('parent log');
      const arg = stdoutWrite.mock.calls[0][0];
      const parsed = JSON.parse(arg);
      expect(parsed.extra).toBeUndefined();
    });
  });
});
