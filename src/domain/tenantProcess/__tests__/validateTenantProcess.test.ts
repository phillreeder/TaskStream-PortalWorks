import { describe, expect, it } from 'vitest';
import {
  RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS,
  runtimeSpineModelTenantProcess,
} from '../../../tenants/TaskStream/TenantProcesses/runtime-spine-001/index.js';
import { TenantProcessValidationError } from '../errors.js';
import { registerTenantProcess } from '../registerTenantProcess.js';
import { validateTenantProcessDefinition } from '../validateTenantProcess.js';

const cloneModelTenantProcess = (): Record<string, unknown> => ({
  ...runtimeSpineModelTenantProcess,
  tasks: { ...runtimeSpineModelTenantProcess.tasks },
  channels: { ...runtimeSpineModelTenantProcess.channels },
  stos: { ...runtimeSpineModelTenantProcess.stos },
  flows: { ...runtimeSpineModelTenantProcess.flows },
  stateDefinitions: { ...runtimeSpineModelTenantProcess.stateDefinitions },
  validators: { ...runtimeSpineModelTenantProcess.validators },
  mappers: { ...runtimeSpineModelTenantProcess.mappers },
  processChannels: { ...runtimeSpineModelTenantProcess.processChannels },
  unitSelectors: { ...runtimeSpineModelTenantProcess.unitSelectors },
  inputContracts: { ...runtimeSpineModelTenantProcess.inputContracts },
  resultContracts: { ...runtimeSpineModelTenantProcess.resultContracts },
  artifactContracts: { ...runtimeSpineModelTenantProcess.artifactContracts },
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
  it('accepts executable scaffold TenantProcess shape with Task -> default STO -> Flow binding', () => {
    const process = runtimeSpineModelTenantProcess;

    expect(() => validateTenantProcessDefinition(process)).not.toThrow();

    const channelRequest = process.channels[RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel].executable({
      taskRef: RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.task,
      state: {
        read: () => 'pending',
      },
    });

    expect(channelRequest.selectedStoRef).toBe(process.tasks[RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.task].defaultStoRef);
    expect(process.stos[channelRequest.selectedStoRef].flowRef).toBe(RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.flow);
  });

  it('registers a TenantProcess without runtime binding indirection', () => {
    const process = runtimeSpineModelTenantProcess;

    expect(registerTenantProcess({ definition: process })).toEqual({ definition: process });
  });

  it('rejects legacy key/string-version root shape', () => {
    const process = {
      ...cloneModelTenantProcess(),
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
    const process = cloneModelTenantProcess();
    process.channels = {
      [RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel]: {
        channelId: RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel,
        executableRef: 'channel.runtime-spine.select-next-sto.execute',
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      `tenantProcess.channels.${RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel}.executableRef`,
    );
  });

  it('rejects async Channels because Channel selection is synchronous', () => {
    const process = cloneModelTenantProcess();
    process.channels = {
      [RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel]: {
        channelId: RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel,
        executable: async () => ({
          requestId: 'request.runtime-spine.complete-work-item',
          taskRef: RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.task,
          channelRef: RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel,
          selectedStoRef: RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.sto,
        }),
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      `tenantProcess.channels.${RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.channel}.executable`,
    );
  });

  it('rejects Task-level Flow and output contract bindings', () => {
    const process = cloneModelTenantProcess();
    process.tasks = {
      [RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.task]: {
        ...runtimeSpineModelTenantProcess.tasks[RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.task],
        flowRefs: [RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.flow],
        resultContractRefs: [RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.resultContract],
      },
    };

    expectTenantProcessValidationError(
      () => validateTenantProcessDefinition(process),
      `tenantProcess.tasks.${RUNTIME_SPINE_MODEL_TENANT_PROCESS_IDS.task}.flowRefs`,
    );
  });
});
