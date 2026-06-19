import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  POC_ENTITY_STRUCTURES,
  TASK_EVENT_STRUCTURE as EVENT_STRUCTURE,
  TASK_STRUCTURE,
} from '../../../entity-structures/index.js';
import { resolvePocEventReaction } from '../../../events/EventReactionResolver.js';
import type { TaskFilters, TaskStorageGateway } from './TaskStorageGateway.js';
import {
  TASK_ENTITY_TYPE,
  TASK_SCHEMA_VERSION,
  type CreateProcessWorkEntryInput,
  type CreateTaskInput,
  type EntityStructureVersion,
  type PersistentQueueItem,
  type PocExecutionTraceRecord,
  type ProcessWorkEntry,
  type RecordEventInput,
  type StoredEvent,
  type StoredTask,
  type TaskUpdateSignal,
} from './types.js';

type TaskRow = {
  id: string;
  tenant_id: string;
  tenant_process_id: string;
  entity_type: string;
  schema_version: number;
  data_json: string;
  created_at: string;
  updated_at: string;
};
type SignalRow = {
  id: string;
  task_id: string;
  tenant_id: string;
  tenant_process_id: string;
  status: 'queued';
  created_at: string;
};
type StructureRow = { entity_type: string; version: number; structure_json: string; created_at: string };
type EventRow = {
  id: string;
  event_type: string;
  source_entity_type: string;
  source_entity_id: string;
  entity_structure_type: string;
  entity_structure_version: number;
  payload_json: string;
  occurred_at: string;
};
type QueueRow = {
  id: string;
  source_event_id: string;
  event_reaction_id: string;
  intent_type: string;
  handler_key: string;
  status: PersistentQueueItem['status'];
  attempt_count: number;
  available_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  last_error: string | null;
  created_at: string;
};
type WorkRow = {
  id: string;
  source_event_id: string;
  source_queue_item_id: string;
  tenant_process_id: string;
  channel_id: string;
  flow_id: string;
  execution_id: string;
  work_type: string;
  status: string;
  payload_json: string;
  created_at: string;
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
  source_task_id: string | null;
  source_event_id: string | null;
  source_queue_item_id: string | null;
  tenant_process_id: string | null;
  channel_id: string | null;
  flow_id: string | null;
  execution_id: string | null;
  work_entry_id: string | null;
  raw_json: string;
};

