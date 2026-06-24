import { StateDefinitionValidationError, validateDefinitionStructure, validateFieldDefinition } from '../../definitionRuntime/state/index.js';
import type { StateDefinitionInput } from '../../definitionRuntime/state/index.js';
import { failTenantProcessValidation } from './errors.js';
import type {
  ArtifactContract,
  ArtifactContractRef,
  Channel,
  ChannelRef,
  CredentialContract,
  CredentialContractRef,
  Flow,
  FlowRef,
  InputContract,
  InputContractRef,
  Mapper,
  MapperRef,
  ProcessChannel,
  ProcessChannelRef,
  RegisteredTenantProcess,
  Registry,
  ResultContract,
  ResultContractRef,
  STO,
  STORef,
  StateDefinitionRef,
  Task,
  TaskRef,
  TenantProcessDefinition,
  TenantProcessRuntimeBinding,
  UnitSelector,
  UnitSelectorRef,
  Validator,
  ValidatorRef,
} from './types.js';

export interface TenantProcessValidationOptions {
  readonly validateBindings?: boolean;
}

type UnknownRecord = Record<string, unknown>;
type RegistryIdentityReader<TValue> = (value: TValue) => string | undefined;

const REQUIRED_DEFINITION_REGISTRIES = [
  'tasks',
  'channels',
  'stos',
  'flows',
  'stateDefinitions',
  'validators',
  'mappers',
] as const;

const FORBIDDEN_TASK_FIELDS = ['flowRefs', 'artifactContractRefs', 'resultContractRefs', 'credentialContractRefs'] as const;

export function validateTenantProcessDefinition(candidate: unknown): asserts candidate is TenantProcessDefinition {
  const process = expectPlainObject(candidate, 'tenantProcess');

  if (!('tenantProcessId' in process)) {
    validateEmbeddedTenantProcessDefinition(process);
    return;
  }

  expectNonEmptyString(process.tenantProcessId, 'tenantProcess.tenantProcessId');
  expectNonEmptyString(process.tenantId, 'tenantProcess.tenantId');
  expectNonEmptyString(process.processId, 'tenantProcess.processId');
  expectPositiveInteger(process.version, 'tenantProcess.version');
  expectNonEmptyString(process.name, 'tenantProcess.name');
  expectString(process.description, 'tenantProcess.description');

  for (const registryName of REQUIRED_DEFINITION_REGISTRIES) {
    expectRegistry(process[registryName], `tenantProcess.${registryName}`);
  }

  const definition = process as unknown as TenantProcessDefinition;

  validateStateDefinitions(definition.stateDefinitions);
  validateRegistryIdentity<TaskRef, Task>('tasks', definition.tasks, (task) => task.taskId);
  validateRegistryIdentity<ChannelRef, Channel>('channels', definition.channels, (channel) => channel.channelId);
  validateRegistryIdentity<STORef, STO>('stos', definition.stos, (sto) => sto.stoId);
  validateRegistryIdentity<FlowRef, Flow>('flows', definition.flows, (flow) => flow.flowId);
  validateRegistryIdentity<ValidatorRef, Validator>('validators', definition.validators, (validator) => validator.validatorId);
  validateRegistryIdentity<MapperRef, Mapper>('mappers', definition.mappers, (mapper) => mapper.mapperId);

  validateOptionalRegistryIdentity<ProcessChannelRef, ProcessChannel>(
    'processChannels',
    definition.processChannels,
    (processChannel) => processChannel.processChannelId,
  );
  validateOptionalRegistryIdentity<UnitSelectorRef, UnitSelector>(
    'unitSelectors',
    definition.unitSelectors,
    (unitSelector) => unitSelector.unitSelectorId,
  );
  validateOptionalRegistryIdentity<InputContractRef, InputContract>(
    'inputContracts',
    definition.inputContracts,
    (contract) => contract.inputContractId,
  );
  validateOptionalRegistryIdentity<ArtifactContractRef, ArtifactContract>(
    'artifactContracts',
    definition.artifactContracts,
    (contract) => contract.artifactContractId,
  );
  validateOptionalRegistryIdentity<ResultContractRef, ResultContract>(
    'resultContracts',
    definition.resultContracts,
    (contract) => contract.resultContractId,
  );
  validateOptionalRegistryIdentity<CredentialContractRef, CredentialContract>(
    'credentialContracts',
    definition.credentialContracts,
    (contract) => contract.credentialContractId,
  );

  validateExecutableRegistries(definition);
  validateTaskReferences(definition);
  validateStoReferences(definition);
  validateProcessChannelReferences(definition);
  validateContractReferences(definition);
  validateMapperReferences(definition);
}


