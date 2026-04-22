import { applyChanges } from './applyChanges.js';
import { StateChangeValidationError } from './errors.js';
import { validateChanges } from './validateChanges.js';
import { validateState } from './validateState.js';
import type {
  FieldChangeFromDefinition,
  FieldDefinitions,
  StateChanges,
  StateDefinition,
} from './types/index.js';
import type { StateChangeValidationErrorCode } from './errors.js';

type MutableStateChanges<TFields extends FieldDefinitions> = {
  [TKey in keyof TFields]?: FieldChangeFromDefinition<TFields[TKey]>;
};

export interface StateSessionValidationErrorSnapshot {
  code: StateChangeValidationErrorCode;
  path: string;
  message: string;
}

export interface StateSessionFullValidationSuccess {
  valid: true;
}

export interface StateSessionFullValidationFailure {
  valid: false;
  errors: StateSessionValidationErrorSnapshot[];
}

export type StateSessionFullValidationResult =
  | StateSessionFullValidationSuccess
  | StateSessionFullValidationFailure;

export interface StateSessionValidationSuccess<TFields extends FieldDefinitions = FieldDefinitions> {
  valid: true;
  changes: StateChanges<TFields>;
}

export interface StateSessionValidationFailure<TFields extends FieldDefinitions = FieldDefinitions> {
  valid: false;
  changes: StateChanges<TFields>;
  error: StateSessionValidationErrorSnapshot;
}

export type StateSessionValidationResult<TFields extends FieldDefinitions = FieldDefinitions> =
  | StateSessionValidationSuccess<TFields>
  | StateSessionValidationFailure<TFields>;

export interface StateSession<TFields extends FieldDefinitions = FieldDefinitions> {
  readonly prevState: Readonly<Record<string, unknown>>;
  set<TKey extends keyof TFields>(key: TKey, value: FieldChangeFromDefinition<TFields[TKey]>): StateSession<TFields>;
  toChanges(): StateChanges<TFields>;
  validationResult(): StateSessionValidationResult<TFields>;
  validate_partial(): () => boolean;
  validate(): StateSessionFullValidationResult;
}

class InMemoryStateSession<TFields extends FieldDefinitions> implements StateSession<TFields> {
  private readonly staged: MutableStateChanges<TFields> = {};

  private lastValidationResult: StateSessionValidationResult<TFields>;

  constructor(
    private readonly definition: StateDefinition<TFields>,
    public readonly prevState: Readonly<Record<string, unknown>>,
  ) {
    this.lastValidationResult = this.runValidation();
  }

  set<TKey extends keyof TFields>(key: TKey, value: FieldChangeFromDefinition<TFields[TKey]>): StateSession<TFields> {
    this.staged[key] = cloneChangeValue(value);
    this.lastValidationResult = this.runValidation();
    return this;
  }

  toChanges(): StateChanges<TFields> {
    const nextChanges: MutableStateChanges<TFields> = {};

    for (const key of Object.keys(this.staged) as Array<keyof TFields>) {
      nextChanges[key] = cloneChangeValue(this.staged[key]);
    }

    return nextChanges;
  }

  validationResult(): StateSessionValidationResult<TFields> {
    return cloneValidationResult(this.lastValidationResult);
  }

  validate_partial(): () => boolean {
    return () => {
      this.lastValidationResult = this.runValidation();
      return this.lastValidationResult.valid;
    };
  }

  validate(): StateSessionFullValidationResult {
    const changes = this.toChanges();

    try {
      const nextState = applyChanges(this.definition, this.prevState, changes);
      validateState(this.definition, nextState);
      return { valid: true };
    } catch (error) {
      return normalizeFullValidationError(error);
    }
  }

  private runValidation(): StateSessionValidationResult<TFields> {
    const changes = this.toChanges();

    try {
      validateChanges(this.definition, this.prevState, changes);
      return {
        valid: true,
        changes,
      };
    } catch (error) {
      if (error instanceof StateChangeValidationError) {
        return {
          valid: false,
          changes,
          error: {
            code: error.code,
            path: error.path,
            message: error.message,
          },
        };
      }

      throw error;
    }
  }
}

export function createStateSession<TFields extends FieldDefinitions>(
  definition: StateDefinition<TFields>,
  prevState: Readonly<Record<string, unknown>>,
): StateSession<TFields> {
  return new InMemoryStateSession(definition, prevState);
}

function cloneValidationResult<TFields extends FieldDefinitions>(
  result: StateSessionValidationResult<TFields>,
): StateSessionValidationResult<TFields> {
  if (result.valid) {
    return {
      valid: true,
      changes: cloneChangeValue(result.changes),
    };
  }

  const failure = result as StateSessionValidationFailure<TFields>;

  return {
    valid: false,
    changes: cloneChangeValue(failure.changes),
    error: { ...failure.error },
  };
}

function cloneChangeValue<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  return structuredClone(value);
}

function normalizeFullValidationError(error: unknown): StateSessionFullValidationFailure {
  if (error instanceof StateChangeValidationError) {
    return {
      valid: false,
      errors: [
        {
          code: error.code,
          path: error.path,
          message: error.message,
        },
      ],
    };
  }

  return {
    valid: false,
    errors: [
      {
        code: 'INVALID_NEXT_STATE',
        path: 'nextState',
        message: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}
