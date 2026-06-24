import type { TenantProcessPlanningStreamStateProvider } from '../../application/planners/TenantProcessPlanningPipeline.js';
import {
  StreamStateModule,
  type StreamStatePlanningContract,
} from '../../modules/StreamState/index.js';

export class StreamStatePlanningProvider implements TenantProcessPlanningStreamStateProvider {
  public constructor(private readonly streamState: StreamStateModule) {}

  public load(input: {
    readonly streamKey: string;
  }): Promise<StreamStatePlanningContract> {
    return this.streamState.createPlanningContract(input.streamKey);
  }
}
