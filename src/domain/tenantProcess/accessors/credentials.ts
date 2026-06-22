import type { JsonObject } from '../types.js';
import type { FlowAccessorResult } from './result.js';

export interface FlowCredentialRecord {
  readonly name: string;
  readonly value: string;
  readonly metadata?: JsonObject;
}

export interface FlowCredentialsAccessor {
  get(input: {
    readonly name: string;
  }): Promise<FlowAccessorResult<FlowCredentialRecord | undefined>>;
}
