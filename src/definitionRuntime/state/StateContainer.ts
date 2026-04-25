import { isValidatedStateDefinition } from './defineState.js';
import { StateChangeValidationError } from './errors.js';
import type { DefaultsFromFields, FieldDefinitions, StateDefinition } from './types/index.js';
import { deepFreeze, describeValue, isPlainObject } from './utils.js';
import { validateState } from './validateState.js';

export type StatePathSegment = string | number;
export type StatePath = readonly StatePathSegment[];

export interface StatePathValueInput {
  path: StatePath;
  value: unknown;
}

export interface StatePathInput {
  path: StatePath;
}

export interface StateContainerOptions {
  validateOnly?: boolean;
}

export interface StateContainerValidationSuccess {
  valid: true;
}

export interface StateContainerValidationFailure {
  valid: false;
  error: StateContainerOperationError;
}

export type StateContainerValidationResult = StateContainerValidationSuccess | StateContainerValidationFailure;

export type StateContainerOperationErrorCode =
  | 'INVALID_DEFINITION'
  | 'INVALID_OPERATION_INPUT'
  | 'INVALID_PATH'
  | 'TYPE_MISMATCH'
  | 'INDEX_OUT_OF_BOUNDS'
  | 'TARGET_NOT_FOUND'
  | 'DUPLICATE_PATH'
  | 'OVERLAPPING_PATH'
  | 'ARRAY_OPERATION_NOT_ALLOWED'
  | 'VALUE_INVALID'
  | 'CONSTRAINT_VIOLATION';

export type StateContainerOperationErrorReason =
  | 'definition_invalid'
  | 'operation_input_invalid'
  | 'path_invalid'
  | 'type_mismatch'
  | 'index_out_of_bounds'
  | 'target_not_found'
  | 'duplicate_path'
  | 'overlapping_path'
  | 'array_operation_not_allowed'
  | 'value_invalid'
  | 'constraint_violation';

export class StateContainerOperationError extends Error {
  constructor(
    message: string,
    public readonly code: StateContainerOperationErrorCode,
    public readonly path: readonly StatePathSegment[],
    public readonly operation: string,
    public readonly reason: StateContainerOperationErrorReason,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StateContainerOperationError';
  }
}

export interface StateContainerConstructorInput<TFields extends FieldDefinitions> {
  definition: StateDefinition<TFields>;
  state?: DefaultsFromFields<TFields> & Record<string, unknown>;
}

interface ResolvedTarget {
  parent: Record<string, unknown> | unknown[];
  key: StatePathSegment;
  value: unknown;
}

type CandidateMutator = (candidate: Record<string, unknown>) => void;

export class StateContainer<TFields extends FieldDefinitions = FieldDefinitions> {
  private definition: StateDefinition<TFields>;
  private state: DefaultsFromFields<TFields> & Record<string, unknown>;

  constructor({ definition, state }: StateContainerConstructorInput<TFields>) {
    assertValidatedDefinition(definition, 'constructor');
    const initialState = cloneState((state ?? definition.defaults) as DefaultsFromFields<TFields> & Record<string, unknown>);
    this.definition = definition;
    this.state = validateState(definition, initialState) as DefaultsFromFields<TFields> & Record<string, unknown>;
  }

  read_path({ path }: StatePathInput): unknown {
    const normalizedPath = normalizePath(path, 'read_path');
    const value = resolveValue(this.state, normalizedPath, 'read_path');
    return cloneAndFreeze(value);
  }

  set_path(input: StatePathValueInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.applyPathOperation(
      'set_path',
      input.path,
      (candidate, normalizedPath) => {
        const target = resolveTarget(candidate, normalizedPath, 'set_path');
        assignTarget(target, input.value);
      },
      options,
    );
  }

  set_paths(inputs: readonly StatePathValueInput[], options: StateContainerOptions = {}): StateContainerValidationResult | void {
    try {
      const normalizedInputs = normalizeSetPathInputs(inputs);
      const candidate = cloneState(this.state);
      for (const input of normalizedInputs) {
        const target = resolveTarget(candidate, input.path, 'set_paths');
        assignTarget(target, input.value);
      }

      const validatedCandidate = validateState(this.definition, candidate) as DefaultsFromFields<TFields> &
        Record<string, unknown>;

      if (options.validateOnly === true) {
        return { valid: true };
      }

      this.state = cloneState(validatedCandidate);
      return undefined;
    } catch (error) {
      return this.handleOperationError(error, 'set_paths', [], options);
    }
  }

