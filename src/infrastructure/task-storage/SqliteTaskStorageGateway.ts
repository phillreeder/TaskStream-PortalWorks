import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_STRUCTURES,
  TASK_EVENT_STRUCTURE as EVENT_STRUCTURE,
  TASK_STRUCTURE,
} from '../../domain/entity-structures/index.js';
import { resolveEventReaction } from '../../application/events/EventReactionResolver.js';
import type { TaskFilters, TaskStorageGateway } from '../../application/task-storage/TaskStorageGateway.js';
import {
  TASK_ENTITY_TYPE,
  TASK_SCHEMA_VERSION,
  type CreateProcessWorkEntryInput,
  type CreateTaskInput,
  type EntityStructureVersion,
  type PersistentQueueItem,
  type ProcessWorkEntry,
  type RecordEventInput,
  type StoredEvent,
  type StoredTask,
  type TaskUpdateSignal,
} from '../../application/task-storage/types.js';

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
  source_task_id: string;
  task_ref: string;
  task_name: string;
  tenant_process_id: string;
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
export type SqliteTaskStorageGatewayOptions = {
  readonly defaultTenantProcessId: string;
  readonly defaultTaskRef: string;
  readonly isTenantProcessRegistered: (tenantProcessId: string) => boolean;
};

export class SqliteTaskStorageGateway implements TaskStorageGateway {
  private readonly database: DatabaseSync;

