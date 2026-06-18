import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inspectionApi } from '../../api/inspectionApi';
import type {
  InspectionCollection,
  InspectionRecord,
  ProvenanceFilters,
} from '../../api/contracts';

type CollectionColumnProps = {
  collection: InspectionCollection;
  filters: ProvenanceFilters;
  refreshInterval: number | false;
  onSelect: (record: InspectionRecord) => void;
  onSignalTaskUpdate: (taskId: string) => void;
  signallingTaskId: string | null;
};

function CollectionColumn({
  collection,
  filters,
  refreshInterval,
  onSelect,
  onSignalTaskUpdate,
  signallingTaskId,
}: CollectionColumnProps) {
  const recordsQuery = useQuery({
    queryKey: ['inspection-records', collection.id, filters],
    queryFn: () => inspectionApi.records(collection.id, filters),
    refetchInterval: refreshInterval,
  });

  return (
    <section className="collection-column">
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

      <div className="record-list">
        {recordsQuery.data?.map((record) => (
          <article className="record-card" key={record.id}>
            <button className="record-card-main" onClick={() => onSelect(record)}>
              <strong>{record.title}</strong>
              <span>{record.id}</span>
              <span>{record.provenance.tenantId ?? record.provenance.sourceType}</span>
              <time>{new Date(record.createdAt).toLocaleString()}</time>
            </button>
            {collection.id === 'tasks' && (
              <button
                className="signal-button"
                disabled={signallingTaskId === record.id}
                onClick={() => onSignalTaskUpdate(record.id)}
              >
                {signallingTaskId === record.id ? 'Signalling…' : 'Signal update'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function OverviewPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ProvenanceFilters>({ tenantId: '', tenantProcessId: '' });
  const [selectedRecord, setSelectedRecord] = useState<InspectionRecord | null>(null);
  const [pollMs, setPollMs] = useState(5000);
  const [taskName, setTaskName] = useState('');
  const [signallingTaskId, setSignallingTaskId] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: inspectionApi.health,
    refetchInterval: 5000,
  });
  const collectionsQuery = useQuery({
    queryKey: ['inspection-collections'],
    queryFn: inspectionApi.collections,
  });

  const createTaskMutation = useMutation({
    mutationFn: inspectionApi.createTask,
    onSuccess: async () => {
      setTaskName('');
      await queryClient.invalidateQueries({ queryKey: ['inspection-records', 'tasks'] });
    },
  });

  const signalUpdateMutation = useMutation({
    mutationFn: inspectionApi.signalTaskUpdate,
    onMutate: (taskId) => setSignallingTaskId(taskId),
    onSettled: async () => {
      setSignallingTaskId(null);
      await queryClient.invalidateQueries({ queryKey: ['inspection-records', 'task-update-signals'] });
    },
  });

  const refreshInterval = useMemo(() => pollMs > 0 ? pollMs : false, [pollMs]);

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = taskName.trim();
    if (name) createTaskMutation.mutate(name);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">TaskStream POC</p>
          <h1>Storage population inspector</h1>
          <p>Live operational view of specialised API projections over the current storage layer.</p>
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
            <input
              value={taskName}
              placeholder="Task name"
              onChange={(event) => setTaskName(event.target.value)}
            />
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
          <input
            value={filters.tenantId}
            placeholder="All tenants"
            onChange={(event) => setFilters((current) => ({ ...current, tenantId: event.target.value }))}
          />
        </label>
        <label>
          Tenant process
          <input
            value={filters.tenantProcessId}
            placeholder="All processes"
            onChange={(event) => setFilters((current) => ({ ...current, tenantProcessId: event.target.value }))}
          />
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
        <button className="secondary-button" onClick={() => setFilters({ tenantId: '', tenantProcessId: '' })}>
          Clear provenance
        </button>
      </section>

      {collectionsQuery.isLoading && <div className="state-message">Loading inspection collections…</div>}
      {collectionsQuery.isError && <div className="state-message error">{collectionsQuery.error.message}</div>}

      <div className="workspace">
        <div className="collection-grid">
          {collectionsQuery.data?.map((collection) => (
            <CollectionColumn
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
            <div className="state-message">Select a record to inspect its raw API projection.</div>
          )}
        </aside>
      </div>
    </main>
  );
}