function validateEmbeddedTenantProcessDefinition(process: UnknownRecord): void {
  const id = expectPlainObject(process.id, 'tenantProcess.id');
  expectNonEmptyString(id.tenant, 'tenantProcess.id.tenant');
  expectNonEmptyString(id.process, 'tenantProcess.id.process');
  expectNonEmptyString(process.name, 'tenantProcess.name');
  expectPositiveInteger(process.version, 'tenantProcess.version');
  expectString(process.description, 'tenantProcess.description');

  for (const registryName of ['tasks', 'channels', 'stos', 'stateDefinitions'] as const) {
    expectRegistry(process[registryName], `tenantProcess.${registryName}`);
  }

  const tasks = process.tasks as Registry<string, UnknownRecord>;
  const channels = process.channels as Registry<string, UnknownRecord>;
  const stos = process.stos as Registry<string, UnknownRecord>;
  const stateDefinitions = process.stateDefinitions as Registry<string, unknown>;

  validateStateDefinitions(stateDefinitions);
  validateEmbeddedStreamStateContracts(process, 'inputContracts');
  validateEmbeddedStreamStateContracts(process, 'resultContracts');

  for (const [channelName, channel] of Object.entries(channels)) {
    expectPlainObject(channel, `tenantProcess.channels.${channelName}`);
    expectFunction(channel.executable, `tenantProcess.channels.${channelName}.executable`);
  }

  for (const [stoName, sto] of Object.entries(stos)) {
    expectPlainObject(sto, `tenantProcess.stos.${stoName}`);
    expectFunction(sto.flow, `tenantProcess.stos.${stoName}.flow`);
    validateEmbeddedObjectReferences(process, `tenantProcess.stos.${stoName}`, sto);
  }

  for (const [taskName, task] of Object.entries(tasks)) {
    expectPlainObject(task, `tenantProcess.tasks.${taskName}`);
    expectFunction(task.activationFlow, `tenantProcess.tasks.${taskName}.activationFlow`);
    requireObjectIdentity(stateDefinitions, task.stateDefinition, `tenantProcess.tasks.${taskName}.stateDefinition`);
    if (task.channel !== undefined) {
      requireObjectIdentity(channels, task.channel, `tenantProcess.tasks.${taskName}.channel`);
    }

    expectRegistry(task.stos, `tenantProcess.tasks.${taskName}.stos`);
    const taskStos = task.stos as Registry<string, unknown>;
    for (const [stoName, sto] of Object.entries(taskStos)) {
      if (stos[stoName] !== sto) {
        failTenantProcessValidation(
          'INVALID_REFERENCE',
          `tenantProcess.tasks.${taskName}.stos.${stoName}`,
          `Task ${taskName} must reference the registered STO object ${stoName}`,
        );
      }
    }
    if (task.defaultSto !== undefined && !Object.values(taskStos).includes(task.defaultSto)) {
      failTenantProcessValidation(
        'INVALID_REFERENCE',
        `tenantProcess.tasks.${taskName}.defaultSto`,
        `Task ${taskName} defaultSto must be one of its STO objects`,
      );
    }
    validateEmbeddedObjectReferences(process, `tenantProcess.tasks.${taskName}`, task);
  }
}

