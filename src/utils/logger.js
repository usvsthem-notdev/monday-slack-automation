// src/utils/logger.js
// Structured JSON logger

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel() {
  if (process.env.LOG_LEVEL && LEVELS[process.env.LOG_LEVEL] !== undefined) {
    return LEVELS[process.env.LOG_LEVEL];
  }
  return process.env.NODE_ENV === 'test' ? LEVELS.error : LEVELS.info;
}

class Logger {
  constructor(context = {}, minLevel = null) {
    this._context = context;
    this._minLevel = minLevel;
  }

  _log(level, message, extra = {}) {
    const minLevel = this._minLevel !== null ? this._minLevel : getMinLevel();
    if (LEVELS[level] < minLevel) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this._context,
      ...extra
    };
    const line = JSON.stringify(entry);
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }

  debug(message, extra) { this._log('debug', message, extra); }
  info(message, extra)  { this._log('info',  message, extra); }
  warn(message, extra)  { this._log('warn',  message, extra); }
  error(message, extra) {
    if (extra instanceof Error) {
      this._log('error', message, { error: extra.message, stack: extra.stack });
    } else {
      this._log('error', message, extra);
    }
  }

  // Create a child logger with additional fixed context
  child(context) {
    return new Logger({ ...this._context, ...context }, this._minLevel);
  }
}

module.exports = new Logger();
module.exports.Logger = Logger;
