import type { ExecutionSnapshot, RunRecord } from '../../domain/entities/execution.ts';
import { deepFreeze } from '../../utils/deepFreeze.js';
import type { StreamStateRepository } from '../contracts/StreamStateRepository.ts';
import type { TenantProcessRepository } from '../contracts/TenantProcessRepository.ts';
import { ExecutionDataLoaderError } from './errors.js';

export interface ExecutionDataLoaderDependencies {
  streamStates: StreamStateRepository;
  tenantProcesses: TenantProcessRepository;
}

const freezeSnapshot = <TSnapshot extends ExecutionSnapshot>(snapshot: TSnapshot): TSnapshot => {
  deepFreeze(snapshot);
  return snapshot;
};

export class ExecutionDataLoader {
  constructor(private readonly deps: ExecutionDataLoaderDependencies) {}

  async load(run: RunRecord): Promise<ExecutionSnapshot> {
    const streamState = await this.deps.streamStates.getById(run.streamStateId);
    if (!streamState) {
      throw new ExecutionDataLoaderError(`Stream state ${run.streamStateId} was not found`, 'STREAM_STATE_NOT_FOUND');
    }

    const tenantProcess = await this.deps.tenantProcesses.getById(run.tenantProcessId, run.tenantProcessVersion);
    if (!tenantProcess) {
      throw new ExecutionDataLoaderError(
        `Tenant process ${run.tenantProcessId}@${run.tenantProcessVersion} was not found`,
        'TENANT_PROCESS_NOT_FOUND',
      );
    }
    if (tenantProcess.key !== run.tenantProcessKey) {
      throw new ExecutionDataLoaderError(
        `Run expected tenant process key ${run.tenantProcessKey} but resolved ${tenantProcess.key}`,
        'TENANT_PROCESS_MISMATCH',
      );
    }

    const sto = tenantProcess.stos.get(run.stoKey);
    if (!sto) {
      throw new ExecutionDataLoaderError(`STO ${run.stoKey} not found in tenant process ${tenantProcess.key}`, 'STO_NOT_FOUND');
    }

    const flow = tenantProcess.flows.get(sto.flowKey);
    if (!flow) {
      throw new ExecutionDataLoaderError(
        `Flow ${sto.flowKey} referenced by STO ${sto.key} not found`,
        'FLOW_NOT_FOUND',
      );
    }

    const snapshot: ExecutionSnapshot = {
      run,
      streamState,
      tenantProcess,
      sto,
      flow,
    };

    return freezeSnapshot(snapshot);
  }
}
