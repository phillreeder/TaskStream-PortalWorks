export type DatasetScope = 'task' | 'cycle' | 'stream' | 'unit';

export interface DatasetRequest {
  key: string;
  version?: string;
  scope?: DatasetScope;
  referenceId?: string;
}

export interface DatasetEnvelope<TData = unknown> {
  key: string;
  version: string;
  scope: DatasetScope;
  referenceId?: string;
  data: TData;
  retrievedAt: string;
}

export interface DatasetProvider {
  resolve<TData = unknown>(request: DatasetRequest): Promise<DatasetEnvelope<TData>>;
  list(scope?: DatasetScope): Promise<DatasetEnvelope<unknown>[]>;
}
