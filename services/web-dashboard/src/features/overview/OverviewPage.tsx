import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
};

function CollectionColumn({ collection, filters, refreshInterval, onSelect }: CollectionColumnProps) {
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
          <button className="record-card" key={record.id} onClick={() => onSelect(record)}>
            <strong>{record.title}</strong>
            <span>{record.id}</span>
            <span>{record.provenance.tenantId ?? record.provenance.sourceType}</span>
            <time>{new Date(record.createdAt).toLocaleString()}</time>
          </button>
        ))}
      </div>
    </section>
  );
}

export function OverviewPage() {
  const [filters, setFilters] = useState<ProvenanceFilters>({ tenantId: '', tenantProcessId: '' });
  const [selectedRecord, setSelectedRecord] = useState<InspectionRecord | null>(null);
  const [pollMs, setPollMs] = useState(5000);

  const healthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: inspectionApi.health,
    refetchInterval: 5000,
  });
  const collectionsQuery = useQuery({
    queryKey: ['inspection-collections'],
    queryFn: inspectionApi.collections,
  });

  const refreshInterval = useMemo(() => pollMs > 0 ? pollMs : false, [pollMs]);

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