  append_path(input: StatePathValueInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.applyPathOperation(
      'append_path',
      input.path,
      (candidate, normalizedPath) => {
        const target = resolveValue(candidate, normalizedPath, 'append_path');
        if (!Array.isArray(target)) {
          throw createContainerError(
            'append_path',
            normalizedPath,
            'TYPE_MISMATCH',
            'type_mismatch',
            `append_path target at ${formatPath(normalizedPath)} must be an array, received ${describeValue(target)}`,
          );
        }
        target.push(input.value);
      },
      options,
    );
  }

  remove_path(input: StatePathInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.applyPathOperation(
      'remove_path',
      input.path,
      (candidate, normalizedPath) => {
        const target = resolveTarget(candidate, normalizedPath, 'remove_path');
        if (Array.isArray(target.parent)) {
          target.parent.splice(target.key as number, 1);
          return;
        }
        delete target.parent[target.key as string];
      },
      options,
    );
  }

  pop_path(input: StatePathInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.applyPathOperation(
      'pop_path',
      input.path,
      (candidate, normalizedPath) => {
        const target = resolveArrayValue(candidate, normalizedPath, 'pop_path');
        assertArrayHasItems(target, normalizedPath, 'pop_path');
        target.pop();
      },
      options,
    );
  }

  shift_path(input: StatePathInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.applyPathOperation(
      'shift_path',
      input.path,
      (candidate, normalizedPath) => {
        const target = resolveArrayValue(candidate, normalizedPath, 'shift_path');
        assertArrayHasItems(target, normalizedPath, 'shift_path');
        target.shift();
      },
      options,
    );
  }

  snapshot(): DefaultsFromFields<TFields> & Record<string, unknown> {
    return cloneAndFreeze(this.state) as DefaultsFromFields<TFields> & Record<string, unknown>;
  }

  clone(): StateContainer<TFields> {
    const cloned = Object.create(StateContainer.prototype) as StateContainer<TFields>;
    cloned.definition = this.definition;
    cloned.state = cloneState(this.state);
    return cloned;
  }

  private applyPathOperation(
    operation: string,
    path: unknown,
    mutateCandidate: (candidate: Record<string, unknown>, normalizedPath: StatePath) => void,
    options: StateContainerOptions,
  ): StateContainerValidationResult | void {
    let normalizedPath: StatePath = [];

    try {
      normalizedPath = normalizePath(path, operation);
    } catch (error) {
      return this.handleOperationError(error, operation, normalizedPath, options);
    }

    return this.applyOperation(
      operation,
      normalizedPath,
      (candidate) => mutateCandidate(candidate, normalizedPath),
      options,
    );
  }

  private applyOperation(
    operation: string,
    path: StatePath,
    mutateCandidate: CandidateMutator,
    options: StateContainerOptions,
  ): StateContainerValidationResult | void {
    try {
      const candidate = cloneState(this.state);
      mutateCandidate(candidate);
      const validatedCandidate = validateState(this.definition, candidate) as DefaultsFromFields<TFields> &
        Record<string, unknown>;

      if (options.validateOnly === true) {
        return { valid: true };
      }

      this.state = cloneState(validatedCandidate);
      return undefined;
    } catch (error) {
      return this.handleOperationError(error, operation, path, options);
    }
  }

  private handleOperationError(
    error: unknown,
    operation: string,
    path: StatePath,
    options: StateContainerOptions,
  ): StateContainerValidationResult | never {
    const containerError = normalizeOperationError(error, operation, path);
    if (options.validateOnly === true) {
      return { valid: false, error: containerError };
    }
    throw containerError;
  }
}

function assertValidatedDefinition<TFields extends FieldDefinitions>(
  definition: StateDefinition<TFields>,
  operation: string,
): void {
  if (isValidatedStateDefinition(definition)) {
    return;
  }

  throw createContainerError(
    operation,
    [],
    'INVALID_DEFINITION',
    'definition_invalid',
    'definition must be a validated StateDefinition created by defineState()',
  );
}

