import type { DatasetEnvelope, DatasetProvider, DatasetRequest, DatasetScope } from '../../domain/contracts/dataset.ts';

const keyFor = (request: DatasetRequest) => {
  const scope = request.scope ?? 'task';
  const version = request.version ?? 'latest';
  return `${scope}:${request.key}:${version}:${request.referenceId ?? 'default'}`;
};

export class MockDatasetProvider implements DatasetProvider {
  private readonly store = new Map<string, DatasetEnvelope>();

  set<TData>(request: DatasetRequest, data: TData, scope: DatasetScope = request.scope ?? 'task') {
    const envelope: DatasetEnvelope<TData> = {
      key: request.key,
      version: request.version ?? 'latest',
      scope,
      referenceId: request.referenceId,
      data,
      retrievedAt: new Date().toISOString(),
    };
    this.store.set(keyFor(request), envelope);
  }

  async resolve<TData = unknown>(request: DatasetRequest): Promise<DatasetEnvelope<TData>> {
    const record = this.store.get(keyFor(request));
    if (!record) {
      throw new Error(`Mock dataset missing for key ${request.key}`);
    }
    return record as DatasetEnvelope<TData>;
  }

  async list(scope?: DatasetScope): Promise<DatasetEnvelope<unknown>[]> {
    const entries = Array.from(this.store.values());
    return scope ? entries.filter((entry) => entry.scope === scope) : entries;
  }
}
