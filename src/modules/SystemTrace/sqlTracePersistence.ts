import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  SystemTraceAdapter,
  SystemTracePhase,
  SystemTraceRecord,
  SystemTraceRecordFamily,
  SystemTraceSeverity,
  SystemTraceStatus,
} from './types.js';

export type SqlSystemTraceRecord = {
  id: string;
  seq: number;
  timestamp: string;
  family: string;
  severity: string | null;
  operation: string;
  phase: string | null;
  status: string | null;
  message: string | null;
  correlationId: string | null;
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
  runId: string | null;
  requestId: string | null;
  component: string | null;
  sourceTaskId: string | null;
  sourceEventId: string | null;
  sourceQueueItemId: string | null;
  tenantProcessId: string | null;
  channelId: string | null;
  flowId: string | null;
  executionId: string | null;
  workEntryId: string | null;
  tags: readonly string[];
  context: unknown;
  data: unknown;
  raw: SystemTraceRecord;
};

export type SqlSystemTraceFilters = {
  correlationId?: string;
  sourceTaskId?: string;
  sourceEventId?: string;
  sourceQueueItemId?: string;
  tenantProcessId?: string;
  channelId?: string;
  flowId?: string;
  executionId?: string;
  runId?: string;
  workEntryId?: string;
  operation?: string;
  severity?: string;
  family?: string;
};

type TraceRow = {
  id: string;
  seq: number;
  timestamp: string;
  family: string;
  severity: string | null;
  operation: string;
  phase: string | null;
  status: string | null;
  message: string | null;
  correlation_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  parent_span_id: string | null;
  run_id: string | null;
  request_id: string | null;
  component: string | null;
  source_task_id: string | null;
  source_event_id: string | null;
  source_queue_item_id: string | null;
  tenant_process_id: string | null;
  channel_id: string | null;
  flow_id: string | null;
  execution_id: string | null;
  work_entry_id: string | null;
  tags_json: string | null;
  context_json: string | null;
  data_json: string | null;
  raw_json: string | null;
};

