import { RuntimeScaffoldLoadError } from './errors.js';
import type {
  JsonObject,
  RuntimeScaffoldDescriptor,
  RuntimeScaffoldExecutionMode,
  RuntimeScaffoldExecutionTarget,
  RuntimeScaffoldOutputOptions,
  RuntimeScaffoldReference,
  RuntimeScaffoldStateReference,
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
    const taskId = expectString(descriptorObject.taskId ?? getObject(descriptorObject.execution)?.taskId, 'taskId', sourcePath);
    const sourceStateRef = normalizeStateReference(descriptorObject.sourceStateRef, sourcePath);
    const execution = normalizeExecution(descriptorObject.execution, sourcePath);
    const output = normalizeOutput(descriptorObject.output, sourcePath);

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
  if (value === 'flowOnly' || value === 'channelFlow') {
    return value;
  }
  throw invalidDescriptor('mode must be flowOnly or channelFlow', sourcePath);
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
