import type { Constraint, FieldDefinition } from './types/index.js';
import { failValidation } from './errors.js';
import { validateAllowedKeys } from './validateAllowedKeys.js';
import { describeValue } from './utils.js';

const knownKinds = new Set<Constraint['kind']>([
  'min_value',
  'max_value',
  'matches_regex',
  'required_if',
  'time_to_live',
]);

const shorthandSuggestions: Record<string, Constraint['kind']> = {
  min: 'min_value',
  max: 'max_value',
  regex: 'matches_regex',
  requiredIf: 'required_if',
  ttl: 'time_to_live',
};

export function validateConstraintDefinition(path: string, constraint: unknown, field: FieldDefinition): void {
  validateAllowedKeys(constraint, ['kind', 'phase', 'payload'], path);

  const { kind, phase, payload } = constraint;

  if (typeof kind !== 'string') {
    failValidation(`${path}.kind must be a supported constraint kind`);
  }

  if (kind in shorthandSuggestions) {
    failValidation(
      `${path}.kind "${kind}" is shorthand and not allowed; use "${shorthandSuggestions[kind]}" instead`,
    );
  }

  if (!knownKinds.has(kind as Constraint['kind'])) {
    failValidation(`${path}.kind must be a supported constraint kind`);
  }

  if (phase !== 'change' && phase !== 'state') {
    failValidation(`${path}.phase must be "change" or "state"`);
  }

  switch (kind) {
    case 'min_value':
    case 'max_value':
      assertNumberConstraint(path, payload, phase, field);
      return;
    case 'matches_regex':
      assertRegexConstraint(path, payload, phase, field);
      return;
    case 'required_if':
      assertRequiredIfConstraint(path, payload, phase);
      return;
    case 'time_to_live':
      assertTtlConstraint(path, payload, phase);
      return;
    default:
      failValidation(`${path}.kind must be a supported constraint kind`);
  }
}

function assertNumberConstraint(path: string, payload: unknown, phase: unknown, field: FieldDefinition): void {
  if (field.type !== 'number') {
    failValidation(`${path}.kind is not compatible with field type "${field.type}"`);
  }
  if (phase !== 'change') {
    failValidation(`${path}.phase must be "change" for numeric constraints`);
  }
  validateAllowedKeys(payload, ['value'], `${path}.payload`);
  if (typeof payload.value !== 'number' || !Number.isFinite(payload.value)) {
    failValidation(`${path}.payload.value must be a finite number`);
  }
}

function assertRegexConstraint(path: string, payload: unknown, phase: unknown, field: FieldDefinition): void {
  if (field.type !== 'string') {
    failValidation(`${path}.kind is not compatible with field type "${field.type}"`);
  }
  if (phase !== 'change') {
    failValidation(`${path}.phase must be "change" for regex constraints`);
  }
  validateAllowedKeys(payload, ['pattern'], `${path}.payload`);
  if (!(payload.pattern instanceof RegExp)) {
    failValidation(`${path}.payload.pattern must be a RegExp, received ${describeValue(payload.pattern)}`);
  }
}

function assertRequiredIfConstraint(path: string, payload: unknown, phase: unknown): void {
  if (phase !== 'state') {
    failValidation(`${path}.phase must be "state" for requiredIf constraints`);
  }
  validateAllowedKeys(payload, ['predicate'], `${path}.payload`);
  if (typeof payload.predicate !== 'function') {
    failValidation(`${path}.payload.predicate must be a function`);
  }
}

function assertTtlConstraint(path: string, payload: unknown, phase: unknown): void {
  if (phase !== 'state') {
    failValidation(`${path}.phase must be "state" for ttl constraints`);
  }
  validateAllowedKeys(payload, ['ms', 'fromField'], `${path}.payload`);
  if (typeof payload.ms !== 'number' || !Number.isFinite(payload.ms) || payload.ms < 0) {
    failValidation(`${path}.payload.ms must be a non-negative finite number`);
  }
  if (payload.fromField !== undefined && typeof payload.fromField !== 'string') {
    failValidation(`${path}.payload.fromField must be a string when provided`);
  }
}