function validateEmbeddedStreamStateContracts(
  process: UnknownRecord,
  registryName: 'inputContracts' | 'resultContracts',
): void {
  const registry = process[registryName];
  if (registry === undefined) return;

  expectRegistry(registry, `tenantProcess.${registryName}`);
  for (const [contractName, candidate] of Object.entries(registry as Registry<string, unknown>)) {
    const contract = expectPlainObject(candidate, `tenantProcess.${registryName}.${contractName}`);
    const fields = expectPlainObject(contract.fields, `tenantProcess.${registryName}.${contractName}.fields`);
    for (const [fieldName, fieldDefinition] of Object.entries(fields)) {
      try {
        validateFieldDefinition(
          `tenantProcess.${registryName}.${contractName}.fields.${fieldName}`,
          fieldDefinition,
        );
      } catch (error) {
        if (error instanceof Error) {
          failTenantProcessValidation(
            'INVALID_CONTRACT',
            `tenantProcess.${registryName}.${contractName}.fields.${fieldName}`,
            error.message,
          );
        }
        throw error;
      }
    }
  }
}

function validateEmbeddedObjectReferences(process: UnknownRecord, path: string, value: UnknownRecord): void {
  const bindings = [
    ['inputContracts', 'inputContracts'],
    ['resultContracts', 'resultContracts'],
    ['artifactContracts', 'artifactContracts'],
    ['credentialContracts', 'credentialContracts'],
    ['validators', 'validators'],
    ['mappers', 'mappers'],
  ] as const;

  for (const [field, registryName] of bindings) {
    const references = value[field];
    if (references === undefined) continue;
    if (!Array.isArray(references)) {
      failTenantProcessValidation('INVALID_REQUIRED_FIELD', `${path}.${field}`, `${path}.${field} must be an array`);
    }
    const registry = process[registryName];
    if (registry === undefined) {
      failTenantProcessValidation('MISSING_REFERENCE', `${path}.${field}`, `${path}.${field} requires tenantProcess.${registryName}`);
    }
    expectRegistry(registry, `tenantProcess.${registryName}`);
    for (const reference of references) {
      requireObjectIdentity(registry as Registry<string, unknown>, reference, `${path}.${field}`);
    }
  }
}

function requireObjectIdentity(registry: Registry<string, unknown>, value: unknown, path: string): void {
  if (!Object.values(registry).includes(value)) {
    failTenantProcessValidation('MISSING_REFERENCE', path, `${path} must reference an object registered in its TenantProcess collection`);
  }
}

export function validateTenantProcessRuntimeBinding(
  _definition: TenantProcessDefinition,
  binding: unknown,
): asserts binding is TenantProcessRuntimeBinding {
  if (binding === undefined || binding === null) {
    return;
  }

  const candidate = expectPlainObject(binding, 'tenantProcessBinding');
  if (Object.keys(candidate).length > 0) {
    failTenantProcessValidation(
      'INVALID_BINDING',
      'tenantProcessBinding',
      'TenantProcess runtime binding is deprecated; executable Channels and Flows belong directly to the TenantProcess definition',
    );
  }
}

export function validateRegisteredTenantProcess(candidate: unknown): asserts candidate is RegisteredTenantProcess {
  const registered = expectPlainObject(candidate, 'registeredTenantProcess');
  validateTenantProcessDefinition(registered.definition);
  if ('binding' in registered) {
    validateTenantProcessRuntimeBinding(registered.definition, registered.binding);
  }
}

function validateStateDefinitions(stateDefinitions: Registry<StateDefinitionRef, unknown>): void {
  for (const [stateDefinitionRef, stateDefinition] of Object.entries(stateDefinitions)) {
    try {
      validateDefinitionStructure(stateDefinition);
    } catch (error) {
      if (error instanceof StateDefinitionValidationError || error instanceof Error) {
        failTenantProcessValidation(
          'INVALID_STATE_DEFINITION',
          `tenantProcess.stateDefinitions.${stateDefinitionRef}`,
          `StateDefinition ${stateDefinitionRef} is invalid: ${error.message}`,
        );
      }
      throw error;
    }

    const definition = stateDefinition as StateDefinitionInput;
    if (definition.id !== stateDefinitionRef) {
      failTenantProcessValidation(
        'REGISTRY_ID_MISMATCH',
        `tenantProcess.stateDefinitions.${stateDefinitionRef}.id`,
        `StateDefinition registry key ${stateDefinitionRef} does not match id ${definition.id}`,
      );
    }
  }
}

