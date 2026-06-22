import type { JsonObject } from '../types.js';
import type { FlowAccessorResult } from './result.js';

export interface FlowUnitRecord {
  readonly unitId: string;
  readonly type: string;
  readonly data: JsonObject;
}

export interface FlowUnitAccessor {
  create(input: {
    readonly type: string;
    readonly data: JsonObject;
  }): Promise<FlowAccessorResult<FlowUnitRecord>>;

  get(input: {
    readonly unitId: string;
  }): Promise<FlowAccessorResult<FlowUnitRecord | undefined>>;

  list(input?: {
    readonly type?: string;
    readonly limit?: number;
  }): Promise<FlowAccessorResult<readonly FlowUnitRecord[]>>;

  update(input: {
    readonly unitId: string;
    readonly changes: JsonObject;
  }): Promise<FlowAccessorResult<FlowUnitRecord>>;

  remove(input: {
    readonly unitId: string;
  }): Promise<FlowAccessorResult<{ readonly unitId: string }>>;
}