function normalizeSetPathInputs(inputs: readonly StatePathValueInput[]): readonly StatePathValueInput[] {
  if (!Array.isArray(inputs)) {
    throw createContainerError(
      'set_paths',
      [],
      'INVALID_OPERATION_INPUT',
      'operation_input_invalid',
      'set_paths input must be an array of { path, value } objects',
    );
  }

  const normalizedInputs = inputs.map((input, index) => {
    if (!isPlainObject(input)) {
      throw createContainerError(
        'set_paths',
        [],
        'INVALID_OPERATION_INPUT',
        'operation_input_invalid',
        `set_paths input at index ${index} must be a plain object`,
      );
    }

    return {
      path: normalizePath(input.path, 'set_paths'),
      value: input.value,
    };
  });

  assertNoDuplicateOrOverlappingPaths(normalizedInputs.map((input) => input.path));

  return [...normalizedInputs].sort((left, right) => comparePaths(left.path, right.path));
}

function assertNoDuplicateOrOverlappingPaths(paths: readonly StatePath[]): void {
  const sortedPaths = [...paths].sort(comparePaths);

  for (let index = 1; index < sortedPaths.length; index += 1) {
    const previous = sortedPaths[index - 1];
    const current = sortedPaths[index];

    if (areSamePath(previous, current)) {
      throw createContainerError(
        'set_paths',
        current,
        'DUPLICATE_PATH',
        'duplicate_path',
        `set_paths contains duplicate path ${formatPath(current)}`,
      );
    }

    if (isPathPrefix(previous, current)) {
      throw createContainerError(
        'set_paths',
        current,
        'OVERLAPPING_PATH',
        'overlapping_path',
        `set_paths contains overlapping paths ${formatPath(previous)} and ${formatPath(current)}`,
      );
    }
  }
}

function normalizePath(path: unknown, operation: string): StatePath {
  if (!Array.isArray(path)) {
    throw createContainerError(
      operation,
      [],
      'INVALID_PATH',
      'path_invalid',
      `${operation} requires path to be an array`,
    );
  }

  if (path.length === 0) {
    throw createContainerError(operation, [], 'INVALID_PATH', 'path_invalid', `${operation} path must not be empty`);
  }

  return path.map((segment, index) => {
    if (typeof segment === 'string') {
      if (segment.length === 0) {
        throw createContainerError(
          operation,
          path.slice(0, index + 1),
          'INVALID_PATH',
          'path_invalid',
          `${operation} path segment at index ${index} must not be an empty string`,
        );
      }
      return segment;
    }

    if (typeof segment === 'number' && Number.isFinite(segment) && Number.isInteger(segment) && segment >= 0) {
      return segment;
    }

    throw createContainerError(
      operation,
      path.slice(0, index + 1),
      'INVALID_PATH',
      'path_invalid',
      `${operation} path segment at index ${index} must be a string key or non-negative integer index`,
    );
  });
}

function resolveValue(root: Record<string, unknown>, path: StatePath, operation: string): unknown {
  let current: unknown = root;

  for (let index = 0; index < path.length; index += 1) {
    current = resolveChild(current, path[index], path.slice(0, index + 1), operation);
  }

  return current;
}

function resolveTarget(root: Record<string, unknown>, path: StatePath, operation: string): ResolvedTarget {
  if (path.length === 0) {
    throw createContainerError(operation, [], 'INVALID_PATH', 'path_invalid', `${operation} path must not be empty`);
  }

  let parent: unknown = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    parent = resolveChild(parent, path[index], path.slice(0, index + 1), operation);
  }

  const key = path[path.length - 1];
  const targetPath = path.slice();
  const value = resolveChild(parent, key, targetPath, operation);

  if (Array.isArray(parent)) {
    return { parent, key, value };
  }

  if (isPlainObject(parent)) {
    return { parent, key, value };
  }

  throw createContainerError(
    operation,
    path.slice(0, -1),
    'TYPE_MISMATCH',
    'type_mismatch',
    `${operation} cannot traverse into ${describeValue(parent)} at ${formatPath(path.slice(0, -1))}`,
  );
}