function validateRegistryIdentity<TKey extends string, TValue>(
  registryName: string,
  registry: Registry<TKey, TValue>,
  readIdentity: RegistryIdentityReader<TValue>,
): void {
  for (const [key, value] of Object.entries(registry)) {
    const path = `tenantProcess.${registryName}.${key}`;
    expectPlainObject(value, path);
    const identity = readIdentity(value as TValue);
    if (typeof identity !== 'string' || identity.length === 0) {
      failTenantProcessValidation(
        'INVALID_REQUIRED_FIELD',
        path,
        `${registryName}.${key} is missing its required self-identity field`,
      );
    }
    if (identity !== key) {
      failTenantProcessValidation(
        'REGISTRY_ID_MISMATCH',
        path,
        `${registryName} registry key ${key} does not match self-identity ${identity}`,
      );
    }
  }
}

function validateOptionalRegistryIdentity<TKey extends string, TValue>(
  registryName: string,
  registry: Registry<TKey, TValue> | undefined,
  readIdentity: RegistryIdentityReader<TValue>,
): void {
  if (registry === undefined) {
    return;
  }
  expectRegistry(registry, `tenantProcess.${registryName}`);
  validateRegistryIdentity(registryName, registry, readIdentity);
}

function validateExecutableRegistries(definition: TenantProcessDefinition): void {
  for (const channel of Object.values(definition.channels)) {
    expectNoField(channel, 'executableRef', `tenantProcess.channels.${channel.channelId}`);
    expectNoField(channel, 'handlerRef', `tenantProcess.channels.${channel.channelId}`);
    expectSyncFunction(channel.executable, `tenantProcess.channels.${channel.channelId}.executable`);
  }

  for (const flow of Object.values(definition.flows)) {
    expectNoField(flow, 'executableRef', `tenantProcess.flows.${flow.flowId}`);
    expectFunction(flow.executable, `tenantProcess.flows.${flow.flowId}.executable`);
  }

  for (const processChannel of Object.values(definition.processChannels ?? {})) {
    expectNoField(processChannel, 'executableRef', `tenantProcess.processChannels.${processChannel.processChannelId}`);
    expectSyncFunction(processChannel.executable, `tenantProcess.processChannels.${processChannel.processChannelId}.executable`);
  }

  for (const validator of Object.values(definition.validators)) {
    if (validator.executable !== undefined) {
      expectSyncFunction(validator.executable, `tenantProcess.validators.${validator.validatorId}.executable`);
    }
  }

  for (const mapper of Object.values(definition.mappers)) {
    if (mapper.executable !== undefined) {
      expectSyncFunction(mapper.executable, `tenantProcess.mappers.${mapper.mapperId}.executable`);
    }
  }
}

function validateTaskReferences(definition: TenantProcessDefinition): void {
  for (const task of Object.values(definition.tasks)) {
    for (const forbiddenField of FORBIDDEN_TASK_FIELDS) {
      expectNoField(task, forbiddenField, `tenantProcess.tasks.${task.taskId}`);
    }

    requireReference(definition.stateDefinitions, task.stateDefinitionRef, `tenantProcess.tasks.${task.taskId}.stateDefinitionRef`);

    if (task.channelRef !== undefined) {
      requireReference(definition.channels, task.channelRef, `tenantProcess.tasks.${task.taskId}.channelRef`);
    }

    if (!Array.isArray(task.stoRefs)) {
      failTenantProcessValidation(
        'INVALID_REQUIRED_FIELD',
        `tenantProcess.tasks.${task.taskId}.stoRefs`,
        `Task ${task.taskId} stoRefs must be an array`,
      );
    }

    for (const stoRef of task.stoRefs) {
      requireReference(definition.stos, stoRef, `tenantProcess.tasks.${task.taskId}.stoRefs`);
      const sto = definition.stos[stoRef];
      if (sto.taskRef !== task.taskId) {
        failTenantProcessValidation(
          'INVALID_REFERENCE',
          `tenantProcess.tasks.${task.taskId}.stoRefs`,
          `Task ${task.taskId} references STO ${stoRef}, but that STO belongs to task ${sto.taskRef}`,
        );
      }
    }

    if (task.defaultStoRef !== undefined) {
      requireReference(definition.stos, task.defaultStoRef, `tenantProcess.tasks.${task.taskId}.defaultStoRef`);
      if (!task.stoRefs.includes(task.defaultStoRef)) {
        failTenantProcessValidation(
          'INVALID_REFERENCE',
          `tenantProcess.tasks.${task.taskId}.defaultStoRef`,
          `Task ${task.taskId} defaultStoRef ${task.defaultStoRef} must also be present in stoRefs`,
        );
      }
    }
  }
}

