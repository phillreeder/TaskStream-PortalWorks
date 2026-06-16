import type { LogContext, LogEntry, LogLevel, Logger } from '../../domain/contracts/logger.js';

export interface BasicLoggerOptions {
  console?: boolean;
  defaultContext?: LogContext;
  clock?: () => string;
}

const now = () => new Date().toISOString();

export class BasicLogger implements Logger {
  private readonly records: LogEntry[] = [];
  private readonly emitToConsole: boolean;
  private readonly context: LogContext;
  private readonly clock: () => string;

  constructor(options: BasicLoggerOptions = {}) {
    this.emitToConsole = options.console ?? false;
    this.context = options.defaultContext ?? {};
    this.clock = options.clock ?? now;
  }

  log(level: LogLevel, message: string, context: LogContext = {}): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: this.clock(),
      context: { ...this.context, ...context },
    };
    this.records.push(entry);
    if (this.emitToConsole) {
      this.forwardToConsole(entry);
    }
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
    return this.records;
  }

  child(context: LogContext): Logger {
    return new BasicLogger({
      console: this.emitToConsole,
      defaultContext: { ...this.context, ...context },
      clock: this.clock,
    });
  }

  private forwardToConsole(entry: LogEntry) {
    const payload = { ...entry.context, msg: entry.message, ts: entry.timestamp };
    switch (entry.level) {
      case 'debug':
        console.debug(payload);
        break;
      case 'info':
        console.info(payload);
        break;
      case 'warn':
        console.warn(payload);
        break;
      case 'error':
        console.error(payload);
        break;
      default:
        console.log(payload);
    }
  }
}
