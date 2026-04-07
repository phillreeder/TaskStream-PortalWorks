import type { LogContext, LogEntry, Logger } from '../../domain/contracts/logger.ts';

export class MockLogger implements Logger {
  private readonly entriesLog: LogEntry[] = [];
  private readonly defaultContext: LogContext;

  constructor(context: LogContext = {}) {
    this.defaultContext = context;
  }

  log(level: LogEntry['level'], message: string, context: LogContext = {}): void {
    this.entriesLog.push({
      level,
      message,
      context: { ...this.defaultContext, ...context },
      timestamp: new Date().toISOString(),
    });
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  entries(): readonly LogEntry[] {
    return this.entriesLog;
  }

  child(context: LogContext): Logger {
    return new MockLogger({ ...this.defaultContext, ...context });
  }
}