function validateStoReferences(definition: TenantProcessDefinition): void {
  for (const sto of Object.values(definition.stos)) {
    requireReference(definition.tasks, sto.taskRef, `tenantProcess.stos.${sto.stoId}.taskRef`);
    requireReference(definition.flows, sto.flowRef, `tenantProcess.stos.${sto.stoId}.flowRef`);
  }
}

function validateProcessChannelReferences(definition: TenantProcessDefinition): void {
  for (const processChannel of Object.values(definition.processChannels ?? {})) {
    for (const taskRef of processChannel.sourceTaskRefs ?? []) {
      requireReference(definition.tasks, taskRef, `tenantProcess.processChannels.${processChannel.processChannelId}.sourceTaskRefs`);
    }
    for (const taskRef of processChannel.targetTaskRefs) {
      requireReference(definition.tasks, taskRef, `tenantProcess.processChannels.${processChannel.processChannelId}.targetTaskRefs`);
    }
  }
}

function validateContractReferences(definition: TenantProcessDefinition): void {
  for (const task of Object.values(definition.tasks)) {
    validateCommonRefs(definition, `tenantProcess.tasks.${task.taskId}`, task, {
      allowArtifacts: false,
      allowResults: false,
      allowCredentials: false,
    });
  }
  for (const sto of Object.values(definition.stos)) {
    validateCommonRefs(definition, `tenantProcess.stos.${sto.stoId}`, sto, {
      allowArtifacts: true,
      allowResults: true,
      allowCredentials: true,
    });
  }
  for (const contract of Object.values(definition.inputContracts ?? {})) {
    validateCommonRefs(definition, `tenantProcess.inputContracts.${contract.inputContractId}`, contract, {
      allowArtifacts: false,
      allowResults: false,
      allowCredentials: true,
    });
  }
  for (const contract of Object.values(definition.artifactContracts ?? {})) {
    validateCommonRefs(definition, `tenantProcess.artifactContracts.${contract.artifactContractId}`, contract, {
      allowArtifacts: false,
      allowResults: false,
      allowCredentials: true,
    });
  }
  for (const contract of Object.values(definition.resultContracts ?? {})) {
    validateCommonRefs(definition, `tenantProcess.resultContracts.${contract.resultContractId}`, contract, {
      allowArtifacts: false,
      allowResults: false,
      allowCredentials: false,
    });
  }
}

function validateMapperReferences(definition: TenantProcessDefinition): void {
  for (const task of Object.values(definition.tasks)) {
    for (const ref of task.unitSelectorRefs ?? []) {
      requireOptionalRegistryReference(definition.unitSelectors, ref, `tenantProcess.tasks.${task.taskId}.unitSelectorRefs`);
    }
  }
  for (const selector of Object.values(definition.unitSelectors ?? {})) {
    for (const ref of selector.mapperRefs ?? []) {
      requireReference(definition.mappers, ref, `tenantProcess.unitSelectors.${selector.unitSelectorId}.mapperRefs`);
    }
  }
  for (const processChannel of Object.values(definition.processChannels ?? {})) {
    for (const taskRef of processChannel.targetTaskRefs) {
      requireReference(definition.tasks, taskRef, `tenantProcess.processChannels.${processChannel.processChannelId}.targetTaskRefs`);
    }
  }
}

