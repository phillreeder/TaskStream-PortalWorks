export type DatasetScope = 'tenant' | 'process' | 'task' | 'run' | 'global';

export interface DatasetRequest {
  readonly key: string;
  readonly version?: string;
  readonly scope?: DatasetScope;
  readonly referenceId?: string;
}

export interface DatasetEnvelope<TData = unknown> {
  readonly key: string;
  readonly version: string;
  readonly scope: DatasetScope;
  readonly referenceId?: string;
  readonly data: TData;
  readonly retrievedAt: string;
}

export interface DatasetProvider {
  resolve<TData = unknown>(request: DatasetRequest): Promise<DatasetEnvelope<TData>>;
  list(scope?: DatasetScope): Promise<readonly DatasetEnvelope<unknown>[]>;
}
