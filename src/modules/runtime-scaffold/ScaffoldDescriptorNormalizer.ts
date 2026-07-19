import { RuntimeScaffoldLoadError } from './errors.js';
import type {
  JsonObject,
  RuntimeScaffoldDescriptor,
  RuntimeScaffoldExecutionMode,
  RuntimeScaffoldExecutionTarget,
  RuntimeScaffoldOutputOptions,
  RuntimeScaffoldReference,
  RuntimeScaffoldStateReference,
  RuntimeScaffoldWebOptions,
} from './types.js';

export interface NormalizedDescriptorResult {
  readonly descriptor: RuntimeScaffoldDescriptor;
  readonly warnings: readonly string[];
}

export class ScaffoldDescriptorNormalizer {
  normalize(rawDescriptor: unknown, sourcePath?: string): NormalizedDescriptorResult {
    const descriptorObject = expectObject(rawDescriptor, 'RuntimeScaffoldDescriptor', sourcePath);
    const warnings: string[] = [];

    const id = expectString(descriptorObject.id ?? descriptorObject.runId, 'id', sourcePath);
    const mode = expectMode(descriptorObject.mode, sourcePath);
    const tenantProcessRef = normalizeReference(descriptorObject.tenantProcessRef, 'tenantProcessRef', sourcePath);
    const taskId = expectString(
      descriptorObject.taskRef ?? descriptorObject.taskId ?? getObject(descriptorObject.execution)?.taskId,
      'taskId',
      sourcePath,
    );
    const sourceStateRef = normalizeDescriptorStateReference(descriptorObject, sourcePath);
    const execution = normalizeDescriptorExecution(descriptorObject, sourcePath);
    const output = normalizeDescriptorOutput(descriptorObject, sourcePath);
    const web = normalizeWeb(descriptorObject.web, sourcePath);

    if (mode === 'flowOnly' && execution?.channelId) {
      warnings.push('flowOnly descriptor includes execution.channelId; loader preserved it without resolving Channel semantics.');
    }

    if (mode === 'channelFlow' && !execution?.channelId && !execution?.stoId) {
      warnings.push('channelFlow descriptor does not provide execution.channelId or execution.stoId; loader normalized without executing.');
    }

    return {
      descriptor: {
        id,
        mode,
        tenantProcessRef,
        taskId,
        sourceStateRef,
        ...(execution ? { execution } : {}),
        ...(output ? { output } : {}),
        ...(isJsonObject(descriptorObject.mocks) ? { mocks: descriptorObject.mocks } : {}),
        ...(web ? { web } : {}),
      },
      warnings,
    };
  }
}

function normalizeReference(rawValue: unknown, fieldName: string, sourcePath?: string): RuntimeScaffoldReference {
  const value = expectObject(rawValue, fieldName, sourcePath);
  const kind = expectString(value.kind, `${fieldName}.kind`, sourcePath);
  if (kind !== 'file' && kind !== 'module' && kind !== 'fixture') {
    throw invalidDescriptor(`${fieldName}.kind must be file, module, or fixture`, sourcePath);
  }

  return {
    kind,
    ref: expectString(value.ref, `${fieldName}.ref`, sourcePath),
  };
}

function normalizeDescriptorStateReference(
  descriptor: JsonObject,
  sourcePath?: string,
): RuntimeScaffoldStateReference {
  if ('initialState' in descriptor) {
    return { kind: 'inline', value: descriptor.initialState };
  }
  return normalizeStateReference(descriptor.initialStateRef ?? descriptor.sourceStateRef, sourcePath);
}

function normalizeStateReference(rawValue: unknown, sourcePath?: string): RuntimeScaffoldStateReference {
  const value = expectObject(rawValue, 'sourceStateRef', sourcePath);
  const kind = expectString(value.kind, 'sourceStateRef.kind', sourcePath);

  if (kind === 'inline') {
    if (!('value' in value)) {
      throw invalidDescriptor('sourceStateRef.value is required when sourceStateRef.kind is inline', sourcePath);
    }
    return {
      kind,
      value: value.value,
    };
  }

  if (kind !== 'file' && kind !== 'fixture') {
    throw invalidDescriptor('sourceStateRef.kind must be file, inline, or fixture', sourcePath);
  }

  return {
    kind,
    ref: expectString(value.ref, 'sourceStateRef.ref', sourcePath),
  };
}


function normalizeDescriptorExecution(
  descriptor: JsonObject,
  sourcePath?: string,
): RuntimeScaffoldExecutionTarget | undefined {
  const normalized = normalizeExecution(descriptor.execution, sourcePath);
  if (!('input' in descriptor)) {
    return normalized;
  }
  return {
    ...(normalized ?? {}),
    input: descriptor.input,
  };
}

function normalizeDescriptorOutput(
  descriptor: JsonObject,
  sourcePath?: string,
): RuntimeScaffoldOutputOptions | undefined {
  const normalized = normalizeOutput(descriptor.output, sourcePath);
  if (descriptor.runtimeRoot === undefined) {
    return normalized;
  }
  return {
    ...(normalized ?? {}),
    outputDir: expectString(descriptor.runtimeRoot, 'runtimeRoot', sourcePath),
  };
}