function validateCommonRefs(
  definition: TenantProcessDefinition,
  path: string,
  value: {
    readonly inputContractRefs?: readonly InputContractRef[];
    readonly validatorRefs?: readonly ValidatorRef[];
    readonly mapperRefs?: readonly MapperRef[];
    readonly artifactContractRefs?: readonly ArtifactContractRef[];
    readonly resultContractRefs?: readonly ResultContractRef[];
    readonly credentialContractRefs?: readonly CredentialContractRef[];
  },
  options: {
    readonly allowArtifacts: boolean;
    readonly allowResults: boolean;
    readonly allowCredentials: boolean;
  },
): void {
  for (const ref of value.inputContractRefs ?? []) {
    requireOptionalRegistryReference(definition.inputContracts, ref, `${path}.inputContractRefs`);
  }
  for (const ref of value.validatorRefs ?? []) {
    requireReference(definition.validators, ref, `${path}.validatorRefs`);
  }
  for (const ref of value.mapperRefs ?? []) {
    requireReference(definition.mappers, ref, `${path}.mapperRefs`);
  }
  for (const ref of value.artifactContractRefs ?? []) {
    if (!options.allowArtifacts) {
      failTenantProcessValidation('INVALID_REFERENCE', `${path}.artifactContractRefs`, `${path} must not bind artifact contracts`);
    }
    requireOptionalRegistryReference(definition.artifactContracts, ref, `${path}.artifactContractRefs`);
  }
  for (const ref of value.resultContractRefs ?? []) {
    if (!options.allowResults) {
      failTenantProcessValidation('INVALID_REFERENCE', `${path}.resultContractRefs`, `${path} must not bind result contracts`);
    }
    requireOptionalRegistryReference(definition.resultContracts, ref, `${path}.resultContractRefs`);
  }
  for (const ref of value.credentialContractRefs ?? []) {
    if (!options.allowCredentials) {
      failTenantProcessValidation('INVALID_REFERENCE', `${path}.credentialContractRefs`, `${path} must not bind credential contracts`);
    }
    requireOptionalRegistryReference(definition.credentialContracts, ref, `${path}.credentialContractRefs`);
  }
}

function requireReference<TValue>(registry: Registry<string, TValue>, ref: string, path: string): TValue {
  if (typeof ref !== 'string' || ref.length === 0) {
    failTenantProcessValidation('INVALID_REFERENCE', path, `${path} must be a non-empty reference string`);
  }
  const value = registry[ref];
  if (value === undefined) {
    failTenantProcessValidation('MISSING_REFERENCE', path, `${path} references missing entry ${ref}`);
  }
  return value;
}

function requireOptionalRegistryReference<TValue>(
  registry: Registry<string, TValue> | undefined,
  ref: string,
  path: string,
): TValue {
  if (registry === undefined) {
    failTenantProcessValidation('MISSING_REFERENCE', path, `${path} references ${ref}, but its registry is not defined`);
  }
  return requireReference(registry, ref, path);
}

function expectPlainObject(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failTenantProcessValidation('INVALID_ROOT', path, `${path} must be a plain object`);
  }
  return value as UnknownRecord;
}

function expectRegistry(value: unknown, path: string): asserts value is Registry<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failTenantProcessValidation('INVALID_REGISTRY', path, `${path} must be a registry object`);
  }
}

function expectNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    failTenantProcessValidation('INVALID_REQUIRED_FIELD', path, `${path} must be a non-empty string`);
  }
}

function expectString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') {
    failTenantProcessValidation('INVALID_REQUIRED_FIELD', path, `${path} must be a string`);
  }
}

function expectPositiveInteger(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    failTenantProcessValidation('INVALID_REQUIRED_FIELD', path, `${path} must be a positive integer`);
  }
}

function expectFunction(value: unknown, path: string): asserts value is (...args: unknown[]) => unknown {
  if (typeof value !== 'function') {
    failTenantProcessValidation('INVALID_REQUIRED_FIELD', path, `${path} must be an executable function`);
  }
}

function expectSyncFunction(value: unknown, path: string): asserts value is (...args: unknown[]) => unknown {
  expectFunction(value, path);
  if (value.constructor.name === 'AsyncFunction') {
    failTenantProcessValidation('INVALID_REQUIRED_FIELD', path, `${path} must be synchronous`);
  }
}

function expectNoField(value: unknown, field: string, path: string): void {
  const record = value as Record<string, unknown>;
  if (field in record) {
    failTenantProcessValidation('INVALID_REQUIRED_FIELD', `${path}.${field}`, `${path}.${field} is not part of canonical TenantProcess shape`);
  }
}
