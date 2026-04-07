import type {
  StateChange,
  StateDefinition,
  StateInvariant,
  StatePropertyDefinition,
  StateSchema,
  StateValidationIssue,
  StateValidationResult,
  ValidationPhase,
} from '../../entities/execution.ts';

export interface ValidateStateOptions {
  readonly previousState?: Record<string, unknown>;
  readonly phase?: ValidationPhase;
  readonly changes?: readonly StateChange[];
  readonly stoKey?: string;
}

const ROOT_PATH = '<state>';

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (isObject(a) && isObject(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

const readPath = (state: Record<string, unknown> | undefined, path: string): unknown => {
  if (!state) {
    return undefined;
  }
  const segments = path.split('.').filter(Boolean);
  let current: unknown = state;
  for (const segment of segments) {
    if (!isObject(current) && !Array.isArray(current)) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
};

const pushIssue = (
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
  severity: 'error' | 'warning',
  code: string,
  path: string,
  message: string,
) => {
  issues.push({ code, path, message, severity });
  if (severity === 'error') {
    errors.push(message);
  } else {
    warnings.push(message);
  }
};

const requireDependencies = (
  definition: StatePropertyDefinition,
  value: unknown,
  rootState: Record<string, unknown>,
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
  path: string,
) => {
  if (!definition.dependsOn || value === undefined) {
    return;
  }
  for (const dependency of definition.dependsOn) {
    const dependencyValue = readPath(rootState, dependency);
    if (dependencyValue === undefined || dependencyValue === null) {
      pushIssue(
        issues,
        errors,
        warnings,
        'error',
        'constraint.depends_on',
        path,
        `${path} requires ${dependency} to be present`,
      );
    }
  }
};

const enforceTagConstraints = (
  definition: StatePropertyDefinition,
  value: unknown,
  path: string,
  previousState: Record<string, unknown> | undefined,
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
) => {
  if (!definition.tags || !previousState) {
    return;
  }
  const previousValue = readPath(previousState, path);
  for (const tag of definition.tags) {
    switch (tag) {
      case 'immutable': {
        if (previousValue !== undefined && !isEqual(previousValue, value)) {
          pushIssue(
            issues,
            errors,
            warnings,
            'error',
            'constraint.tag.immutable',
            path,
            `${path} is immutable once set`,
          );
        }
        break;
      }
      case 'irreversible': {
        if (previousValue === true && value === false) {
          pushIssue(
            issues,
            errors,
            warnings,
            'error',
            'constraint.tag.irreversible',
            path,
            `${path} cannot transition from true to false`,
          );
        }
        break;
      }
      case 'monotonic': {
        if (typeof previousValue === 'number' && typeof value === 'number' && value < previousValue) {
          pushIssue(
            issues,
            errors,
            warnings,
            'error',
            'constraint.tag.monotonic',
            path,
            `${path} cannot decrease (monotonic)`,
          );
        }
        break;
      }
      default:
        pushIssue(
          issues,
          errors,
          warnings,
          'warning',
          'constraint.tag.unknown',
          path,
          `${path} declares unknown tag ${tag}`,
        );
        break;
    }
  }
};

const validateArrayItems = (
  itemsDef: StatePropertyDefinition | undefined,
  value: unknown[],
  rootState: Record<string, unknown>,
  previousState: Record<string, unknown> | undefined,
  phase: ValidationPhase,
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
  basePath: string,
) => {
  if (!itemsDef) {
    return;
  }
  value.forEach((itemValue, index) => {
    validateNode(
      itemsDef,
      itemValue,
      `${basePath}[${index}]`,
      rootState,
      previousState,
      phase,
      issues,
      errors,
      warnings,
    );
  });
};

const validateObjectNode = (
  definition: Pick<StatePropertyDefinition, 'properties' | 'allowAdditionalProperties'> | StateSchema,
  value: Record<string, unknown>,
  rootState: Record<string, unknown>,
  previousState: Record<string, unknown> | undefined,
  phase: ValidationPhase,
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
  basePath: string,
) => {
  const properties = definition.properties ?? {};
  for (const [key, propDef] of Object.entries(properties)) {
    const childPath = basePath ? `${basePath}.${key}` : key;
    validateNode(propDef, value[key], childPath, rootState, previousState, phase, issues, errors, warnings);
  }
  if (definition.allowAdditionalProperties) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (!properties[key]) {
      const unknownPath = basePath ? `${basePath}.${key}` : key;
      pushIssue(
        issues,
        errors,
        warnings,
        'error',
        'schema.unknown_property',
        unknownPath,
        `${unknownPath} is not defined in StateDefinition`,
      );
    }
  }
};

const validateNode = (
  definition: StatePropertyDefinition,
  value: unknown,
  path: string,
  rootState: Record<string, unknown>,
  previousState: Record<string, unknown> | undefined,
  phase: ValidationPhase,
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
) => {
  if (value === undefined) {
    if (definition.required) {
      pushIssue(issues, errors, warnings, 'error', 'schema.required', path, `${path} is required`);
    }
    return;
  }

  if (value === null) {
    if (!definition.nullable) {
      pushIssue(issues, errors, warnings, 'error', 'schema.null', path, `${path} cannot be null`);
    }
    return;
  }

  requireDependencies(definition, value, rootState, issues, errors, warnings, path);
  enforceTagConstraints(definition, value, path, previousState, issues, errors, warnings);

  switch (definition.type) {
    case 'string': {
      if (typeof value !== 'string') {
        pushIssue(issues, errors, warnings, 'error', 'schema.type', path, `${path} must be a string`);
        return;
      }
      break;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        pushIssue(issues, errors, warnings, 'error', 'schema.type', path, `${path} must be a number`);
        return;
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        pushIssue(issues, errors, warnings, 'error', 'schema.type', path, `${path} must be a boolean`);
        return;
      }
      break;
    }
    case 'object': {
      if (!isObject(value)) {
        pushIssue(issues, errors, warnings, 'error', 'schema.type', path, `${path} must be an object`);
        return;
      }
      validateObjectNode(definition, value, rootState, previousState, phase, issues, errors, warnings, path);
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        pushIssue(issues, errors, warnings, 'error', 'schema.type', path, `${path} must be an array`);
        return;
      }
      validateArrayItems(
        definition.items,
        value,
        rootState,
        previousState,
        phase,
        issues,
        errors,
        warnings,
        path,
      );
      break;
    }
    default:
      pushIssue(
        issues,
        errors,
        warnings,
        'warning',
        'schema.unknown_type',
        path,
        `${path} uses unknown type ${definition.type as string}`,
      );
      break;
  }

  if (definition.enum && !definition.enum.includes(value as never)) {
    pushIssue(
      issues,
      errors,
      warnings,
      'error',
      'schema.enum',
      path,
      `${path} must be one of: ${definition.enum.join(', ')}`,
    );
  }
};

