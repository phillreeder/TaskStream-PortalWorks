import type { TenantProcessPlanningStreamStateProvider } from '../../application/planners/TenantProcessPlanningPipeline.js';
import {
  StreamStateModule,
  type JsonObject,
  type StreamStatePlanningContract,
} from '../../modules/StreamState/index.js';
import { SqliteStreamStateStore } from './SqliteStreamStateStore.js';

export class StreamStatePlanningProvider implements TenantProcessPlanningStreamStateProvider {
  public constructor(
    private readonly store: SqliteStreamStateStore,
    private readonly streamState: StreamStateModule,
  ) {}

  public async load(input: {
    readonly streamKey: string;
    readonly initialState: Record<string, unknown>;
  }): Promise<StreamStatePlanningContract> {
    await this.store.ensureInitialState({
      streamKey: input.streamKey,
      state: this.toJsonObject(input.initialState),
    });

    return this.streamState.createPlanningContract(input.streamKey);
  }

  private toJsonObject(value: Record<string, unknown>): JsonObject {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('Initial StreamState must be serializable as JSON.');
    }
    const parsed = JSON.parse(serialized) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Initial StreamState must be a JSON object.');
    }
    return parsed as JsonObject;
  }
}
