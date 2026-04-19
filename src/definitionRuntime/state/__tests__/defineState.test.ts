import { describe, expect, it } from 'vitest';
import {
  StateDefinitionValidationError,
  defineState,
  isValidatedStateDefinition,
} from '../index.js';

describe('defineState', () => {
  it('returns a stamped and frozen validated definition', () => {
    const definition = defineState<{
      title: string;
      priority: number;
      enabled: boolean;
      status: 'pending' | 'ready';
      tags: { id: string; value: string }[];
    }>()({
      id: 'taskstream.test.definition',
      version: 1,
      strict: true,
      defaults: {
        title: 'draft',
        priority: 3,
        enabled: false,
        status: 'pending',
        tags: [{ id: 'initial', value: 'initial' }],
      },
      fields: {
        title: {
          type: 'string',
          constraints: [{ kind: 'matches_regex', phase: 'change', payload: { pattern: /^[a-z]+$/ } }],
        },
        priority: {
          type: 'number',
          constraints: [{ kind: 'min_value', phase: 'change', payload: { value: 0 } }],
        },
        enabled: {
          type: 'boolean',
        },
        status: {
          type: 'enum',
          values: ['pending', 'ready'] as const,
        },
        tags: {
          type: 'array',
          items: {
            type: 'object_inline',
            fields: {
              id: {
                type: 'string',
              },
              value: {
                type: 'string',
              },
            },
          },
        },
      },
    });

    expect(definition.id).toBe('taskstream.test.definition');
    expect(isValidatedStateDefinition(definition)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.fields)).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      defineState<{
        status: 'pending' | 'ready';
      }>()({
        id: 'taskstream.invalid.extra-key',
        version: 1,
        strict: true,
        defaults: { status: 'pending' },
        fields: {
          status: {
            type: 'enum',
            values: ['pending', 'ready'] as const,
          },
        },
        extra: true,
      } as never),
    ).toThrowError(new StateDefinitionValidationError('state definition contains unknown key "extra"'));
  });

  it('rejects unknown field types', () => {
    expect(() =>
      defineState<{
        title: string;
      }>()({
        id: 'taskstream.invalid.field-type',
        version: 1,
        strict: true,
        defaults: { title: 'draft' },
        fields: {
          title: {
            type: 'unknown',
          },
        },
      } as never),
    ).toThrowError(new StateDefinitionValidationError('fields.title.type must be a supported field type'));
  });

  it('rejects enums without values', () => {
    expect(() =>
      defineState<{
        status: string;
      }>()({
        id: 'taskstream.invalid.enum',
        version: 1,
        strict: true,
        defaults: { status: 'pending' },
        fields: {
          status: {
            type: 'enum',
            values: [],
          },
        },
      } as never),
    ).toThrowError(new StateDefinitionValidationError('fields.status.values must be a non-empty array for enum fields'));
  });

  it('rejects invalid constraint phases', () => {
    expect(() =>
      defineState<{
        priority: number;
      }>()({
        id: 'taskstream.invalid.phase',
        version: 1,
        strict: true,
        defaults: { priority: 1 },
        fields: {
          priority: {
            type: 'number',
            constraints: [{ kind: 'min_value', phase: 'pre', payload: { value: 0 } }],
          },
        },
      } as never),
    ).toThrowError(new StateDefinitionValidationError('fields.priority.constraints[0].phase must be "change" or "state"'));
  });

  it('rejects defaults with incorrect types', () => {
    expect(() =>
      defineState<{
        priority: string;
      }>()({
        id: 'taskstream.invalid.defaults.type',
        version: 1,
        strict: true,
        defaults: { priority: 'high' },
        fields: {
          priority: {
            type: 'number',
          },
        },
      } as never),
    ).toThrowError(new StateDefinitionValidationError('defaults.priority must be a finite number, received string'));
  });

  it('rejects defaults with invalid enum values', () => {
    expect(() =>
      defineState<{
        status: string;
      }>()({
        id: 'taskstream.invalid.defaults.enum',
        version: 1,
        strict: true,
        defaults: { status: 'done' },
        fields: {
          status: {
            type: 'enum',
            values: ['pending', 'ready'] as const,
          },
        },
      } as never),
    ).toThrowError(new StateDefinitionValidationError('defaults.status must be one of [pending, ready]'));
  });

  it('rejects incompatible constraints for the field type', () => {
    expect(() =>
      defineState<{
        title: string;
      }>()({
        id: 'taskstream.invalid.constraint.compatibility',
        version: 1,
        strict: true,
        defaults: { title: 'draft' },
        fields: {
          title: {
            type: 'string',
            constraints: [{ kind: 'min_value', phase: 'change', payload: { value: 1 } }],
          },
        },
      } as never),
    ).toThrowError(
      new StateDefinitionValidationError('fields.title.constraints[0].kind is not compatible with field type "string"'),
    );
  });

  it('rejects shorthand constraint kinds with a suggestion', () => {
    expect(() =>
      defineState<{
        title: string;
      }>()({
        id: 'taskstream.invalid.constraint.shorthand',
        version: 1,
        strict: true,
        defaults: { title: 'draft' },
        fields: {
          title: {
            type: 'string',
            constraints: [{ kind: 'regex', phase: 'change', payload: { pattern: /^[a-z]+$/ } }],
          },
        },
      } as never),
    ).toThrowError(
      new StateDefinitionValidationError(
        'fields.title.constraints[0].kind "regex" is shorthand and not allowed; use "matches_regex" instead',
      ),
    );
  });
});
