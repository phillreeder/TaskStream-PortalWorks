import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { SystemTraceAdapter, SystemTraceRecord } from './types.js';

export interface FileSystemTraceAdapterOptions {
  readonly outputDir: string;
  readonly traceFileName?: string;
  readonly logFileName?: string;
}

export class FileSystemTraceAdapter implements SystemTraceAdapter {
  readonly traceFilePath: string;
  readonly logFilePath: string;
  private ready?: Promise<void>;

  constructor(options: FileSystemTraceAdapterOptions) {
    this.traceFilePath = path.join(options.outputDir, options.traceFileName ?? 'systemtrace.jsonl');
    this.logFilePath = path.join(options.outputDir, options.logFileName ?? 'systemtrace.log');
  }

  async append(record: SystemTraceRecord): Promise<void> {
    await this.ensureReady();
    await appendFile(this.traceFilePath, `${JSON.stringify(record)}\n`, 'utf8');
    await appendFile(this.logFilePath, `${formatHumanLine(record)}\n`, 'utf8');
  }

  async flush(): Promise<void> {
    await this.ensureReady();
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = mkdir(path.dirname(this.traceFilePath), { recursive: true })
        .then(() => mkdir(path.dirname(this.logFilePath), { recursive: true }))
        .then(() => undefined);
    }
    return this.ready;
  }
}

function formatHumanLine(record: SystemTraceRecord): string {
  const operation = record.operation ?? record.eventType ?? record.message ?? 'record';
  const status = record.status ?? record.severity ?? record.phase ?? 'point';
  return `${record.seq} ${record.timestamp} ${record.family.toUpperCase()} ${status} ${operation}`;
}
