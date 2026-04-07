import type { StateChangeBatch } from '../../domain/contracts/stateWriter.ts';
import type { ExecutionSnapshot, StateValidationResult } from '../../domain/entities/execution.ts';
import { StoResultVerificationError } from './errors.js';

export interface StoResultVerifierOptions {
  allowNoChanges?: boolean;
}

export interface StoVerificationInput {
  readonly snapshot: ExecutionSnapshot;
  readonly changes: StateChangeBatch;
}

export class STOResultVerifier {
  private readonly allowNoChanges: boolean;

  constructor(options: StoResultVerifierOptions = {}) {
    this.allowNoChanges = options.allowNoChanges ?? false;
  }

  async verify({ snapshot, changes }: StoVerificationInput): Promise<StateValidationResult> {
    if (!this.allowNoChanges && changes.changes.length === 0) {
      throw new StoResultVerificationError('Execution produced no state changes');
    }

    const result = await snapshot.tenantProcess.stateDefinition.evaluate({
      streamState: snapshot.streamState,
      changes,
      sto: snapshot.sto,
      tenantProcess: snapshot.tenantProcess,
    });

    if (!result.valid) {
      throw new StoResultVerificationError('State definition rejected execution result', result.errors ?? []);
    }

    return result;
  }
}
