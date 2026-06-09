export type ModuleLinkRouteMode = 'direct-library' | 'local-handler' | 'configured-address' | 'gateway';
export type ModuleLinkDeliveryStatus = 'delivered' | 'route-not-found' | 'timeout' | 'transport-failure' | 'delivery-failure' | 'target-rejected';

export interface ModuleLinkEnvelope<TPayload = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly requestId: string;
  readonly correlationId: string;
  readonly sourceModule: string;
  readonly targetModule: string;
  readonly action: string;
  readonly payload: TPayload;
  readonly metadata: TMetadata;
  readonly routeHint?: string;
  readonly timeoutMs?: number;
  readonly transportHint?: string;
}

export interface ModuleLinkEnvelopeInput<TPayload = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly sourceModule: string;
  readonly targetModule: string;
  readonly action: string;
  readonly payload: TPayload;
  readonly metadata?: TMetadata;
  readonly routeHint?: string;
  readonly timeoutMs?: number;
  readonly transportHint?: string;
}

export interface ModuleLinkDeliveryError {
  readonly code: ModuleLinkDeliveryStatus;
  readonly message: string;
  readonly cause?: unknown;
}

export type ModuleLinkDeliveryResult<T = unknown> =
  | {
      readonly ok: true;
      readonly status: 'delivered';
      readonly value: T;
      readonly envelope: ModuleLinkEnvelope;
      readonly routeMode: ModuleLinkRouteMode;
    }
  | {
      readonly ok: false;
      readonly status: Exclude<ModuleLinkDeliveryStatus, 'delivered'>;
      readonly error: ModuleLinkDeliveryError;
      readonly envelope: ModuleLinkEnvelope;
      readonly routeMode?: ModuleLinkRouteMode;
    };

export type ModuleLinkHandler = (envelope: ModuleLinkEnvelope) => unknown | Promise<unknown>;

export interface ModuleLinkRoute {
  readonly targetModule: string;
  readonly action?: string;
  readonly mode: ModuleLinkRouteMode;
  readonly handler?: ModuleLinkHandler;
  readonly address?: string;
}

export interface TargetSemanticRejection {
  readonly targetRejected: true;
  readonly message: string;
  readonly code?: string;
  readonly details?: unknown;
}
