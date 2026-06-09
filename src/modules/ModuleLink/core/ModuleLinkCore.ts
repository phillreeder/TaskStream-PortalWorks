import { createModuleLinkEnvelope } from './envelope.js';
import { ModuleLinkRouteRegistry } from './RouteRegistry.js';
import type {
  ModuleLinkDeliveryResult,
  ModuleLinkEnvelope,
  ModuleLinkEnvelopeInput,
  ModuleLinkRoute,
  TargetSemanticRejection,
} from './types.js';

export interface ModuleLinkCoreOptions {
  readonly routes?: readonly ModuleLinkRoute[];
  readonly registry?: ModuleLinkRouteRegistry;
}

export class ModuleLinkCore {
  readonly registry: ModuleLinkRouteRegistry;

  constructor(options: ModuleLinkCoreOptions = {}) {
    this.registry = options.registry ?? new ModuleLinkRouteRegistry();
    for (const route of options.routes ?? []) {
      this.registry.register(route);
    }
  }

  createEnvelope<TPayload, TMetadata extends Record<string, unknown> = Record<string, unknown>>(
    input: ModuleLinkEnvelopeInput<TPayload, TMetadata>,
  ): ModuleLinkEnvelope<TPayload, TMetadata> {
    return createModuleLinkEnvelope(input);
  }

  registerRoute(route: ModuleLinkRoute): void {
    this.registry.register(route);
  }

  async deliver<T = unknown>(input: ModuleLinkEnvelopeInput): Promise<ModuleLinkDeliveryResult<T>> {
    const envelope = this.createEnvelope(input);
    const route = this.registry.resolve(envelope.targetModule, envelope.action);
    if (!route) {
      return {
        ok: false,
        status: 'route-not-found',
        envelope,
        error: {
          code: 'route-not-found',
          message: `No ModuleLink route registered for ${envelope.targetModule}.${envelope.action}`,
        },
      };
    }

    if ((route.mode === 'direct-library' || route.mode === 'local-handler') && !route.handler) {
      return {
        ok: false,
        status: 'delivery-failure',
        envelope,
        routeMode: route.mode,
        error: {
          code: 'delivery-failure',
          message: `ModuleLink route ${route.targetModule}.${route.action ?? '*'} has no handler`,
        },
      };
    }

    if (route.mode !== 'direct-library' && route.mode !== 'local-handler') {
      return {
        ok: false,
        status: 'transport-failure',
        envelope,
        routeMode: route.mode,
        error: {
          code: 'transport-failure',
          message: `ModuleLink route mode is not implemented in-process: ${route.mode}`,
        },
      };
    }

    try {
      const value = await route.handler!(envelope);
      if (isTargetSemanticRejection(value)) {
        return {
          ok: false,
          status: 'target-rejected',
          envelope,
          routeMode: route.mode,
          error: {
            code: 'target-rejected',
            message: value.message,
            cause: value,
          },
        };
      }
      return {
        ok: true,
        status: 'delivered',
        value: value as T,
        envelope,
        routeMode: route.mode,
      };
    } catch (cause) {
      return {
        ok: false,
        status: 'delivery-failure',
        envelope,
        routeMode: route.mode,
        error: {
          code: 'delivery-failure',
          message: `ModuleLink delivery failed for ${envelope.targetModule}.${envelope.action}`,
          cause,
        },
      };
    }
  }
}

export function targetRejected(message: string, options: Omit<TargetSemanticRejection, 'targetRejected' | 'message'> = {}): TargetSemanticRejection {
  return {
    targetRejected: true,
    message,
    ...options,
  };
}

function isTargetSemanticRejection(value: unknown): value is TargetSemanticRejection {
  return typeof value === 'object'
    && value !== null
    && (value as { readonly targetRejected?: unknown }).targetRejected === true
    && typeof (value as { readonly message?: unknown }).message === 'string';
}
