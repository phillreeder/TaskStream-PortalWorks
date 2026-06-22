import type { JsonObject } from '../types.js';
import type { FlowAccessorResult } from './result.js';

export interface FlowLogInput {
  readonly message: string;
  readonly context?: JsonObject;
}

export interface FlowLoggerAccessor {
  debug(input: FlowLogInput): Promise<FlowAccessorResult<void>>;
  info(input: FlowLogInput): Promise<FlowAccessorResult<void>>;
  warn(input: FlowLogInput): Promise<FlowAccessorResult<void>>;
  error(input: FlowLogInput): Promise<FlowAccessorResult<void>>;
}