export class SqlSystemTraceAdapter implements SystemTraceAdapter {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.createSchema();
  }

  public async append(record: SystemTraceRecord): Promise<void> {
    const context = isRecord(record.context) ? record.context : {};
    const data = isRecord(record.data) ? record.data : {};
    const sourceTaskId = readString(context.sourceTaskId) ?? readString(data.sourceTaskId);
    const sourceEventId = readString(context.sourceEventId) ?? readString(data.sourceEventId);
    const sourceQueueItemId = readString(context.sourceQueueItemId) ?? readString(data.sourceQueueItemId);
    const tenantProcessId = readString(context.tenantProcessId) ?? readString(data.tenantProcessId);
    const channelId = readString(context.channelId) ?? readString(data.channelId);
    const flowId = readString(context.flowId) ?? readString(data.flowId);
    const executionId = readString(context.executionId) ?? readString(data.executionId) ?? record.runId ?? null;
    const workEntryId = readString(context.workEntryId) ?? readString(data.workEntryId);

    this.database
      .prepare(
        `INSERT INTO system_trace_records (id,seq,timestamp,family,severity,operation,phase,status,message,correlation_id,trace_id,span_id,parent_span_id,run_id,request_id,component,source_task_id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_entry_id,tags_json,context_json,data_json,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        record.seq,
        record.timestamp,
        record.family,
        record.severity ?? null,
        record.operation ?? 'unknown',
        record.phase ?? null,
        record.status ?? null,
        record.message ?? null,
        record.correlationId ?? null,
        record.traceId ?? null,
        record.spanId ?? null,
        record.parentSpanId ?? null,
        record.runId ?? null,
        record.requestId ?? null,
        record.component ?? null,
        sourceTaskId,
        sourceEventId,
        sourceQueueItemId,
        tenantProcessId,
        channelId,
        flowId,
        executionId,
        workEntryId,
        JSON.stringify(record.tags),
        record.context === undefined ? null : JSON.stringify(record.context),
        record.data === undefined ? null : JSON.stringify(record.data),
        JSON.stringify(record),
      );
  }

  public async flush(): Promise<void> {}

  public close(): void {
    this.database.close();
  }

  private createSchema(): void {
    createSystemTraceSchema(this.database);
  }
}

export class SqlSystemTraceQueryRepository {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.createSchema();
  }

  public list(filters: SqlSystemTraceFilters = {}): SqlSystemTraceRecord[] {
    const { clause, parameters } = buildWhereClause(filters);
    const rows = this.database
      .prepare(
        `SELECT id,seq,timestamp,family,severity,operation,phase,status,message,correlation_id,trace_id,span_id,parent_span_id,run_id,request_id,component,source_task_id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_entry_id,tags_json,context_json,data_json,raw_json FROM system_trace_records ${clause} ORDER BY timestamp,seq,id`,
      )
      .all(...parameters) as TraceRow[];
    return rows.map(toSqlSystemTraceRecord);
  }

  public clear(): void {
    this.database.exec('DELETE FROM system_trace_records;');
  }

  public close(): void {
    this.database.close();
  }

  private createSchema(): void {
    createSystemTraceSchema(this.database);
  }
}

function createSystemTraceSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS system_trace_records (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      family TEXT NOT NULL,
      severity TEXT,
      operation TEXT NOT NULL,
      phase TEXT,
      status TEXT,
      message TEXT,
      correlation_id TEXT,
      trace_id TEXT,
      span_id TEXT,
      parent_span_id TEXT,
      run_id TEXT,
      request_id TEXT,
      component TEXT,
      source_task_id TEXT,
      source_event_id TEXT,
      source_queue_item_id TEXT,
      tenant_process_id TEXT,
      channel_id TEXT,
      flow_id TEXT,
      execution_id TEXT,
      work_entry_id TEXT,
      tags_json TEXT NOT NULL,
      context_json TEXT,
      data_json TEXT,
      raw_json TEXT NOT NULL
    );
  `);
  migrateSystemTraceSchema(database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS system_trace_records_correlation_idx ON system_trace_records(correlation_id,timestamp,seq);
    CREATE INDEX IF NOT EXISTS system_trace_records_source_idx ON system_trace_records(source_task_id,source_event_id,source_queue_item_id,work_entry_id);
    CREATE INDEX IF NOT EXISTS system_trace_records_execution_idx ON system_trace_records(tenant_process_id,channel_id,flow_id,execution_id,run_id);
  `);
}

function migrateSystemTraceSchema(database: DatabaseSync): void {
  const existingColumns = new Set(
    (database.prepare(`PRAGMA table_info(system_trace_records)`).all() as Array<{ name: string }>).map((column) => column.name),
  );
  const expectedColumns: Array<readonly [string, string]> = [
    ['id', 'TEXT'],
    ['seq', 'INTEGER'],
    ['timestamp', 'TEXT'],
    ['family', 'TEXT'],
    ['severity', 'TEXT'],
    ['operation', 'TEXT'],
    ['phase', 'TEXT'],
    ['status', 'TEXT'],
    ['message', 'TEXT'],
    ['correlation_id', 'TEXT'],
    ['trace_id', 'TEXT'],
    ['span_id', 'TEXT'],
    ['parent_span_id', 'TEXT'],
    ['run_id', 'TEXT'],
    ['request_id', 'TEXT'],
    ['component', 'TEXT'],
    ['source_task_id', 'TEXT'],
    ['source_event_id', 'TEXT'],
    ['source_queue_item_id', 'TEXT'],
    ['tenant_process_id', 'TEXT'],
    ['channel_id', 'TEXT'],
    ['flow_id', 'TEXT'],
    ['execution_id', 'TEXT'],
    ['work_entry_id', 'TEXT'],
    ['tags_json', 'TEXT'],
    ['context_json', 'TEXT'],
    ['data_json', 'TEXT'],
    ['raw_json', 'TEXT'],
  ];

  for (const [column, type] of expectedColumns) {
    if (!existingColumns.has(column)) {
      database.exec(`ALTER TABLE system_trace_records ADD COLUMN ${column} ${type};`);
    }
  }
}

function buildWhereClause(filters: SqlSystemTraceFilters): { clause: string; parameters: string[] } {
  const conditions: string[] = [];
  const parameters: string[] = [];
  const add = (column: string, value: string | undefined) => {
    if (value) {
      conditions.push(`${column}=?`);
      parameters.push(value);
    }
  };

  add('correlation_id', filters.correlationId);
  add('source_task_id', filters.sourceTaskId);
  add('source_event_id', filters.sourceEventId);
  add('source_queue_item_id', filters.sourceQueueItemId);
  add('tenant_process_id', filters.tenantProcessId);
  add('channel_id', filters.channelId);
  add('flow_id', filters.flowId);
  add('execution_id', filters.executionId);
  add('run_id', filters.runId);
  add('work_entry_id', filters.workEntryId);
  add('operation', filters.operation);
  add('severity', filters.severity);
  add('family', filters.family);

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    parameters,
  };
}

function toSqlSystemTraceRecord(row: TraceRow): SqlSystemTraceRecord {
  return {
    id: row.id,
    seq: row.seq,
    timestamp: row.timestamp,
    family: row.family,
    severity: row.severity,
    operation: row.operation,
    phase: row.phase,
    status: row.status,
    message: row.message,
    correlationId: row.correlation_id,
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    runId: row.run_id,
    requestId: row.request_id,
    component: row.component,
    sourceTaskId: row.source_task_id,
    sourceEventId: row.source_event_id,
    sourceQueueItemId: row.source_queue_item_id,
    tenantProcessId: row.tenant_process_id,
    channelId: row.channel_id,
    flowId: row.flow_id,
    executionId: row.execution_id,
    workEntryId: row.work_entry_id,
    tags: row.tags_json ? (JSON.parse(row.tags_json) as readonly string[]) : [],
    context: row.context_json ? JSON.parse(row.context_json) : undefined,
    data: row.data_json ? JSON.parse(row.data_json) : undefined,
    raw: row.raw_json ? (JSON.parse(row.raw_json) as SystemTraceRecord) : toRawTraceRecord(row),
  };
}

function toRawTraceRecord(row: TraceRow): SystemTraceRecord {
  return {
    seq: row.seq,
    timestamp: row.timestamp,
    family: toTraceFamily(row.family),
    severity: toTraceSeverity(row.severity),
    operation: row.operation,
    phase: toTracePhase(row.phase),
    status: toTraceStatus(row.status),
    message: row.message ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    traceId: row.trace_id ?? undefined,
    spanId: row.span_id ?? undefined,
    parentSpanId: row.parent_span_id ?? undefined,
    runId: row.run_id ?? undefined,
    requestId: row.request_id ?? undefined,
    component: row.component ?? undefined,
    tags: [],
  };
}

function toTraceFamily(value: string): SystemTraceRecordFamily {
  return value === 'log' || value === 'trace' || value === 'telemetry' || value === 'span' ? value : 'trace';
}

function toTraceSeverity(value: string | null): SystemTraceSeverity | undefined {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : undefined;
}

function toTracePhase(value: string | null): SystemTracePhase | undefined {
  return value === 'START' || value === 'END' || value === 'POINT' || value === 'ERROR' ? value : undefined;
}

function toTraceStatus(value: string | null): SystemTraceStatus | undefined {
  return value === 'ok' || value === 'error' || value === 'rejected' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
