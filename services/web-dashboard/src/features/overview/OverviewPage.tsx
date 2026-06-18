import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inspectionApi } from '../../api/inspectionApi';
import type {
  InspectionCollection,
  InspectionCollectionId,
  InspectionRecord,
  ProvenanceFilters,
} from '../../api/contracts';

type CollectionTableProps = {
  collection: InspectionCollection;
  filters: ProvenanceFilters;
  refreshInterval: number | false;
  onSelect: (record: InspectionRecord) => void;
  onSignalTaskUpdate: (taskId: string) => void;
  signallingTaskId: string | null;
};

type TableColumn = {
  key: string;
  label: string;
  render: (record: InspectionRecord) => ReactNode;
};

const lifecycleOrder: InspectionCollectionId[] = [
  'tasks',
  'events',
  'persistent-queue-items',
  'process-work-entries',
  'task-update-signals',
  'entity-structure-versions',
];

function value(record: InspectionRecord, key: string): unknown {
  return record.data[key];
}

function text(record: InspectionRecord, key: string, fallback = '—'): string {
  const current = value(record, key);
  if (current === null || current === undefined || current === '') return fallback;
  if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }
  return JSON.stringify(current);
}

function nestedText(record: InspectionRecord, parent: string, key: string, fallback = '—'): string {
  const current = value(record, parent);
  if (!current || typeof current !== 'object' || Array.isArray(current)) return fallback;
  const nested = (current as Record<string, unknown>)[key];
  if (nested === null || nested === undefined || nested === '') return fallback;
  return Array.isArray(nested) ? nested.join(', ') || fallback : String(nested);
}

function compactId(current: string): string {
  if (current.length <= 18) return current;
  return `${current.slice(0, 8)}…${current.slice(-6)}`;
}

function IdCell({ id }: { id: string }) {
  return <code title={id}>{compactId(id)}</code>;
}