function resolveChild(parent: unknown, segment: StatePathSegment, path: StatePath, operation: string): unknown {
  if (Array.isArray(parent)) {
    if (typeof segment !== 'number') {
      throw createContainerError(
        operation,
        path,
        'TYPE_MISMATCH',
        'type_mismatch',
        `${operation} path ${formatPath(path)} uses an object key against an array`,
      );
    }

    if (segment >= parent.length) {
      throw createContainerError(
        operation,
        path,
        'INDEX_OUT_OF_BOUNDS',
        'index_out_of_bounds',
        `${operation} index ${segment} at ${formatPath(path)} is out of bounds for array length ${parent.length}`,
      );
    }

    return parent[segment];
  }

  if (isPlainObject(parent)) {
    if (typeof segment !== 'string') {
      throw createContainerError(
        operation,
        path,
        'TYPE_MISMATCH',
        'type_mismatch',
        `${operation} path ${formatPath(path)} uses an array index against an object`,
      );
    }

    if (!(segment in parent)) {
      throw createContainerError(
        operation,
        path,
        'TARGET_NOT_FOUND',
        'target_not_found',
        `${operation} target ${formatPath(path)} does not exist`,
      );
    }

    return parent[segment];
  }

  throw createContainerError(
    operation,
    path,
    'TYPE_MISMATCH',
    'type_mismatch',
    `${operation} cannot traverse into ${describeValue(parent)} at ${formatPath(path)}`,
  );
}

function resolveArrayValue(root: Record<string, unknown>, path: StatePath, operation: string): unknown[] {
  const target = resolveValue(root, path, operation);

  if (Array.isArray(target)) {
    return target;
  }

  throw createContainerError(
    operation,
    path,
    'TYPE_MISMATCH',
    'type_mismatch',
    `${operation} target at ${formatPath(path)} must be an array, received ${describeValue(target)}`,
  );
}

function assignTarget(target: ResolvedTarget, value: unknown): void {
  if (Array.isArray(target.parent)) {
    target.parent[target.key as number] = value;
    return;
  }

  target.parent[target.key as string] = value;
}

function assertArrayHasItems(value: readonly unknown[], path: StatePath, operation: string): void {
  if (value.length > 0) {
    return;
  }

  throw createContainerError(
    operation,
    path,
    'ARRAY_OPERATION_NOT_ALLOWED',
    'array_operation_not_allowed',
    `${operation} cannot operate on an empty array at ${formatPath(path)}`,
  );
}

function normalizeOperationError(error: unknown, operation: string, path: StatePath): StateContainerOperationError {
  if (error instanceof StateContainerOperationError) {
    return error;
  }

  if (error instanceof StateChangeValidationError) {
    const reason = error.code === 'STATE_CONSTRAINT_VIOLATION' ? 'constraint_violation' : 'value_invalid';
    const code = reason === 'constraint_violation' ? 'CONSTRAINT_VIOLATION' : 'VALUE_INVALID';
    return createContainerError(operation, path, code, reason, `${operation} failed validation: ${error.message}`, error);
  }

  const message = error instanceof Error ? error.message : describeValue(error);
  return createContainerError(
    operation,
    path,
    'VALUE_INVALID',
    'value_invalid',
    `${operation} failed validation: ${message}`,
    error,
  );
}

function createContainerError(
  operation: string,
  path: StatePath,
  code: StateContainerOperationErrorCode,
  reason: StateContainerOperationErrorReason,
  message: string,
  cause?: unknown,
): StateContainerOperationError {
  return new StateContainerOperationError(message, code, [...path], operation, reason, cause);
}

function areSamePath(left: StatePath, right: StatePath): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function isPathPrefix(prefix: StatePath, path: StatePath): boolean {
  return prefix.length < path.length && prefix.every((segment, index) => segment === path[index]);
}

function comparePaths(left: StatePath, right: StatePath): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];

    if (leftSegment === rightSegment) {
      continue;
    }

    if (typeof leftSegment === typeof rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }

    return typeof leftSegment === 'number' ? -1 : 1;
  }

  return left.length - right.length;
}

function formatPath(path: StatePath): string {
  if (path.length === 0) {
    return '<root>';
  }

  return path
    .map((segment) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }
      return `.${segment}`;
    })
    .join('')
    .replace(/^\./, '');
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(cloneState(value));
}

function cloneState<T>(value: T): T {
  return structuredClone(value);
}
