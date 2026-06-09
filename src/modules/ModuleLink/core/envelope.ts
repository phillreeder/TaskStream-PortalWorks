import { randomUUID } from 'node:crypto';
import type { ModuleLinkEnvelope, ModuleLinkEnvelopeInput } from './types.js';

export function createModuleLinkEnvelope<TPayload, TMetadata extends Record<string, unknown> = Record<string, unknown>>(
  input: ModuleLinkEnvelopeInput<TPayload, TMetadata>,
): ModuleLinkEnvelope<TPayload, TMetadata> {
  return {
    requestId: input.requestId ?? randomUUID(),
    correlationId: input.correlationId ?? input.requestId ?? randomUUID(),
    sourceModule: input.sourceModule,
    targetModule: input.targetModule,
    action: input.action,
    payload: input.payload,
    metadata: input.metadata ?? ({} as TMetadata),
    ...(input.routeHint ? { routeHint: input.routeHint } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.transportHint ? { transportHint: input.transportHint } : {}),
  };
}