const runInvariants = (
  invariants: readonly StateInvariant[] | undefined,
  context: {
    state: Record<string, unknown>;
    previousState?: Record<string, unknown>;
    changes?: readonly StateChange[];
    stoKey?: string;
    phase: ValidationPhase;
  },
  issues: StateValidationIssue[],
  errors: string[],
  warnings: string[],
) => {
  if (!invariants) {
    return;
  }
  for (const invariant of invariants) {
    if (invariant.phases && !invariant.phases.includes(context.phase)) {
      continue;
    }
    const result = invariant.validate(context);
    if (result.valid) {
      continue;
    }
    const severity = result.severity ?? 'error';
    const code = result.code ?? `invariant.${invariant.id}`;
    const path = result.path ?? ROOT_PATH;
    const message = result.message ?? `Invariant ${invariant.id} rejected the state`;
    pushIssue(issues, errors, warnings, severity, code, path, message);
  }
};

export function validateState(
  state: Record<string, unknown>,
  definition: StateDefinition,
  options: ValidateStateOptions = {},
): StateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: StateValidationIssue[] = [];

  const phase: ValidationPhase = options.phase ?? 'pre';
  if (!isObject(state)) {
    pushIssue(issues, errors, warnings, 'error', 'schema.type', ROOT_PATH, 'State must be an object');
    return { valid: false, errors, warnings, issues, changes: options.changes };
  }

  validateObjectNode(
    definition.schema,
    state,
    state,
    options.previousState,
    phase,
    issues,
    errors,
    warnings,
    '',
  );

  runInvariants(
    definition.invariants,
    {
      state,
      previousState: options.previousState,
      changes: options.changes,
      stoKey: options.stoKey,
      phase,
    },
    issues,
    errors,
    warnings,
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
    changes: options.changes,
  };
}
