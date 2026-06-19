import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inspectionApi } from '../../api/inspectionApi';
import type {
  ExecutionLogRecord,
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
  'system-trace-records',
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

  if (collectionId === 'system-trace-records') {
    return [
      commonId,
      { key: 'stage', label: 'Stage', render: (record) => text(record, 'operation') },
      { key: 'level', label: 'Level', render: (record) => text(record, 'severity') },
      { key: 'event', label: 'Source event', render: (record) => <IdCell id={text(record, 'sourceEventId')} /> },
      { key: 'queue', label: 'Source queue', render: (record) => <IdCell id={text(record, 'sourceQueueItemId')} /> },
      { key: 'execution', label: 'Execution', render: (record) => text(record, 'executionId') },
      { key: 'occurred', label: 'Occurred', render: (record) => <DateCell date={record.createdAt} /> },
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
    <section id={`collection-${collection.id}`} className={`collection-table collection-${collection.id}`}>
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

export function executionLogJsonl(records: readonly ExecutionLogRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n');
}

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.reject(new Error('Clipboard API is unavailable.'));
}

function ExecutionLogView({ records, isLoading, isError, error }: {
  records: readonly ExecutionLogRecord[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}) {
  return (
    <section className="execution-log">
      <header>
        <h3>End-to-end execution log</h3>
        <p>Structured SystemTrace, queue, and durable records ordered for review.</p>
      </header>
      {isLoading && <div className="state-message">Loading execution log…</div>}
      {isError && <div className="state-message error">{error?.message ?? 'Unable to load execution log.'}</div>}
      {records?.length === 0 && <div className="state-message">No execution records found for this selection.</div>}
      {!!records?.length && (
        <div className="execution-records">
          {records.map((record) => (
            <article className={`execution-record ${record.kind}`} key={record.id}>
              <div className="execution-record-top">
                <div>
                  <p className="execution-stage">{record.stage}</p>
                  <p className="execution-message">{record.message}</p>
                </div>
                <button className="copy-record" onClick={() => void copyText(JSON.stringify(record, null, 2))}>Copy</button>
              </div>
              <div className="execution-meta">
                <span>{record.kind}</span>
                <span>{record.level}</span>
                <time dateTime={record.timestamp}>{new Date(record.timestamp).toLocaleString()}</time>
                {Object.entries(record.identifiers).map(([key, id]) => (
                  <span key={key}>{key}: <code title={id}>{compactId(id)}</code></span>
                ))}
              </div>
            </article>
          ))}
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
.header-controls { display: grid; justify-items: end; gap: 10px; }
.poc-menu { position: relative; }
.poc-menu summary { list-style: none; min-height: 34px; display: inline-flex; align-items: center; border: 1px solid #364454; border-radius: 8px; padding: 6px 10px; color: #c9d1da; background: #0f151d; cursor: pointer; font-size: .76rem; font-weight: 700; }
.poc-menu summary::-webkit-details-marker { display: none; }
.poc-menu-panel { position: absolute; right: 0; z-index: 5; width: 280px; margin-top: 8px; padding: 14px; border: 1px solid #3a4654; border-radius: 10px; background: #121821; box-shadow: 0 18px 40px rgb(0 0 0 / 35%); }
.poc-menu-panel p { margin: 0 0 12px; color: #8f9baa; font-size: .76rem; line-height: 1.4; }
.poc-menu-panel .action-error, .poc-menu-panel .action-success { display: block; margin-top: 10px; font-size: .75rem; }
.action-success { color: #9fd0aa; }
.danger-button { width: 100%; background: #7f332f; border-color: #a74d47; color: #f6dedb; }
.danger-button:hover { background: #91403b; }

.task-actions, .toolbar, .table-nav { margin-top: 14px; padding: 16px 18px; border-radius: 12px; }
.table-nav { border: 1px solid #27313d; background: #121821; box-shadow: 0 14px 32px rgb(0 0 0 / 18%); }
.table-nav h2 { margin: 0 0 10px; font-size: .9rem; }
.table-nav-links { display: flex; gap: 8px; flex-wrap: wrap; }
.table-nav a { display: inline-flex; align-items: center; min-height: 32px; border: 1px solid #364454; border-radius: 8px; padding: 5px 9px; color: #c9d1da; text-decoration: none; font-size: .74rem; font-weight: 700; background: #0f151d; }
.table-nav a:hover { border-color: #b89b52; color: #e7d59e; }
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

.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 14px; margin-top: 14px; align-items: start; }
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
.inspector-actions { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid #27313d; }
.inspector-actions button { min-height: 30px; padding: 4px 9px; background: transparent; color: #c9d1da; border-color: #364454; font-size: .72rem; }
.record-inspector pre { margin: 0; padding: 16px; overflow: auto; max-height: 280px; color: #bdc8d3; background: #0d131b; font-size: .72rem; line-height: 1.45; }
.execution-log { border-top: 1px solid #27313d; }
.execution-log header { padding: 13px 16px; border-bottom: 1px solid #27313d; }
.execution-log h3 { margin: 0 0 4px; font-size: .86rem; }
.execution-log p { margin: 0; color: #8794a4; font-size: .74rem; }
.execution-records { display: grid; gap: 8px; padding: 12px; max-height: 430px; overflow: auto; }
.execution-record { border: 1px solid #2b3744; border-radius: 8px; padding: 10px; background: #0f151d; }
.execution-record.system-trace { border-left: 3px solid #7fa9d8; }
.execution-record.domain-record { border-left: 3px solid #9fd0aa; }
.execution-record.queue-record { border-left: 3px solid #e0c37a; }
.execution-record-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }
.execution-stage { margin: 0; color: #e2e8ee; font-size: .76rem; font-weight: 800; overflow-wrap: anywhere; }
.execution-message { margin: 5px 0 0; color: #9eabba; font-size: .72rem; overflow-wrap: anywhere; }
.execution-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; color: #8492a2; font-size: .68rem; }
.execution-meta code { color: #c6d0da; }
.copy-record { min-height: 28px; padding: 3px 8px; background: transparent; color: #c9d1da; border-color: #364454; font-size: .68rem; }
.state-message { padding: 16px 18px; color: #8593a2; font-size: .82rem; }

@media (max-width: 1080px) {
  .workspace { grid-template-columns: 1fr; }
  .record-inspector { position: static; max-height: none; }
  .record-inspector pre { max-height: 420px; }
}

@media (max-width: 680px) {
  .app-shell { padding: 12px; }
  .app-header { flex-direction: column; }
  .header-controls { width: 100%; justify-items: stretch; }
  .poc-menu summary { justify-content: center; }
  .poc-menu-panel { position: static; width: 100%; }
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
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const healthQuery = useQuery({ queryKey: ['api-health'], queryFn: inspectionApi.health, refetchInterval: 5000 });
  const collectionsQuery = useQuery({ queryKey: ['inspection-collections'], queryFn: inspectionApi.collections });
  const refreshInterval = useMemo(() => pollMs > 0 ? pollMs : false, [pollMs]);
  const executionLogQuery = useQuery({
    queryKey: ['inspection-execution-log', selectedRecord?.id],
    queryFn: () => inspectionApi.executionLog(selectedRecord?.id ?? ''),
    enabled: Boolean(selectedRecord),
    refetchInterval: selectedRecord ? refreshInterval : false,
  });

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

  const resetDatabaseMutation = useMutation({
    mutationFn: inspectionApi.resetDatabase,
    onSuccess: async () => {
      setSelectedRecord(null);
      setResetMessage('POC database reset.');
      await queryClient.invalidateQueries({ queryKey: ['inspection-records'] });
      await queryClient.invalidateQueries({ queryKey: ['inspection-collections'] });
    },
  });

  function requestDatabaseReset() {
    setResetMessage(null);
    const confirmed = window.confirm(
      'Reset the entire POC database? This permanently deletes all tasks, events, queue items, work entries, and update signals.',
    );
    if (confirmed) resetDatabaseMutation.mutate();
  }

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
          <p>Trace Task → Event → persistent queue → TenantProcess-owned work across the SQLite POC.</p>
        </div>
        <div className="header-controls">
          <div className={`health ${healthQuery.isSuccess ? 'healthy' : 'unhealthy'}`}>
            <span className="health-dot" />
            {healthQuery.isSuccess ? 'API connected' : 'API unavailable'}
          </div>
          <details className="poc-menu">
            <summary>POC controls</summary>
            <div className="poc-menu-panel">
              <p>Destructive maintenance actions for the local POC environment.</p>
              <button
                className="danger-button"
                disabled={resetDatabaseMutation.isPending}
                onClick={requestDatabaseReset}
              >
                {resetDatabaseMutation.isPending ? 'Resetting…' : 'Reset database'}
              </button>
              {resetMessage && <span className="action-success">{resetMessage}</span>}
              {resetDatabaseMutation.isError && <span className="action-error">{resetDatabaseMutation.error.message}</span>}
            </div>
          </details>
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

      {!!orderedCollections.length && (
        <nav className="table-nav" aria-label="Inspection tables">
          <h2>Inspection tables</h2>
          <div className="table-nav-links">
            {orderedCollections.map((collection) => (
              <a key={collection.id} href={`#collection-${collection.id}`}>{collection.title}</a>
            ))}
          </div>
        </nav>
      )}

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
              <div className="inspector-actions">
                <button onClick={() => void executionLogQuery.refetch()}>Refresh log</button>
                <button
                  disabled={!executionLogQuery.data?.length}
                  onClick={() => void copyText(JSON.stringify(executionLogQuery.data ?? [], null, 2))}
                >
                  Copy JSON
                </button>
                <button
                  disabled={!executionLogQuery.data?.length}
                  onClick={() => void copyText(executionLogJsonl(executionLogQuery.data ?? []))}
                >
                  Copy JSONL
                </button>
              </div>
              <pre>{JSON.stringify(selectedRecord.data, null, 2)}</pre>
              <ExecutionLogView
                records={executionLogQuery.data}
                isLoading={executionLogQuery.isLoading}
                isError={executionLogQuery.isError}
                error={executionLogQuery.error}
              />
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
