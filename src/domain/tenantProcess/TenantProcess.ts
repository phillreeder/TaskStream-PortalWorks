import { defineState } from '../../definitionRuntime/state/defineState.js';
import type { FieldDefinitions, StateDefinition, StateDefinitionInput } from '../../definitionRuntime/state/index.js';
import { channel as defineChannel } from './channel.js';
import { flow as defineFlow } from './flow.js';
import type {
  ChannelExecutable,
  FlowExecutable,
  InputContract,
  ResultContract,
} from './types.js';
import { validateTenantProcessDefinition } from './validateTenantProcess.js';

export const TENANT_PROCESS_DECLARATION_ORDER = [
  'stateDefinitions',
  'channels',
  'inputContracts',
  'resultContracts',
  'stos',
  'tasks',
] as const;

export type TenantProcessDeclarationKind = typeof TENANT_PROCESS_DECLARATION_ORDER[number];

export interface TenantProcessIdentity {
  readonly tenant: string;
  readonly process: string;
}

export interface TenantProcessSourceDefinition {
  readonly id: TenantProcessIdentity;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly declarationOrder?: readonly TenantProcessDeclarationKind[];
}

/**
 * Validated executable TenantProcess shape produced by TenantProcess.define().
 *
 * The composition API embeds resolved definition objects so runtime consumers
 * do not need to reconstruct reference bindings or cast the loaded process to
 * private anonymous shapes.
 */
export interface ComposedTenantProcessChannel {
  readonly executable: ChannelExecutable;
}

export interface ComposedTenantProcessSto {
  readonly flow: FlowExecutable;
  readonly inputContracts?: readonly InputContract[];
  readonly resultContracts?: readonly ResultContract[];
  readonly [key: string]: unknown;
}

export interface ComposedTenantProcessTask {
  readonly activationFlow: FlowExecutable;
  readonly stateDefinition: StateDefinition<FieldDefinitions>;
  readonly channel?: ComposedTenantProcessChannel;
  readonly stos: Readonly<Record<string, ComposedTenantProcessSto>>;
  readonly defaultSto?: ComposedTenantProcessSto;
  readonly inputContracts?: readonly InputContract[];
  readonly [key: string]: unknown;
}

export interface ComposedTenantProcessDefinition {
  readonly id: TenantProcessIdentity;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly tasks: Readonly<Record<string, ComposedTenantProcessTask>>;
  readonly channels: Readonly<Record<string, ComposedTenantProcessChannel>>;
  readonly stos: Readonly<Record<string, ComposedTenantProcessSto>>;
  readonly stateDefinitions: Readonly<Record<string, StateDefinition<FieldDefinitions>>>;
  readonly inputContracts?: Readonly<Record<string, InputContract>>;
  readonly resultContracts?: Readonly<Record<string, ResultContract>>;
}

type StateDefinitionSource<TFields extends FieldDefinitions = FieldDefinitions> =
  StateDefinitionInput<TFields> & { readonly defaults: Record<string, unknown> };

type StateDefinitionRegistrySource = Readonly<Record<string, StateDefinitionSource>>;
type ChannelRegistrySource = Readonly<Record<string, { readonly executable: ChannelExecutable }>>;
type InputContractRegistrySource = Readonly<Record<string, InputContract>>;
type ResultContractRegistrySource = Readonly<Record<string, ResultContract>>;

export interface TenantProcessStoSource {
  readonly flow: FlowExecutable;
  readonly inputContracts?: readonly InputContract[];
  readonly resultContracts?: readonly ResultContract[];
  readonly [key: string]: unknown;
}

type StoRegistrySource = Readonly<Record<string, TenantProcessStoSource>>;

export interface TenantProcessTaskSource {
  readonly activationFlow: FlowExecutable;
  readonly stateDefinition: unknown;
  readonly channel?: unknown;
  readonly stos: Readonly<Record<string, unknown>>;
  readonly defaultSto?: unknown;
  readonly inputContracts?: readonly InputContract[];
  readonly [key: string]: unknown;
}

type TaskRegistrySource = Readonly<Record<string, TenantProcessTaskSource>>;

type Registry = Record<string, unknown>;

export interface TenantProcessComposer {
  stateDefinitions<T extends StateDefinitionRegistrySource>(definitions: T): Readonly<Record<keyof T, unknown>>;
  channels<T extends ChannelRegistrySource>(channels: T): Readonly<Record<keyof T, unknown>>;
  inputContracts<T extends InputContractRegistrySource>(contracts: T): T;
  resultContracts<T extends ResultContractRegistrySource>(contracts: T): T;
  stos<T extends StoRegistrySource>(stos: T): Readonly<Record<keyof T, unknown>>;
  tasks<T extends TaskRegistrySource>(tasks: T): Readonly<Record<keyof T, unknown>>;
}

export interface TenantProcessCompositionContext {
  readonly tp: TenantProcessComposer;
}

class TenantProcessBuilder implements TenantProcessComposer {
  private readonly order: readonly TenantProcessDeclarationKind[];
  private orderIndex = 0;
  private readonly declaredKinds = new Set<TenantProcessDeclarationKind>();

  private readonly stateDefinitionRegistry: Registry = {};
  private readonly channelRegistry: Registry = {};
  private readonly inputContractRegistry: Registry = {};
  private readonly resultContractRegistry: Registry = {};
  private readonly stoRegistry: Registry = {};
  private readonly taskRegistry: Registry = {};

