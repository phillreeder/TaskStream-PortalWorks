import type { JsonObject, JsonValue } from '../types.js';
import type { FlowAccessorResult } from './result.js';

export type FlowHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FlowHttpResponse {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: JsonValue | string;
}

export interface FlowHttpRequest {
  readonly method: FlowHttpMethod;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: JsonObject;
  readonly body?: JsonValue | string;
}

export interface FlowHttpAccessor {
  request(input: FlowHttpRequest): Promise<FlowAccessorResult<FlowHttpResponse>>;
  get(input: Omit<FlowHttpRequest, 'method' | 'body'>): Promise<FlowAccessorResult<FlowHttpResponse>>;
  post(input: Omit<FlowHttpRequest, 'method'>): Promise<FlowAccessorResult<FlowHttpResponse>>;
  put(input: Omit<FlowHttpRequest, 'method'>): Promise<FlowAccessorResult<FlowHttpResponse>>;
  patch(input: Omit<FlowHttpRequest, 'method'>): Promise<FlowAccessorResult<FlowHttpResponse>>;
  remove(input: Omit<FlowHttpRequest, 'method' | 'body'>): Promise<FlowAccessorResult<FlowHttpResponse>>;
}
