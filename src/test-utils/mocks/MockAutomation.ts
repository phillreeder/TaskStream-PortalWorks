import { randomUUID } from 'node:crypto';
import type {
  Automation,
  AutomationEvaluateOptions,
  AutomationInteractionOptions,
  AutomationInputOptions,
  AutomationLocator,
  AutomationNavigationOptions,
  AutomationSnapshot,
  AutomationStepRecord,
} from '../../domain/contracts/automation.ts';

export type AutomationResultGenerator<TResult = unknown> = () => TResult | Promise<TResult>;

export class MockAutomation implements Automation {
  readonly sessionId: string;
  private readonly steps: AutomationStepRecord[] = [];
  private readonly waitResults = new Map<string, boolean>();
  private readonly evaluateResults = new Map<string, AutomationResultGenerator>();
  private closed = false;

  constructor(sessionId: string = `mock-automation-${randomUUID()}`) {
    this.sessionId = sessionId;
  }

  history(): readonly AutomationStepRecord[] {
    return this.steps;
  }

  setWaitResult(target: AutomationLocator, result: boolean) {
    this.waitResults.set(this.serializeTarget(target), result);
  }

  setEvaluateResult<TResult>(expression: string, generator: AutomationResultGenerator<TResult>) {
    this.evaluateResults.set(expression, generator as AutomationResultGenerator);
  }

  async open(url: string, options?: AutomationNavigationOptions): Promise<void> {
    this.record('open', undefined, { url, options });
  }

  async click(target: AutomationLocator, options?: AutomationInteractionOptions): Promise<void> {
    this.record('click', target, { options });
  }

  async type(target: AutomationLocator, value: string, options?: AutomationInputOptions): Promise<void> {
    this.record('type', target, { value, options });
  }

  async waitFor(target: AutomationLocator, options?: AutomationInteractionOptions): Promise<boolean> {
    this.record('waitFor', target, { options });
    const serialized = this.serializeTarget(target);
    return this.waitResults.get(serialized) ?? true;
  }

  async evaluate<TResult>(expression: string, _options?: AutomationEvaluateOptions): Promise<TResult> {
    this.record('evaluate', undefined, { expression });
    const generator = this.evaluateResults.get(expression);
    if (generator) {
      return generator() as Promise<TResult>;
    }
    return undefined as unknown as TResult;
  }

  async snapshot(tag?: string): Promise<AutomationSnapshot> {
    const timestamp = new Date().toISOString();
    this.record('snapshot', undefined, { tag });
    return {
      tag,
      timestamp,
      html: '<div data-mock="automation"></div>',
      metadata: { sessionId: this.sessionId },
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.record('close');
  }

  private record(action: string, target?: AutomationLocator, payload?: unknown) {
    this.steps.push({
      action,
      target,
      payload,
      completedAt: new Date().toISOString(),
    });
  }

  private serializeTarget(target: AutomationLocator): string {
    if (typeof target === 'string') {
      return target;
    }
    return `${target.strategy}:${target.value}`;
  }
}