  public constructor(
    databasePath: string,
    private readonly options: SqliteTaskStorageGatewayOptions,
  ) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON;');
    this.createSchema();
    this.registerEntityStructures();
    this.migrateTaskRecords();
  }

  public async createTask(input: CreateTaskInput): Promise<{ id: string }> {
    const name = input.data.name.trim();
    if (!name) throw new Error('Task name is required.');
    const taskRef = input.data.taskRef?.trim() || this.options.defaultTaskRef.trim();
    if (!taskRef) throw new Error('Task reference is required.');

    const tenantProcessId = this.options.defaultTenantProcessId;
    if (!this.options.isTenantProcessRegistered(tenantProcessId)) {
      throw new Error(`Cannot create Task for unregistered TenantProcess ${tenantProcessId}.`);
    }

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
          tenantProcessId,
          TASK_ENTITY_TYPE,
          TASK_SCHEMA_VERSION,
          JSON.stringify({ taskRef, name }),
          timestamp,
          timestamp,
        );
      this.insertEvent({
        eventType: 'task.created',
        sourceEntityType: TASK_ENTITY_TYPE,
        sourceEntityId: id,
        payload: { sourceTaskId: id, taskRef, taskName: name, tenantId: 'IEBBeta', tenantProcessId },
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
        payload: {
          sourceTaskId: taskId,
          taskRef: task.data.taskRef,
          taskName: task.data.name,
          signalId: signal.id,
          tenantId: task.tenantId,
          tenantProcessId: task.tenantProcessId,
        },
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
      tenantProcessId: row.tenant_process_id,
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
          `SELECT id,source_event_id,source_task_id,task_ref,task_name,tenant_process_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at FROM persistent_queue_items ORDER BY created_at,id`,
        )
        .all() as QueueRow[]
    ).map(this.toQueueItem);
  }

  public async claimNextPersistentQueueItem(workerId: string): Promise<PersistentQueueItem | null> {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `UPDATE persistent_queue_items SET status='claimed',claimed_by=?,claimed_at=?,attempt_count=attempt_count+1,last_error=NULL WHERE id=(SELECT id FROM persistent_queue_items WHERE status='queued' AND available_at<=? ORDER BY created_at,id LIMIT 1) AND status='queued' RETURNING id,source_event_id,source_task_id,task_ref,task_name,tenant_process_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at`,
      )
      .get(workerId, now, now) as QueueRow | undefined;
    return row ? this.toQueueItem(row) : null;
  }

  public async completePersistentQueueItem(id: string): Promise<PersistentQueueItem> {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `UPDATE persistent_queue_items SET status='completed',completed_at=?,last_error=NULL WHERE id=? AND status='claimed' RETURNING id,source_event_id,source_task_id,task_ref,task_name,tenant_process_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at`,
      )
      .get(now, id) as QueueRow | undefined;
    if (!row) throw new Error(`Persistent queue item is not claimed or was not found: ${id}`);
    return this.toQueueItem(row);
  }

  public async failPersistentQueueItem(id: string, lastError: string): Promise<PersistentQueueItem> {
    const now = new Date().toISOString();
    const row = this.database
      .prepare(
        `UPDATE persistent_queue_items SET status='failed',failed_at=?,last_error=? WHERE id=? AND status='claimed' RETURNING id,source_event_id,source_task_id,task_ref,task_name,tenant_process_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at`,
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
      if (this.hasTable('stream_states')) {
        this.database.exec('DELETE FROM stream_states;');
      }
      this.database.exec(`
        DELETE FROM process_work_entries;
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

    const reaction = resolveEventReaction(event.eventType);
    if (reaction) {
      const queueItemId = randomUUID();
      this.database
        .prepare(
          `INSERT INTO persistent_queue_items (id,source_event_id,source_task_id,task_ref,task_name,tenant_process_id,event_reaction_id,intent_type,handler_key,status,attempt_count,available_at,claimed_by,claimed_at,completed_at,failed_at,last_error,created_at) VALUES (?,?,?,?,?,?,?,?,?,'queued',0,?,NULL,NULL,NULL,NULL,NULL,?)`,
        )
        .run(
          queueItemId,
          event.id,
          this.requireSourceTaskId(event),
          this.requireTaskRef(event),
          this.requireTaskName(event),
          this.requireTenantProcessId(event),
          reaction.id,
          reaction.queueIntentType,
          reaction.handlerKey,
          event.occurredAt,
          event.occurredAt,
        );
    }

    return event;
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
    sourceTaskId: row.source_task_id,
    taskRef: row.task_ref,
    taskName: row.task_name,
    tenantProcessId: row.tenant_process_id,
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
      tenantProcessId: row.tenant_process_id,
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
      CREATE TABLE IF NOT EXISTS persistent_queue_items (id TEXT PRIMARY KEY,source_event_id TEXT NOT NULL,source_task_id TEXT NOT NULL,task_ref TEXT NOT NULL,task_name TEXT NOT NULL,tenant_process_id TEXT NOT NULL,event_reaction_id TEXT NOT NULL,intent_type TEXT NOT NULL,handler_key TEXT NOT NULL,status TEXT NOT NULL,attempt_count INTEGER NOT NULL,available_at TEXT NOT NULL,claimed_by TEXT,claimed_at TEXT,completed_at TEXT,failed_at TEXT,last_error TEXT,created_at TEXT NOT NULL,FOREIGN KEY(source_event_id) REFERENCES events(id));
      CREATE UNIQUE INDEX IF NOT EXISTS persistent_queue_items_source_event_reaction_idx ON persistent_queue_items(source_event_id,event_reaction_id);
      CREATE TABLE IF NOT EXISTS process_work_entries (id TEXT PRIMARY KEY,source_event_id TEXT NOT NULL,source_queue_item_id TEXT NOT NULL UNIQUE,tenant_process_id TEXT NOT NULL,channel_id TEXT NOT NULL,flow_id TEXT NOT NULL,execution_id TEXT NOT NULL,work_type TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(source_event_id) REFERENCES events(id),FOREIGN KEY(source_queue_item_id) REFERENCES persistent_queue_items(id));
    `);
    this.migratePersistentQueueItems();
    this.migrateProcessWorkEntries();
  }


  private requireSourceTaskId(event: StoredEvent): string {
    const sourceTaskId = event.payload.sourceTaskId;
    if (typeof sourceTaskId !== 'string' || !sourceTaskId.trim()) {
      throw new Error(`Event ${event.id} is missing sourceTaskId required for queue routing.`);
    }
    return sourceTaskId;
  }

  private requireTaskRef(event: StoredEvent): string {
    const taskRef = event.payload.taskRef;
    if (typeof taskRef !== 'string' || !taskRef.trim()) {
      throw new Error(`Event ${event.id} is missing taskRef required for Task resolution.`);
    }
    return taskRef;
  }

  private requireTaskName(event: StoredEvent): string {
    const taskName = event.payload.taskName;
    if (typeof taskName !== 'string' || !taskName.trim()) {
      throw new Error(`Event ${event.id} is missing taskName required for queue diagnostics.`);
    }
    return taskName;
  }

  private requireTenantProcessId(event: StoredEvent): string {
    const tenantProcessId = event.payload.tenantProcessId;
    if (typeof tenantProcessId !== 'string' || !tenantProcessId.trim()) {
      throw new Error(`Event ${event.id} is missing tenantProcessId required for queue routing.`);
    }
    return tenantProcessId;
  }

  private migrateTaskRecords(): void {
    const fallbackTaskRef = this.escapeSqlLiteral(this.options.defaultTaskRef);
    this.database.exec(`
      UPDATE tasks
      SET data_json = json_set(data_json, '$.taskRef', COALESCE(json_extract(data_json, '$.taskRef'), '${fallbackTaskRef}')),
          schema_version = ${TASK_SCHEMA_VERSION}
      WHERE schema_version < ${TASK_SCHEMA_VERSION}
         OR json_extract(data_json, '$.taskRef') IS NULL;
    `);
  }

  private migratePersistentQueueItems(): void {
    const columns = new Set(
      (this.database.prepare(`PRAGMA table_info(persistent_queue_items)`).all() as Array<{ name: string }>).map((column) => column.name),
    );
    if (!columns.has('source_task_id')) {
      this.database.exec(`ALTER TABLE persistent_queue_items ADD COLUMN source_task_id TEXT NOT NULL DEFAULT '';`);
    }
    if (!columns.has('task_ref')) {
      this.database.exec(
        `ALTER TABLE persistent_queue_items ADD COLUMN task_ref TEXT NOT NULL DEFAULT '${this.escapeSqlLiteral(this.options.defaultTaskRef)}';`,
      );
    }
    if (!columns.has('task_name')) {
      this.database.exec(`ALTER TABLE persistent_queue_items ADD COLUMN task_name TEXT NOT NULL DEFAULT '';`);
    }
    if (!columns.has('tenant_process_id')) {
      this.database.exec(
        `ALTER TABLE persistent_queue_items ADD COLUMN tenant_process_id TEXT NOT NULL DEFAULT '${this.escapeSqlLiteral(this.options.defaultTenantProcessId)}';`,
      );
    }

    const fallbackTaskRef = this.escapeSqlLiteral(this.options.defaultTaskRef);
    this.database.exec(`
      UPDATE persistent_queue_items
      SET source_task_id = COALESCE(NULLIF(source_task_id, ''), (
            SELECT events.source_entity_id FROM events WHERE events.id = persistent_queue_items.source_event_id
          )),
          task_ref = COALESCE(NULLIF(task_ref, ''), '${fallbackTaskRef}'),
          task_name = COALESCE(NULLIF(task_name, ''), (
            SELECT json_extract(events.payload_json, '$.taskName') FROM events WHERE events.id = persistent_queue_items.source_event_id
          ), task_ref);
    `);
  }

  private migrateProcessWorkEntries(): void {
    const columns = new Set(
      (this.database.prepare(`PRAGMA table_info(process_work_entries)`).all() as Array<{ name: string }>).map((column) => column.name),
    );
    const required = [
      ['tenant_process_id', `'${this.escapeSqlLiteral(this.options.defaultTenantProcessId)}'`],
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


  private hasTable(tableName: string): boolean {
    const row = this.database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName) as { name: string } | undefined;
    return row !== undefined;
  }

  private escapeSqlLiteral(value: string): string {
    return value.replaceAll("'", "''");
  }

  private registerEntityStructures(): void {
    const createdAt = new Date().toISOString();
    const statement = this.database.prepare(
      `INSERT OR IGNORE INTO entity_structure_versions (entity_type,version,structure_json,created_at) VALUES (?,?,?,?)`,
    );
    for (const definition of ENTITY_STRUCTURES) {
      statement.run(definition.entityType, definition.version, JSON.stringify(definition.structure), createdAt);
    }
  }
}