export class SqliteTaskStorageGateway implements TaskStorageGateway {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON;');
    this.createSchema();
    this.registerEntityStructures();
  }

  public async createTask(input: CreateTaskInput): Promise<{ id: string }> {
    const name = input.data.name.trim();
    if (!name) throw new Error('Task name is required.');

    const id = randomUUID();
    const timestamp = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database
        .prepare(
          `INSERT INTO tasks (id,tenant_id,tenant_process_id,entity_type,schema_version,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          'IEBBeta',
          'Test1',
          TASK_ENTITY_TYPE,
          TASK_SCHEMA_VERSION,
          JSON.stringify({ name }),
          timestamp,
          timestamp,
        );
      this.insertEvent({
        eventType: 'task.created',
        sourceEntityType: TASK_ENTITY_TYPE,
        sourceEntityId: id,
        payload: { taskId: id, taskName: name, tenantId: 'IEBBeta', tenantProcessId: 'Test1' },
        occurredAt: timestamp,
      });
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }

    return { id };
  }

  public async listTasks(filters: TaskFilters = {}): Promise<StoredTask[]> {
    const { clause, parameters } = this.filters(filters);
    const rows = this.database
      .prepare(
        `SELECT id,tenant_id,tenant_process_id,entity_type,schema_version,data_json,created_at,updated_at FROM tasks ${clause} ORDER BY created_at,id`,
      )
      .all(...parameters) as TaskRow[];
    return rows.map((row) => this.toStoredTask(row));
  }

  public async getTask(id: string): Promise<StoredTask | null> {
    const row = this.database
      .prepare(
        `SELECT id,tenant_id,tenant_process_id,entity_type,schema_version,data_json,created_at,updated_at FROM tasks WHERE id=?`,
      )
      .get(id) as TaskRow | undefined;
    return row ? this.toStoredTask(row) : null;
  }

  public async signalTaskUpdate(taskId: string): Promise<TaskUpdateSignal | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const signal: TaskUpdateSignal = {
      id: randomUUID(),
      taskId,
      tenantId: task.tenantId,
      tenantProcessId: task.tenantProcessId,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database
        .prepare(
          `INSERT INTO task_update_signals (id,task_id,tenant_id,tenant_process_id,status,created_at) VALUES (?,?,?,?,?,?)`,
        )
        .run(signal.id, signal.taskId, signal.tenantId, signal.tenantProcessId, signal.status, signal.createdAt);
      this.insertEvent({
        eventType: 'task.updated',
        sourceEntityType: TASK_ENTITY_TYPE,
        sourceEntityId: taskId,
        payload: { taskId, signalId: signal.id, tenantId: task.tenantId, tenantProcessId: task.tenantProcessId },
        occurredAt: signal.createdAt,
      });
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }

    return signal;
  }

  public async listTaskUpdateSignals(filters: TaskFilters = {}): Promise<TaskUpdateSignal[]> {
    const { clause, parameters } = this.filters(filters);
    const rows = this.database
      .prepare(
        `SELECT id,task_id,tenant_id,tenant_process_id,status,created_at FROM task_update_signals ${clause} ORDER BY created_at,id`,
      )
      .all(...parameters) as SignalRow[];
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      tenantId: row.tenant_id as 'IEBBeta',
      tenantProcessId: row.tenant_process_id as 'Test1',
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  public async recordEvent(input: RecordEventInput): Promise<StoredEvent> {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      const event = this.insertEvent(input);
      this.database.exec('COMMIT;');
      return event;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  public async getEvent(id: string): Promise<StoredEvent | null> {
    const row = this.database
      .prepare(
        `SELECT id,event_type,source_entity_type,source_entity_id,entity_structure_type,entity_structure_version,payload_json,occurred_at FROM events WHERE id=?`,
      )
      .get(id) as EventRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  public async listEvents(): Promise<StoredEvent[]> {
    return (
      this.database
        .prepare(
          `SELECT id,event_type,source_entity_type,source_entity_id,entity_structure_type,entity_structure_version,payload_json,occurred_at FROM events ORDER BY occurred_at,id`,
        )
        .all() as EventRow[]
    ).map(this.toEvent);
  }

  public async listPersistentQueueItems(): Promise<PersistentQueueItem[]> {
    return (
      this.database
        .prepare(
          `SELECT id,source_event_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at FROM persistent_queue_items ORDER BY created_at,id`,
        )
        .all() as QueueRow[]
    ).map(this.toQueueItem);
  }

  public async claimNextPersistentQueueItem(workerId: string): Promise<PersistentQueueItem | null> {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `UPDATE persistent_queue_items SET status='claimed',claimed_by=?,claimed_at=?,attempt_count=attempt_count+1,last_error=NULL WHERE id=(SELECT id FROM persistent_queue_items WHERE status='queued' AND available_at<=? ORDER BY created_at,id LIMIT 1) AND status='queued' RETURNING id,source_event_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at`,
      )
      .get(workerId, now, now) as QueueRow | undefined;
    return row ? this.toQueueItem(row) : null;
  }

  public async completePersistentQueueItem(id: string): Promise<PersistentQueueItem> {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `UPDATE persistent_queue_items SET status='completed',completed_at=?,last_error=NULL WHERE id=? AND status='claimed' RETURNING id,source_event_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at`,
      )
      .get(now, id) as QueueRow | undefined;
    if (!row) throw new Error(`Persistent queue item is not claimed or was not found: ${id}`);
    return this.toQueueItem(row);
  }

  public async failPersistentQueueItem(id: string, lastError: string): Promise<PersistentQueueItem> {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `UPDATE persistent_queue_items SET status='failed',failed_at=?,last_error=? WHERE id=? AND status='claimed' RETURNING id,source_event_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at`,
      )
      .get(now, lastError, id) as QueueRow | undefined;
    if (!row) throw new Error(`Persistent queue item is not claimed or was not found: ${id}`);
    return this.toQueueItem(row);
  }

  public async createProcessWorkEntry(input: CreateProcessWorkEntryInput): Promise<ProcessWorkEntry> {
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT OR IGNORE INTO process_work_entries (id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_type,status,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        input.sourceEventId,
        input.sourceQueueItemId,
        input.tenantProcessId,
        input.channelId,
        input.flowId,
        input.executionId,
        input.workType,
        input.status,
        JSON.stringify(input.payload),
        createdAt,
      );

    const row = this.database
      .prepare(
        `SELECT id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_type,status,payload_json,created_at FROM process_work_entries WHERE source_queue_item_id=?`,
      )
      .get(input.sourceQueueItemId) as WorkRow | undefined;
    if (!row) throw new Error(`Process work entry was not created for queue item: ${input.sourceQueueItemId}`);
    return this.toWorkEntry(row);
  }

  public async listProcessWorkEntries(): Promise<ProcessWorkEntry[]> {
    return (
      this.database
        .prepare(
          `SELECT id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_type,status,payload_json,created_at FROM process_work_entries ORDER BY created_at,id`,
        )
        .all() as WorkRow[]
    ).map(this.toWorkEntry);
  }

  public async appendSystemTraceRecord(record: Record<string, unknown>): Promise<void> {
    const context = isPlainRecord(record.context) ? record.context : {};
    const data = isPlainRecord(record.data) ? record.data : {};
    const sourceTaskId = readString(context.sourceTaskId) ?? readString(data.sourceTaskId);
    const sourceEventId = readString(context.sourceEventId) ?? readString(data.sourceEventId);
    const sourceQueueItemId = readString(context.sourceQueueItemId) ?? readString(data.sourceQueueItemId);
    const tenantProcessId = readString(context.tenantProcessId) ?? readString(data.tenantProcessId);
    const channelId = readString(context.channelId) ?? readString(data.channelId);
    const flowId = readString(context.flowId) ?? readString(data.flowId);
    const executionId = readString(context.executionId) ?? readString(data.executionId) ?? readString(record.runId);
    const workEntryId = readString(context.workEntryId) ?? readString(data.workEntryId);

    this.database
      .prepare(
        `INSERT INTO system_trace_records (id,seq,timestamp,family,severity,operation,phase,status,message,correlation_id,source_task_id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_entry_id,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        readNumber(record.seq) ?? 0,
        readString(record.timestamp) ?? new Date().toISOString(),
        readString(record.family) ?? 'trace',
        readString(record.severity),
        readString(record.operation) ?? 'unknown',
        readString(record.phase),
        readString(record.status),
        readString(record.message),
        readString(record.correlationId),
        sourceTaskId,
        sourceEventId,
        sourceQueueItemId,
        tenantProcessId,
        channelId,
        flowId,
        executionId,
        workEntryId,
        JSON.stringify(record),
      );
  }

  public async listSystemTraceRecords(): Promise<PocExecutionTraceRecord[]> {
    return (
      this.database
        .prepare(
          `SELECT id,seq,timestamp,family,severity,operation,phase,status,message,correlation_id,source_task_id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_entry_id,raw_json FROM system_trace_records ORDER BY timestamp,seq,id`,
        )
        .all() as TraceRow[]
    ).map(this.toTraceRecord);
  }

  public async listEntityStructureVersions(): Promise<EntityStructureVersion[]> {
    return (
      this.database
        .prepare(`SELECT entity_type,version,structure_json,created_at FROM entity_structure_versions ORDER BY entity_type,version`)
        .all() as StructureRow[]
    ).map(this.toStructure);
  }

  public async getCurrentTaskStructure(): Promise<EntityStructureVersion> {
    const row = this.database
      .prepare(
        `SELECT entity_type,version,structure_json,created_at FROM entity_structure_versions WHERE entity_type=? ORDER BY version DESC LIMIT 1`,
      )
      .get(TASK_ENTITY_TYPE) as StructureRow | undefined;
    if (!row) throw new Error('Task entity structure has not been registered.');
    return this.toStructure(row);
  }

  public async resetDatabase(): Promise<void> {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database.exec(`
        DELETE FROM process_work_entries;
        DELETE FROM system_trace_records;
        DELETE FROM persistent_queue_items;
        DELETE FROM events;
        DELETE FROM task_update_signals;
        DELETE FROM tasks;
        DELETE FROM entity_structure_versions;
      `);
      this.registerEntityStructures();
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  public close(): void {
    this.database.close();
  }

  private insertEvent(input: RecordEventInput): StoredEvent {
    const event: StoredEvent = {
      id: randomUUID(),
      eventType: input.eventType,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      entityStructureType: EVENT_STRUCTURE.entityType,
      entityStructureVersion: EVENT_STRUCTURE.version,
      payload: input.payload ?? {},
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };

    this.database
      .prepare(
        `INSERT INTO events (id,event_type,source_entity_type,source_entity_id,entity_structure_type,entity_structure_version,payload_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        event.id,
        event.eventType,
        event.sourceEntityType,
        event.sourceEntityId,
        event.entityStructureType,
        event.entityStructureVersion,
        JSON.stringify(event.payload),
        event.occurredAt,
      );

    this.insertTraceRecord({
      operation: 'poc.task.event.persisted',
      message: 'Task event persisted',
      correlationId: event.sourceEntityId,
      sourceTaskId: event.sourceEntityId,
      sourceEventId: event.id,
      context: {
        correlationId: event.sourceEntityId,
        sourceTaskId: event.sourceEntityId,
        sourceEventId: event.id,
        eventType: event.eventType,
      },
    });

    const reaction = resolvePocEventReaction(event.eventType);
    if (reaction) {
      const queueItemId = randomUUID();
      this.database
        .prepare(
          `INSERT INTO persistent_queue_items (id,source_event_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at) VALUES (?,?,?,?,?,'queued',0,?,NULL,NULL,NULL,NULL,NULL,?)`,
        )
        .run(
          queueItemId,
          event.id,
          reaction.id,
          reaction.queueIntentType,
          reaction.handlerKey,
          event.occurredAt,
          event.occurredAt,
        );
      this.insertTraceRecord({
        operation: 'poc.event-reaction.selected',
        message: 'Event reaction selected',
        correlationId: event.sourceEntityId,
        sourceTaskId: event.sourceEntityId,
        sourceEventId: event.id,
        sourceQueueItemId: queueItemId,
        context: {
          correlationId: event.sourceEntityId,
          sourceTaskId: event.sourceEntityId,
          sourceEventId: event.id,
          sourceQueueItemId: queueItemId,
          eventReactionId: reaction.id,
          handlerKey: reaction.handlerKey,
        },
      });
      this.insertTraceRecord({
        operation: 'poc.queue-item.created',
        message: 'Queue item created',
        correlationId: event.sourceEntityId,
        sourceTaskId: event.sourceEntityId,
        sourceEventId: event.id,
        sourceQueueItemId: queueItemId,
        context: {
          correlationId: event.sourceEntityId,
          sourceTaskId: event.sourceEntityId,
          sourceEventId: event.id,
          sourceQueueItemId: queueItemId,
          intentType: reaction.queueIntentType,
        },
      });
    }

    return event;
  }

  private insertTraceRecord(input: {
    operation: string;
    message: string;
    correlationId: string;
    sourceTaskId?: string;
    sourceEventId?: string;
    sourceQueueItemId?: string;
    context: Record<string, unknown>;
  }): void {
    const nextSeq = (this.database.prepare(`SELECT COALESCE(MAX(seq),0)+1 AS seq FROM system_trace_records`).get() as { seq: number }).seq;
    const timestamp = new Date().toISOString();
    const raw = {
      seq: nextSeq,
      timestamp,
      family: 'trace',
      operation: input.operation,
      phase: 'POINT',
      severity: 'info',
      status: 'ok',
      correlationId: input.correlationId,
      message: input.message,
      component: 'SqliteTaskStorageGateway',
      context: input.context,
      tags: [],
    };
    this.database
      .prepare(
        `INSERT INTO system_trace_records (id,seq,timestamp,family,severity,operation,phase,status,message,correlation_id,source_task_id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_entry_id,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        nextSeq,
        timestamp,
        'trace',
        'info',
        input.operation,
        'POINT',
        'ok',
        input.message,
        input.correlationId,
        input.sourceTaskId ?? null,
        input.sourceEventId ?? null,
        input.sourceQueueItemId ?? null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify(raw),
      );
  }

  private filters(filters: TaskFilters): { clause: string; parameters: string[] } {
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (filters.tenantId) {
      conditions.push('tenant_id=?');
      parameters.push(filters.tenantId);
    }
    if (filters.tenantProcessId) {
      conditions.push('tenant_process_id=?');
      parameters.push(filters.tenantProcessId);
    }
    return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', parameters };
  }

  private readonly toEvent = (row: EventRow): StoredEvent => ({
    id: row.id,
    eventType: row.event_type,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    entityStructureType: row.entity_structure_type,
    entityStructureVersion: row.entity_structure_version,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    occurredAt: row.occurred_at,
  });

  private readonly toQueueItem = (row: QueueRow): PersistentQueueItem => ({
    id: row.id,
    sourceEventId: row.source_event_id,
    eventReactionId: row.event_reaction_id,
    intentType: row.intent_type,
    handlerKey: row.handler_key,
    status: row.status,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  });

  private readonly toWorkEntry = (row: WorkRow): ProcessWorkEntry => ({
    id: row.id,
    sourceEventId: row.source_event_id,
    sourceQueueItemId: row.source_queue_item_id,
    tenantProcessId: row.tenant_process_id,
    channelId: row.channel_id,
    flowId: row.flow_id,
    executionId: row.execution_id,
    workType: row.work_type,
    status: row.status,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
  });

  private readonly toTraceRecord = (row: TraceRow): PocExecutionTraceRecord => ({
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
    sourceTaskId: row.source_task_id,
    sourceEventId: row.source_event_id,
    sourceQueueItemId: row.source_queue_item_id,
    tenantProcessId: row.tenant_process_id,
    channelId: row.channel_id,
    flowId: row.flow_id,
    executionId: row.execution_id,
    workEntryId: row.work_entry_id,
    raw: JSON.parse(row.raw_json) as Record<string, unknown>,
  });

  private readonly toStructure = (row: StructureRow): EntityStructureVersion => ({
    entityType: row.entity_type,
    version: row.version,
    structure: JSON.parse(row.structure_json) as Record<string, unknown>,
    createdAt: row.created_at,
  });

  private toStoredTask(row: TaskRow): StoredTask {
    return {
      id: row.id,
      entityType: row.entity_type as typeof TASK_ENTITY_TYPE,
      tenantId: row.tenant_id as 'IEBBeta',
      tenantProcessId: row.tenant_process_id as 'Test1',
      schemaVersion: row.schema_version,
      data: JSON.parse(row.data_json) as StoredTask['data'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private createSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS entity_structure_versions (entity_type TEXT NOT NULL,version INTEGER NOT NULL,structure_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(entity_type,version));
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,tenant_process_id TEXT NOT NULL,entity_type TEXT NOT NULL,schema_version INTEGER NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(entity_type,schema_version) REFERENCES entity_structure_versions(entity_type,version));
      CREATE TABLE IF NOT EXISTS task_update_signals (id TEXT PRIMARY KEY,task_id TEXT NOT NULL,tenant_id TEXT NOT NULL,tenant_process_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(task_id) REFERENCES tasks(id));
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,event_type TEXT NOT NULL,source_entity_type TEXT NOT NULL,source_entity_id TEXT NOT NULL,entity_structure_type TEXT NOT NULL,entity_structure_version INTEGER NOT NULL,payload_json TEXT NOT NULL,occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS persistent_queue_items (id TEXT PRIMARY KEY,source_event_id TEXT NOT NULL,event_reaction_id TEXT NOT NULL,intent_type TEXT NOT NULL,handler_key TEXT NOT NULL,status TEXT NOT NULL,attempt_count INTEGER NOT NULL,available_at TEXT NOT NULL,claimed_by TEXT,claimed_at TEXT,completed_at TEXT,failed_at TEXT,last_error TEXT,created_at TEXT NOT NULL,FOREIGN KEY(source_event_id) REFERENCES events(id));
      CREATE UNIQUE INDEX IF NOT EXISTS persistent_queue_items_source_event_reaction_idx ON persistent_queue_items(source_event_id,event_reaction_id);
      CREATE TABLE IF NOT EXISTS process_work_entries (id TEXT PRIMARY KEY,source_event_id TEXT NOT NULL,source_queue_item_id TEXT NOT NULL UNIQUE,tenant_process_id TEXT NOT NULL,channel_id TEXT NOT NULL,flow_id TEXT NOT NULL,execution_id TEXT NOT NULL,work_type TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(source_event_id) REFERENCES events(id),FOREIGN KEY(source_queue_item_id) REFERENCES persistent_queue_items(id));
      CREATE TABLE IF NOT EXISTS system_trace_records (id TEXT PRIMARY KEY,seq INTEGER NOT NULL,timestamp TEXT NOT NULL,family TEXT NOT NULL,severity TEXT,operation TEXT NOT NULL,phase TEXT,status TEXT,message TEXT,correlation_id TEXT,source_task_id TEXT,source_event_id TEXT,source_queue_item_id TEXT,tenant_process_id TEXT,channel_id TEXT,flow_id TEXT,execution_id TEXT,work_entry_id TEXT,raw_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS system_trace_records_correlation_idx ON system_trace_records(correlation_id,timestamp,seq);
      CREATE INDEX IF NOT EXISTS system_trace_records_source_idx ON system_trace_records(source_task_id,source_event_id,source_queue_item_id,work_entry_id);
    `);
    this.migrateProcessWorkEntries();
  }

  private migrateProcessWorkEntries(): void {
    const columns = new Set(
      (this.database.prepare(`PRAGMA table_info(process_work_entries)`).all() as Array<{ name: string }>).map((column) => column.name),
    );
    const required = [
      ['tenant_process_id', "'Test1'"],
      ['channel_id', "'unknown-channel'"],
      ['flow_id', "'unknown-flow'"],
      ['execution_id', "'unknown-execution'"],
    ] as const;
    for (const [column, defaultValue] of required) {
      if (!columns.has(column)) {
        this.database.exec(`ALTER TABLE process_work_entries ADD COLUMN ${column} TEXT NOT NULL DEFAULT ${defaultValue};`);
      }
    }
  }

  private registerEntityStructures(): void {
    const createdAt = new Date().toISOString();
    const statement = this.database.prepare(
      `INSERT OR IGNORE INTO entity_structure_versions (entity_type,version,structure_json,created_at) VALUES (?,?,?,?)`,
    );
    for (const definition of POC_ENTITY_STRUCTURES) {
      statement.run(definition.entityType, definition.version, JSON.stringify(definition.structure), createdAt);
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
