import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { SystemTraceRecorder } from '../SystemTraceRecorder.js';
import { SqlSystemTraceAdapter, SqlSystemTraceQueryRepository } from '../sqlTracePersistence.js';

function createHarness(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'systemtrace-sql-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'trace.sqlite');
  const adapter = new SqlSystemTraceAdapter(databasePath);
  const repository = new SqlSystemTraceQueryRepository(databasePath);
  t.after(() => adapter.close());
  t.after(() => repository.close());
  return {
    recorder: new SystemTraceRecorder({ adapter }),
    repository,
  };
}

test('[tickets: SYST-TRACE-API-001] SQL SystemTrace adapter preserves real trace records', async (t) => {
  const { recorder, repository } = createHarness(t);

  await recorder.trace({
    operation: 'poc.planner.tenantprocess.resolved',
    phase: 'POINT',
    severity: 'info',
    status: 'ok',
    correlationId: 'task-1',
    message: 'Work entry created or confirmed',
    component: 'test',
    tags: ['sql-adapter'],
    context: {
      sourceTaskId: 'task-1',
      sourceEventId: 'event-1',
      sourceQueueItemId: 'queue-1',
      tenantProcessId: 'tenant-process.ieb-beta.test1',
      channelId: 'channel.test1.process-work',
      flowId: 'flow.test1.prepare-work',
      executionId: 'execution-1',
      workEntryId: 'work-1',
    },
    data: {
      payload: 'preserved',
    },
  });

  const records = repository.list({ sourceQueueItemId: 'queue-1' });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.seq, 1);
  assert.equal(records[0]?.family, 'trace');
  assert.equal(records[0]?.operation, 'poc.planner.tenantprocess.resolved');
  assert.equal(records[0]?.severity, 'info');
  assert.equal(records[0]?.status, 'ok');
  assert.equal(records[0]?.correlationId, 'task-1');
  assert.equal(records[0]?.sourceTaskId, 'task-1');
  assert.equal(records[0]?.sourceEventId, 'event-1');
  assert.equal(records[0]?.sourceQueueItemId, 'queue-1');
  assert.equal(records[0]?.tenantProcessId, 'tenant-process.ieb-beta.test1');
  assert.equal(records[0]?.channelId, 'channel.test1.process-work');
  assert.equal(records[0]?.flowId, 'flow.test1.prepare-work');
  assert.equal(records[0]?.executionId, 'execution-1');
  assert.equal(records[0]?.workEntryId, 'work-1');
  assert.deepEqual(records[0]?.tags, ['sql-adapter']);
  assert.deepEqual(records[0]?.raw.context, {
    sourceTaskId: 'task-1',
    sourceEventId: 'event-1',
    sourceQueueItemId: 'queue-1',
    tenantProcessId: 'tenant-process.ieb-beta.test1',
    channelId: 'channel.test1.process-work',
    flowId: 'flow.test1.prepare-work',
    executionId: 'execution-1',
    workEntryId: 'work-1',
  });
  assert.deepEqual(records[0]?.raw.data, { payload: 'preserved' });
});

test('[tickets: SYST-TRACE-API-001] SQL SystemTrace adapter migrates legacy POC trace table', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'systemtrace-sql-legacy-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'trace.sqlite');
  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE system_trace_records (
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
      source_task_id TEXT,
      source_event_id TEXT,
      source_queue_item_id TEXT,
      tenant_process_id TEXT,
      channel_id TEXT,
      flow_id TEXT,
      execution_id TEXT,
      work_entry_id TEXT,
      raw_json TEXT NOT NULL
    );
    INSERT INTO system_trace_records (id,seq,timestamp,family,severity,operation,phase,status,message,correlation_id,source_task_id,source_event_id,source_queue_item_id,tenant_process_id,channel_id,flow_id,execution_id,work_entry_id,raw_json)
    VALUES ('legacy-1',1,'2026-06-19T00:00:00.000Z','trace','info','legacy.operation','POINT','ok','Legacy record','task-legacy','task-legacy','event-legacy','queue-legacy',NULL,NULL,NULL,NULL,NULL,'{"seq":1,"timestamp":"2026-06-19T00:00:00.000Z","family":"trace","operation":"legacy.operation","tags":[]}');
  `);
  legacyDatabase.close();

  const adapter = new SqlSystemTraceAdapter(databasePath);
  const repository = new SqlSystemTraceQueryRepository(databasePath);
  t.after(() => adapter.close());
  t.after(() => repository.close());

  const recorder = new SystemTraceRecorder({ adapter });
  await recorder.trace({
    operation: 'new.operation',
    phase: 'POINT',
    severity: 'info',
    status: 'ok',
    runId: 'run-1',
    correlationId: 'task-new',
    tags: ['migrated'],
    context: {
      sourceTaskId: 'task-new',
      sourceQueueItemId: 'queue-new',
    },
  });

  const legacyRecords = repository.list({ sourceQueueItemId: 'queue-legacy' });
  const newRecords = repository.list({ runId: 'run-1' });

  assert.equal(legacyRecords.length, 1);
  assert.equal(legacyRecords[0]?.operation, 'legacy.operation');
  assert.deepEqual(legacyRecords[0]?.tags, []);
  assert.equal(newRecords.length, 1);
  assert.equal(newRecords[0]?.operation, 'new.operation');
  assert.equal(newRecords[0]?.runId, 'run-1');
  assert.deepEqual(newRecords[0]?.tags, ['migrated']);
});
