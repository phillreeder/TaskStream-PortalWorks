import type { JsonObject, JsonValue } from '../types.js';
import type { FlowAccessorResult } from './result.js';

export type FlowArtifactReferenceFormat = 'json' | 'text';

export interface FlowArtifactRecord {
  readonly artifactId: string;
  readonly name: string;
  readonly content?: JsonValue | string;
  readonly metadata?: JsonObject;
}

export interface FlowArtifactResolveInput {
  readonly ref: string;
  readonly format?: FlowArtifactReferenceFormat;
  readonly name?: string;
  readonly metadata?: JsonObject;
}

export interface FlowArtifactAccessor {
  resolve(input: FlowArtifactResolveInput): Promise<FlowAccessorResult<FlowArtifactRecord>>;

  save(input: {
    readonly name: string;
    readonly content: JsonValue | string;
    readonly metadata?: JsonObject;
  }): Promise<FlowAccessorResult<FlowArtifactRecord>>;

  get(input: {
    readonly artifactId: string;
  }): Promise<FlowAccessorResult<FlowArtifactRecord | undefined>>;

  list(input?: {
    readonly limit?: number;
  }): Promise<FlowAccessorResult<readonly FlowArtifactRecord[]>>;
}
