import { describe, expect, it } from 'vitest';
import {
  RUNTIME_SPINE_TENANT_PROCESS_IDS,
  runtimeSpineTenantProcess,
} from '../../../../Tenants/TaskStream/TenantProcess/runtime-spine-001/index.js';
import { tenantProcess as iebBetaTest1TenantProcess } from '../../../../Tenants/TaskStream/TenantProcess/Test1/index.js';
import { TenantProcessValidationError } from '../errors.js';
import { registerTenantProcess } from '../registerTenantProcess.js';
import { validateTenantProcessDefinition } from '../validateTenantProcess.js';

const cloneTenantProcess = (): Record<string, unknown> => ({
  ...runtimeSpineTenantProcess,
  tasks: { ...runtimeSpineTenantProcess.tasks },
  channels: { ...runtimeSpineTenantProcess.channels },
  stos: { ...runtimeSpineTenantProcess.stos },
  flows: { ...runtimeSpineTenantProcess.flows },
  stateDefinitions: { ...runtimeSpineTenantProcess.stateDefinitions },
  validators: { ...runtimeSpineTenantProcess.validators },
  mappers: { ...runtimeSpineTenantProcess.mappers },
});

const expectTenantProcessValidationError = (fn: () => void, path: string) => {
  expect(fn).toThrow(TenantProcessValidationError);
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TenantProcessValidationError);
    expect((error as TenantProcessValidationError).path).toBe(path);
  }
};

describe('TenantProcess canonical definition validation', () => {
  it('accepts a TenantProcess that registers its StateDefinition from a dedicated file', () => {
    const process = runtimeSpineTenantProcess;

    expect(() => validateTenantProcessDefinition(process)).not.toThrow();
    expect(process.stateDefinitions[RUNTIME_SPINE_TENANT_PROCESS_IDS.stateDefinition]).toBeDefined();
    expect(process.tasks[RUNTIME_SPINE_TENANT_PROCESS_IDS.task].stateDefinitionRef).toBe(
      RUNTIME_SPINE_TENANT_PROCESS_IDS.stateDefinition,
    );
  });

  it('registers a TenantProcess without runtime binding indirection', () => {
    const process = runtimeSpineTenantProcess;

    expect(registerTenantProcess({ definition: process })).toEqual({ definition: process });
  });

  it('rejects legacy key/string-version root shape', () => {
    const process = {
      ...cloneTenantProcess(),
      key: 'legacy.runtime-spine',
      processId: undefined,
      version: '1.0.0',
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      'tenantProcess.processId',
    );
  });

  it('rejects Channels that use executable refs instead of executable functions', () => {
    const process = cloneTenantProcess();
    process.channels = {
      'channel.review-submission': {
        channelId: 'channel.review-submission',
        executableRef: 'channel.review-submission.execute',
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      'tenantProcess.channels.channel.review-submission.executableRef',
    );
  });

  it('rejects async Channels because Channel selection is synchronous', () => {
    const process = cloneTenantProcess();
    process.channels = {
      'channel.review-submission': {
        channelId: 'channel.review-submission',
        executable: async () => ({
          type: 'sto',
          requestId: 'request.review-submission',
          sto: {
            stoId: 'sto.review-submission',
            taskRef: RUNTIME_SPINE_TENANT_PROCESS_IDS.task,
            flowRef: 'flow.review-submission',
          },
        }),
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      'tenantProcess.channels.channel.review-submission.executable',
    );
  });

  it('rejects Task-level Flow and output contract bindings', () => {
    const process = cloneTenantProcess();
    process.tasks = {
      [RUNTIME_SPINE_TENANT_PROCESS_IDS.task]: {
        ...runtimeSpineTenantProcess.tasks[RUNTIME_SPINE_TENANT_PROCESS_IDS.task],
        flowRefs: ['flow.review-submission'],
        resultContractRefs: ['result.review-submission'],
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      `tenantProcess.tasks.${RUNTIME_SPINE_TENANT_PROCESS_IDS.task}.flowRefs`,
    );
  });
});


describe('TenantProcess embedded StreamState contracts', () => {
  it('accepts STOs that reference Flow executables directly', () => {
    expect(typeof iebBetaTest1TenantProcess.stos.prepareWork.flow).toBe('function');
    expect(() => validateTenantProcessDefinition(iebBetaTest1TenantProcess)).not.toThrow();
  });

  it('requires authority on every composed STO', () => {
    const process = {
      ...iebBetaTest1TenantProcess,
      stos: {
        ...iebBetaTest1TenantProcess.stos,
        prepareWork: {
          ...iebBetaTest1TenantProcess.stos.prepareWork,
          authority: undefined,
        },
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      'tenantProcess.stos.prepareWork.authority',
    );
  });

  it('rejects the obsolete flow executable wrapper', () => {
    const process = {
      ...iebBetaTest1TenantProcess,
      stos: {
        ...iebBetaTest1TenantProcess.stos,
        prepareWork: {
          ...iebBetaTest1TenantProcess.stos.prepareWork,
          flow: {
            executable: iebBetaTest1TenantProcess.stos.prepareWork.flow,
          },
        },
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      'tenantProcess.stos.prepareWork.flow',
    );
  });

  it('rejects malformed StreamState contract fields', () => {
    const process = {
      ...iebBetaTest1TenantProcess,
      inputContracts: {
        invalid: {
          fields: {
            status: {
              type: 'enum',
              values: [],
            },
          },
        },
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      'tenantProcess.inputContracts.invalid.fields.status',
    );
  });
});