function StatusCell({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return <span className={`status-badge status-${normalized}`}>{status}</span>;
}

function DateCell({ date }: { date: string }) {
  return <time dateTime={date}>{new Date(date).toLocaleString()}</time>;
}

function columnsFor(collectionId: InspectionCollectionId): TableColumn[] {
  const commonId: TableColumn = {
    key: 'id',
    label: 'ID',
    render: (record) => <IdCell id={record.id} />,
  };

  if (collectionId === 'tasks') {
    return [
      commonId,
      { key: 'name', label: 'Task', render: (record) => record.title },
      { key: 'tenant', label: 'Tenant', render: (record) => record.provenance.tenantId ?? '—' },
      { key: 'process', label: 'Process', render: (record) => record.provenance.tenantProcessId ?? '—' },
      { key: 'created', label: 'Created', render: (record) => <DateCell date={record.createdAt} /> },
      { key: 'updated', label: 'Updated', render: (record) => record.updatedAt ? <DateCell date={record.updatedAt} /> : '—' },
    ];
  }

  if (collectionId === 'events') {
    return [
      commonId,
      { key: 'type', label: 'Event type', render: (record) => text(record, 'eventType') },
      { key: 'source', label: 'Source entity', render: (record) => <IdCell id={text(record, 'sourceEntityId')} /> },
      { key: 'queue', label: 'Queue item(s)', render: (record) => nestedText(record, 'relationship', 'queueItemIds') },
      { key: 'queue-status', label: 'Queue status', render: (record) => nestedText(record, 'relationship', 'queueStatuses') },
      { key: 'work', label: 'Work entry(s)', render: (record) => nestedText(record, 'relationship', 'workEntryIds') },
      { key: 'occurred', label: 'Occurred', render: (record) => <DateCell date={record.createdAt} /> },
    ];
  }

  if (collectionId === 'persistent-queue-items') {
    return [
      commonId,
      { key: 'event', label: 'Source event', render: (record) => <IdCell id={text(record, 'sourceEventId')} /> },
      { key: 'intent', label: 'Intent', render: (record) => text(record, 'intentType') },
      { key: 'status', label: 'Status', render: (record) => <StatusCell status={text(record, 'status')} /> },
      { key: 'attempts', label: 'Attempts', render: (record) => text(record, 'attemptCount', '0') },
      { key: 'worker', label: 'Claimed by', render: (record) => text(record, 'claimedBy') },
      { key: 'work', label: 'Work entry', render: (record) => nestedText(record, 'relationship', 'workEntryId') },
      { key: 'error', label: 'Last error', render: (record) => text(record, 'lastError') },
      { key: 'created', label: 'Created', render: (record) => <DateCell date={record.createdAt} /> },
    ];
  }

  if (collectionId === 'process-work-entries') {
    return [
      commonId,
      { key: 'event', label: 'Source event', render: (record) => <IdCell id={text(record, 'sourceEventId')} /> },
      { key: 'queue', label: 'Source queue', render: (record) => <IdCell id={text(record, 'sourceQueueItemId')} /> },
      { key: 'type', label: 'Work type', render: (record) => text(record, 'workType') },
      { key: 'status', label: 'Status', render: (record) => <StatusCell status={text(record, 'status')} /> },
      { key: 'created', label: 'Created', render: (record) => <DateCell date={record.createdAt} /> },
    ];
  }

  if (collectionId === 'task-update-signals') {
    return [
      commonId,
      { key: 'task', label: 'Task', render: (record) => <IdCell id={text(record, 'taskId')} /> },
      { key: 'status', label: 'Status', render: (record) => <StatusCell status={text(record, 'status')} /> },
      { key: 'tenant', label: 'Tenant', render: (record) => record.provenance.tenantId ?? '—' },
      { key: 'process', label: 'Process', render: (record) => record.provenance.tenantProcessId ?? '—' },
      { key: 'created', label: 'Created', render: (record) => <DateCell date={record.createdAt} /> },
    ];
  }

  return [
    commonId,
    { key: 'entity', label: 'Entity type', render: (record) => text(record, 'entityType') },
    { key: 'version', label: 'Version', render: (record) => text(record, 'version') },
    { key: 'created', label: 'Registered', render: (record) => <DateCell date={record.createdAt} /> },
  ];
}

function CollectionTable({
  collection,
  filters,
  refreshInterval,
  onSelect,
  onSignalTaskUpdate,
  signallingTaskId,
}: CollectionTableProps) {
  const recordsQuery = useQuery({
    queryKey: ['inspection-records', collection.id, filters],
    queryFn: () => inspectionApi.records(collection.id, filters),
    refetchInterval: refreshInterval,
  });
  const columns = columnsFor(collection.id);

  return (
    <section className={`collection-table collection-${collection.id}`}>
      <header className="collection-header">
        <div>
          <h2>{collection.title}</h2>
          <p>{collection.description}</p>
        </div>
        <div className="collection-meta">
          <span>{recordsQuery.data?.length ?? 0} records</span>
          {recordsQuery.isFetching && <span>Refreshing…</span>}
        </div>
      </header>

      {recordsQuery.isLoading && <div className="state-message">Loading collection…</div>}
      {recordsQuery.isError && <div className="state-message error">{recordsQuery.error.message}</div>}
      {recordsQuery.data?.length === 0 && <div className="state-message">No records match this provenance.</div>}

      {!!recordsQuery.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                <th className="row-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordsQuery.data.map((record) => (
                <tr key={record.id} onClick={() => onSelect(record)}>
                  {columns.map((column) => <td key={column.key}>{column.render(record)}</td>)}
                  <td className="row-actions" onClick={(event) => event.stopPropagation()}>
                    <button className="table-action" onClick={() => onSelect(record)}>Inspect</button>
                    {collection.id === 'tasks' && (
                      <button
                        className="table-action primary"
                        disabled={signallingTaskId === record.id}
                        onClick={() => onSignalTaskUpdate(record.id)}
                      >
                        {signallingTaskId === record.id ? 'Signalling…' : 'Signal update'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const dashboardTableStyles = String.raw`
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #e7ebf0;
  background: #0d1117;
  font-synthesis: none;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: #0d1117; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: wait; opacity: .58; }

.app-shell { min-height: 100vh; padding: 28px; }
.app-header, .task-actions, .toolbar, .collection-table, .record-inspector {
  border: 1px solid #27313d;
  background: #121821;
  box-shadow: 0 14px 32px rgb(0 0 0 / 18%);
}

.app-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 24px;
  border-radius: 14px;
}
.app-header h1 { margin: 3px 0 7px; font-size: clamp(1.65rem, 2.8vw, 2.45rem); }
.app-header p { margin: 0; color: #9ba8b7; }
.eyebrow { color: #d8b86a !important; text-transform: uppercase; letter-spacing: .14em; font-size: .72rem; font-weight: 700; }
.health { display: flex; align-items: center; gap: 9px; white-space: nowrap; color: #a9b5c2; font-size: .86rem; }
.health-dot { width: 9px; height: 9px; border-radius: 50%; background: #77818d; box-shadow: 0 0 0 4px rgb(119 129 141 / 12%); }
.health.healthy .health-dot { background: #79c28a; box-shadow: 0 0 0 4px rgb(121 194 138 / 12%); }
.health.unhealthy .health-dot { background: #d27d75; }

.task-actions, .toolbar { margin-top: 14px; padding: 16px 18px; border-radius: 12px; }
.task-actions form, .toolbar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
label { display: grid; gap: 6px; color: #9ba8b7; font-size: .78rem; font-weight: 650; }
input, select {
  min-height: 38px;
  border: 1px solid #334050;
  border-radius: 8px;
  background: #0d131b;
  color: #e7ebf0;
  padding: 8px 10px;
  outline: none;
}
input:focus, select:focus { border-color: #c4a557; box-shadow: 0 0 0 3px rgb(196 165 87 / 10%); }
button {
  min-height: 38px;
  border: 1px solid #b89b52;
  border-radius: 8px;
  background: #b89b52;
  color: #11161d;
  padding: 8px 13px;
  font-weight: 700;
}
.secondary-button, .table-action { background: transparent; color: #c9d1da; border-color: #364454; }
.action-error, .state-message.error { color: #e49a92; }

.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; margin-top: 14px; align-items: start; }
.collection-stack { display: grid; gap: 14px; min-width: 0; }
.collection-table { border-radius: 12px; overflow: hidden; }
.collection-header { display: flex; justify-content: space-between; gap: 20px; padding: 16px 18px; border-bottom: 1px solid #27313d; }
.collection-header h2 { margin: 0 0 4px; font-size: 1rem; }
.collection-header p { margin: 0; color: #8794a4; font-size: .8rem; }
.collection-meta { display: flex; gap: 10px; color: #8794a4; font-size: .75rem; white-space: nowrap; }

.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 780px; }
th, td { padding: 10px 12px; border-bottom: 1px solid #202a35; text-align: left; vertical-align: middle; font-size: .78rem; }
th { position: sticky; top: 0; z-index: 1; background: #0f151d; color: #8492a2; text-transform: uppercase; letter-spacing: .06em; font-size: .67rem; }
tbody tr { transition: background .12s ease; }
tbody tr:hover { background: #17212c; }
tbody tr:last-child td { border-bottom: 0; }
td code { color: #c6d0da; font-size: .72rem; white-space: nowrap; }
td time { color: #9aa7b5; white-space: nowrap; }
.row-actions-heading, .row-actions { text-align: right; }
.row-actions { white-space: nowrap; }
.table-action { min-height: 30px; padding: 4px 8px; font-size: .72rem; margin-left: 6px; }
.table-action.primary { background: #b89b52; border-color: #b89b52; color: #11161d; }

.status-badge { display: inline-flex; align-items: center; border: 1px solid #3a4654; border-radius: 999px; padding: 3px 8px; color: #bcc6d0; background: #19212a; font-size: .7rem; font-weight: 700; }
.status-completed, .status-ready { color: #9fd0aa; border-color: #355b40; background: #16251b; }
.status-failed { color: #e49a92; border-color: #6b3f3a; background: #2c1917; }
.status-claimed, .status-processing { color: #e0c37a; border-color: #6b5a32; background: #2a2415; }
.status-queued, .status-pending { color: #a7bfd8; border-color: #3b536b; background: #172332; }

.record-inspector { position: sticky; top: 14px; border-radius: 12px; overflow: hidden; max-height: calc(100vh - 28px); }
.record-inspector > header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #27313d; }
.record-inspector h2 { margin: 0; font-size: .95rem; }
.record-inspector header button { min-height: 30px; padding: 4px 9px; background: transparent; color: #c9d1da; border-color: #364454; }
.record-inspector dl { display: grid; grid-template-columns: 82px minmax(0, 1fr); margin: 0; padding: 14px 16px; gap: 8px 12px; border-bottom: 1px solid #27313d; font-size: .76rem; }
.record-inspector dt { color: #7f8d9d; }
.record-inspector dd { margin: 0; overflow-wrap: anywhere; }
.record-inspector pre { margin: 0; padding: 16px; overflow: auto; max-height: calc(100vh - 270px); color: #bdc8d3; background: #0d131b; font-size: .72rem; line-height: 1.45; }
.state-message { padding: 16px 18px; color: #8593a2; font-size: .82rem; }

@media (max-width: 1080px) {
  .workspace { grid-template-columns: 1fr; }
  .record-inspector { position: static; max-height: none; }
  .record-inspector pre { max-height: 420px; }
}

@media (max-width: 680px) {
  .app-shell { padding: 12px; }
  .app-header { flex-direction: column; }
  .toolbar label, .task-actions label { width: 100%; }
  .toolbar input, .toolbar select, .task-actions input { width: 100%; }
}

`;

export function OverviewPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ProvenanceFilters>({ tenantId: '', tenantProcessId: '' });
  const [selectedRecord, setSelectedRecord] = useState<InspectionRecord | null>(null);
  const [pollMs, setPollMs] = useState(5000);
  const [taskName, setTaskName] = useState('');
  const [signallingTaskId, setSignallingTaskId] = useState<string | null>(null);

  const healthQuery = useQuery({ queryKey: ['api-health'], queryFn: inspectionApi.health, refetchInterval: 5000 });
  const collectionsQuery = useQuery({ queryKey: ['inspection-collections'], queryFn: inspectionApi.collections });

  const orderedCollections = useMemo(() => {
    const collections = collectionsQuery.data ?? [];
    return [...collections].sort((left, right) => lifecycleOrder.indexOf(left.id) - lifecycleOrder.indexOf(right.id));
  }, [collectionsQuery.data]);

  const createTaskMutation = useMutation({
    mutationFn: inspectionApi.createTask,
    onSuccess: async () => {
      setTaskName('');
      await queryClient.invalidateQueries({ queryKey: ['inspection-records'] });
    },
  });

  const signalUpdateMutation = useMutation({
    mutationFn: inspectionApi.signalTaskUpdate,
    onMutate: (taskId) => setSignallingTaskId(taskId),
    onSettled: async () => {
      setSignallingTaskId(null);
      await queryClient.invalidateQueries({ queryKey: ['inspection-records'] });
    },
  });

  const refreshInterval = useMemo(() => pollMs > 0 ? pollMs : false, [pollMs]);

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = taskName.trim();
    if (name) createTaskMutation.mutate(name);
  }

  return (
    <>
      <style>{dashboardTableStyles}</style>
      <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">TaskStream POC</p>
          <h1>Lifecycle storage inspector</h1>
          <p>Trace Task → Event → persistent queue → worker-materialized work across the SQLite POC.</p>
        </div>
        <div className={`health ${healthQuery.isSuccess ? 'healthy' : 'unhealthy'}`}>
          <span className="health-dot" />
          {healthQuery.isSuccess ? 'API connected' : 'API unavailable'}
        </div>
      </header>

      <section className="task-actions">
        <form onSubmit={submitTask}>
          <label>
            New task
            <input value={taskName} placeholder="Task name" onChange={(event) => setTaskName(event.target.value)} />
          </label>
          <button disabled={!taskName.trim() || createTaskMutation.isPending}>
            {createTaskMutation.isPending ? 'Creating…' : 'Create task'}
          </button>
        </form>
        {createTaskMutation.isError && <span className="action-error">{createTaskMutation.error.message}</span>}
        {signalUpdateMutation.isError && <span className="action-error">{signalUpdateMutation.error.message}</span>}
      </section>

      <section className="toolbar">
        <label>
          Tenant
          <input value={filters.tenantId} placeholder="All tenants" onChange={(event) => setFilters((current) => ({ ...current, tenantId: event.target.value }))} />
        </label>
        <label>
          Tenant process
          <input value={filters.tenantProcessId} placeholder="All processes" onChange={(event) => setFilters((current) => ({ ...current, tenantProcessId: event.target.value }))} />
        </label>
        <label>
          Auto-refresh
          <select value={pollMs} onChange={(event) => setPollMs(Number(event.target.value))}>
            <option value={0}>Off</option>
            <option value={1000}>1 second</option>
            <option value={5000}>5 seconds</option>
            <option value={10000}>10 seconds</option>
          </select>
        </label>
        <button className="secondary-button" onClick={() => setFilters({ tenantId: '', tenantProcessId: '' })}>Clear provenance</button>
      </section>

      {collectionsQuery.isLoading && <div className="state-message">Loading inspection collections…</div>}
      {collectionsQuery.isError && <div className="state-message error">{collectionsQuery.error.message}</div>}

      <div className="workspace">
        <div className="collection-stack">
          {orderedCollections.map((collection) => (
            <CollectionTable
              key={collection.id}
              collection={collection}
              filters={filters}
              refreshInterval={refreshInterval}
              onSelect={setSelectedRecord}
              onSignalTaskUpdate={(taskId) => signalUpdateMutation.mutate(taskId)}
              signallingTaskId={signallingTaskId}
            />
          ))}
        </div>

        <aside className="record-inspector">
          <header>
            <h2>Record inspector</h2>
            {selectedRecord && <button onClick={() => setSelectedRecord(null)}>Close</button>}
          </header>
          {selectedRecord ? (
            <>
              <dl>
                <dt>Collection</dt><dd>{selectedRecord.collectionId}</dd>
                <dt>ID</dt><dd>{selectedRecord.id}</dd>
                <dt>Source</dt><dd>{selectedRecord.provenance.sourceType}</dd>
                <dt>Tenant</dt><dd>{selectedRecord.provenance.tenantId ?? '—'}</dd>
                <dt>Process</dt><dd>{selectedRecord.provenance.tenantProcessId ?? '—'}</dd>
              </dl>
              <pre>{JSON.stringify(selectedRecord.data, null, 2)}</pre>
            </>
          ) : (
            <div className="state-message">Select any table row to inspect its raw API projection.</div>
          )}
        </aside>
      </div>
      </main>
    </>
  );
}