function normalizeExecution(rawValue: unknown, sourcePath?: string): RuntimeScaffoldExecutionTarget | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const value = expectObject(rawValue, 'execution', sourcePath);
  const flowId = optionalString(value.flowId, 'execution.flowId', sourcePath);
  const channelId = optionalString(value.channelId, 'execution.channelId', sourcePath);
  const stoId = optionalString(value.stoId, 'execution.stoId', sourcePath);
  const taskId = optionalString(value.taskId, 'execution.taskId', sourcePath);

  return {
    ...(flowId ? { flowId } : {}),
    ...(channelId ? { channelId } : {}),
    ...(stoId ? { stoId } : {}),
    ...(taskId ? { taskId } : {}),
    ...('input' in value ? { input: value.input } : {}),
    ...('params' in value ? { input: value.params } : {}),
  };
}

function normalizeWeb(rawValue: unknown, sourcePath?: string): RuntimeScaffoldWebOptions | undefined {
  if (rawValue === undefined) return undefined;

  const value = expectObject(rawValue, 'web', sourcePath);
  const provider = expectString(value.provider, 'web.provider', sourcePath);
  if (provider !== 'playwright') {
    throw invalidDescriptor('web.provider must be playwright', sourcePath);
  }

  const session = expectObject(value.session, 'web.session', sourcePath);
  const strategy = expectString(session.strategy, 'web.session.strategy', sourcePath);
  if (strategy !== 'persistent-profile') {
    throw invalidDescriptor('web.session.strategy must be persistent-profile', sourcePath);
  }

  const browser = value.browser === undefined ? undefined : expectObject(value.browser, 'web.browser', sourcePath);
  return {
    provider,
    session: {
      sessionRef: expectString(session.sessionRef, 'web.session.sessionRef', sourcePath),
      providerId: expectString(session.providerId, 'web.session.providerId', sourcePath),
      ...(session.tenantRef === undefined ? {} : { tenantRef: expectString(session.tenantRef, 'web.session.tenantRef', sourcePath) }),
      ...(session.accountRef === undefined ? {} : { accountRef: expectString(session.accountRef, 'web.session.accountRef', sourcePath) }),
      strategy,
      profileDir: expectString(session.profileDir, 'web.session.profileDir', sourcePath),
    },
    ...(browser ? {
      browser: {
        ...(browser.maximumBrowserInstances === undefined ? {} : {
          maximumBrowserInstances: expectPositiveInteger(browser.maximumBrowserInstances, 'web.browser.maximumBrowserInstances', sourcePath),
        }),
        ...(browser.headless === undefined ? {} : { headless: expectBoolean(browser.headless, 'web.browser.headless', sourcePath) }),
        ...(isJsonObject(browser.launchOptions) ? { launchOptions: browser.launchOptions } : {}),
        ...(isJsonObject(browser.contextOptions) ? { contextOptions: browser.contextOptions } : {}),
        ...(isJsonObject(browser.persistentContextOptions) ? { persistentContextOptions: browser.persistentContextOptions } : {}),
      },
    } : {}),
  };
}

function normalizeOutput(rawValue: unknown, sourcePath?: string): RuntimeScaffoldOutputOptions | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const value = expectObject(rawValue, 'output', sourcePath);
  return {
    ...(value.outputDir !== undefined ? { outputDir: expectString(value.outputDir, 'output.outputDir', sourcePath) } : {}),
    ...(value.writeTrace !== undefined ? { writeTrace: expectBoolean(value.writeTrace, 'output.writeTrace', sourcePath) } : {}),
    ...(value.writeResult !== undefined ? { writeResult: expectBoolean(value.writeResult, 'output.writeResult', sourcePath) } : {}),
    ...(value.writeNextState !== undefined ? { writeNextState: expectBoolean(value.writeNextState, 'output.writeNextState', sourcePath) } : {}),
  };
}

function expectMode(value: unknown, sourcePath?: string): RuntimeScaffoldExecutionMode {
  if (value === 'flowOnly' || value === 'channelFlow' || value === 'flatTask') {
    return value;
  }
  throw invalidDescriptor('mode must be flowOnly, channelFlow, or flatTask', sourcePath);
}

function expectObject(value: unknown, fieldName: string, sourcePath?: string): JsonObject {
  if (!isJsonObject(value)) {
    throw invalidDescriptor(`${fieldName} must be an object`, sourcePath);
  }
  return value;
}

function expectString(value: unknown, fieldName: string, sourcePath?: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidDescriptor(`${fieldName} must be a non-empty string`, sourcePath);
  }
  return value;
}

function optionalString(value: unknown, fieldName: string, sourcePath?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectString(value, fieldName, sourcePath);
}

function expectPositiveInteger(value: unknown, fieldName: string, sourcePath?: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw invalidDescriptor(`${fieldName} must be a positive integer`, sourcePath);
  }
  return value as number;
}

function expectBoolean(value: unknown, fieldName: string, sourcePath?: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidDescriptor(`${fieldName} must be a boolean`, sourcePath);
  }
  return value;
}

function invalidDescriptor(message: string, sourcePath?: string): RuntimeScaffoldLoadError {
  return new RuntimeScaffoldLoadError({
    message,
    code: 'DESCRIPTOR_INVALID',
    phase: 'normalization',
    path: sourcePath,
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}
