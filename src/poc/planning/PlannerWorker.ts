import type { PlannerQueueItem, TaskStorageGateway } from '../../tenants/IEBBeta/TenantProcesses/Test1/task-storage/index.js';

export type ProcessChannelPlanner = {
  executeProcessChannel(item: PlannerQueueItem): Promise<{ processAction: string }>;
};

export class PlannerWorker {
  public constructor(
    private readonly workerId: string,
    private readonly gateway: TaskStorageGateway,
    private readonly planner: ProcessChannelPlanner,
  ) {}

  public async runOnce(): Promise<PlannerQueueItem | null> {
    const item = await this.gateway.claimNextPlannerQueueItem(this.workerId);
    if (!item) return null;

    try {
      const result = await this.planner.executeProcessChannel(item);
      return await this.gateway.completePlannerQueueItem(item.id, result.processAction);
    } catch (error) {
      await this.gateway.failPlannerQueueItem(
        item.id,
        error instanceof Error ? error.message : 'Unknown planner failure.',
      );
      throw error;
    }
  }
}

export class PocProcessChannelPlanner implements ProcessChannelPlanner {
  public async executeProcessChannel(): Promise<{ processAction: string }> {
    return { processAction: 'process-channel-outcome-pending-flow-decision' };
  }
}
