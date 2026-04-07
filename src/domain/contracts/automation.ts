/**
 * Locator format used by automation flows. String values are treated as CSS selectors by default.
 */
export type AutomationLocator =
  | string
  | { strategy: 'css' | 'text' | 'role' | 'xpath'; value: string };

export interface AutomationNavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface AutomationInteractionOptions {
  timeoutMs?: number;
  trials?: number;
}

export interface AutomationInputOptions extends AutomationInteractionOptions {
  replace?: boolean;
  delayMs?: number;
}

export interface AutomationEvaluateOptions {
  exposeAutomationContext?: boolean;
}

export interface AutomationSnapshot {
  tag?: string;
  timestamp: string;
  html?: string;
  screenshotPath?: string;
  metadata?: Record<string, unknown>;
}

export interface AutomationStepRecord {
  readonly action: string;
  readonly target?: AutomationLocator;
  readonly payload?: unknown;
  readonly completedAt: string;
}

export interface Automation {
  readonly sessionId: string;
  open(url: string, options?: AutomationNavigationOptions): Promise<void>;
  click(target: AutomationLocator, options?: AutomationInteractionOptions): Promise<void>;
  type(target: AutomationLocator, value: string, options?: AutomationInputOptions): Promise<void>;
  waitFor(target: AutomationLocator, options?: AutomationInteractionOptions): Promise<boolean>;
  evaluate<TResult>(expression: string, options?: AutomationEvaluateOptions): Promise<TResult>;
  snapshot(tag?: string): Promise<AutomationSnapshot>;
  history(): readonly AutomationStepRecord[];
  close(): Promise<void>;
}