  constructor(private readonly source: TenantProcessSourceDefinition) {
    this.order = source.declarationOrder ?? TENANT_PROCESS_DECLARATION_ORDER;
    this.validateOrder();
  }

  stateDefinitions<T extends StateDefinitionRegistrySource>(definitions: T): Readonly<Record<keyof T, unknown>> {
    this.beginPhase('stateDefinitions');
    for (const [name, definition] of Object.entries(definitions)) {
      this.assertUnique(this.stateDefinitionRegistry, 'stateDefinition', name);
      this.stateDefinitionRegistry[name] = defineState<Record<string, unknown>>()({
        ...definition,
        id: definition.id ?? name,
      } as any);
    }
    return this.stateDefinitionRegistry as Readonly<Record<keyof T, unknown>>;
  }

  channels<T extends ChannelRegistrySource>(channels: T): Readonly<Record<keyof T, unknown>> {
    this.beginPhase('channels');
    for (const [name, source] of Object.entries(channels)) {
      this.assertUnique(this.channelRegistry, 'channel', name);
      this.channelRegistry[name] = {
        ...source,
        executable: defineChannel(source.executable),
      };
    }
    return this.channelRegistry as Readonly<Record<keyof T, unknown>>;
  }

  inputContracts<T extends InputContractRegistrySource>(contracts: T): T {
    this.beginPhase('inputContracts');
    this.copyRegistry(this.inputContractRegistry, 'inputContract', contracts);
    return this.inputContractRegistry as T;
  }

  resultContracts<T extends ResultContractRegistrySource>(contracts: T): T {
    this.beginPhase('resultContracts');
    this.copyRegistry(this.resultContractRegistry, 'resultContract', contracts);
    return this.resultContractRegistry as T;
  }

  stos<T extends StoRegistrySource>(stos: T): Readonly<Record<keyof T, unknown>> {
    this.beginPhase('stos');
    for (const [name, source] of Object.entries(stos)) {
      this.assertUnique(this.stoRegistry, 'sto', name);
      this.stoRegistry[name] = {
        ...source,
        flow: defineFlow(source.flow),
      };
    }
    return this.stoRegistry as Readonly<Record<keyof T, unknown>>;
  }

  tasks<T extends TaskRegistrySource>(tasks: T): Readonly<Record<keyof T, unknown>> {
    this.beginPhase('tasks');
    for (const [name, source] of Object.entries(tasks)) {
      this.assertUnique(this.taskRegistry, 'task', name);
      this.taskRegistry[name] = {
        ...source,
        activationFlow: defineFlow(source.activationFlow),
      };
    }
    return this.taskRegistry as Readonly<Record<keyof T, unknown>>;
  }

  build(): ComposedTenantProcessDefinition {
    const missingKinds = this.order.filter((kind) => !this.declaredKinds.has(kind));
    if (missingKinds.length > 0) {
      throw new Error(
        `TenantProcess ${this.source.id.tenant}/${this.source.id.process} is incomplete: `
        + `missing declaration phases ${missingKinds.join(', ')}`,
      );
    }

    const tenantProcess = {
      id: this.source.id,
      name: this.source.name,
      version: this.source.version,
      description: this.source.description,
      tasks: this.taskRegistry,
      channels: this.channelRegistry,
      stos: this.stoRegistry,
      stateDefinitions: this.stateDefinitionRegistry,
      ...(Object.keys(this.inputContractRegistry).length > 0
        ? { inputContracts: this.inputContractRegistry }
        : {}),
      ...(Object.keys(this.resultContractRegistry).length > 0
        ? { resultContracts: this.resultContractRegistry }
        : {}),
    };

    validateTenantProcessDefinition(tenantProcess);
    return tenantProcess as ComposedTenantProcessDefinition;
  }

  private beginPhase(kind: TenantProcessDeclarationKind): void {
    const requestedIndex = this.order.indexOf(kind);
    if (requestedIndex === -1) {
      throw new Error(`TenantProcess declaration kind ${kind} is absent from declarationOrder`);
    }
    if (requestedIndex < this.orderIndex) {
      throw new Error(`TenantProcess ${kind} declarations are closed; current phase is ${this.order[this.orderIndex]}`);
    }
    if (this.declaredKinds.has(kind)) {
      throw new Error(`TenantProcess declaration phase ${kind} has already been declared`);
    }
    this.orderIndex = requestedIndex;
    this.declaredKinds.add(kind);
  }

  private copyRegistry(target: Registry, kind: string, source: Readonly<Record<string, unknown>>): void {
    for (const [name, value] of Object.entries(source)) {
      this.assertUnique(target, kind, name);
      target[name] = value;
    }
  }

  private assertUnique(registry: Registry, kind: string, name: string): void {
    if (!name.trim()) throw new Error(`TenantProcess ${kind} name must be non-empty`);
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      throw new Error(`TenantProcess ${kind} ${name} is already declared`);
    }
  }

  private validateOrder(): void {
    const expected = new Set<TenantProcessDeclarationKind>(TENANT_PROCESS_DECLARATION_ORDER);
    if (this.order.length !== expected.size || this.order.some((kind) => !expected.delete(kind))) {
      throw new Error('TenantProcess declarationOrder must contain every declaration kind exactly once');
    }
  }
}

export const TenantProcess = {
  define(
    source: TenantProcessSourceDefinition,
    compose: (context: TenantProcessCompositionContext) => void,
  ): ComposedTenantProcessDefinition {
    const builder = new TenantProcessBuilder(source);
    compose({ tp: builder });
    return builder.build();
  },
};
