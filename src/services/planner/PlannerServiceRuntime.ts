import type { PlannerService } from './PlannerService.js';

export interface PlannerServiceRuntimeOptions {
  readonly service: PlannerService;
  readonly processRef?: NodeJS.Process;
  readonly onStarted?: () => void;
  readonly onStopped?: () => void;
  readonly onError?: (error: unknown) => void;
}

export class PlannerServiceRuntime {
  private readonly processRef: NodeJS.Process;
  private started = false;
  private stopping: Promise<void> | null = null;

  constructor(private readonly options: PlannerServiceRuntimeOptions) {
    this.processRef = options.processRef ?? process;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.processRef.once('SIGINT', this.handleSignal);
    this.processRef.once('SIGTERM', this.handleSignal);
    this.options.service.start();
    this.options.onStarted?.();
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopInternal();
    return this.stopping;
  }

  private readonly handleSignal = (): void => {
    void this.stop().catch((error) => {
      this.options.onError?.(error);
      this.processRef.exitCode = 1;
    });
  };

  private async stopInternal(): Promise<void> {
    if (!this.started) return;
    this.processRef.removeListener('SIGINT', this.handleSignal);
    this.processRef.removeListener('SIGTERM', this.handleSignal);
    await this.options.service.stop();
    this.started = false;
    this.options.onStopped?.();
  }
}
