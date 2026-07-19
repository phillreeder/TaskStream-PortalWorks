import type { FlowAccessorResult } from './result.js';

export type FlowWebPageSelectionMode = 'reuse-or-create' | 'create-new' | 'require-existing';
export type FlowWebReleaseDisposition =
  | 'checkpoint-retain'
  | 'retain-without-checkpoint'
  | 'invalidate'
  | 'destroy';

export interface FlowWebResourceRequirement {
  readonly kind: 'browser-stream';
  readonly access?: 'exclusive';
  readonly pagePolicy?: {
    readonly mode: FlowWebPageSelectionMode;
    readonly semanticKey?: string;
  };
  readonly waitPolicy?: {
    readonly mode: 'fail-fast' | 'wait';
    readonly timeoutMs?: number;
  };
  readonly leaseDurationMs?: number;
  readonly releaseDisposition?: FlowWebReleaseDisposition;
}

export interface FlowWebNavigationRecord {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly pageRef: string;
}

export interface FlowWebCaptureInput {
  readonly name: string;
  readonly aroundText?: string;
  readonly structureDepth?: number;
  readonly ancestorDepth?: number;
  readonly descendantDepth?: number;
  readonly maxNodes?: number;
  readonly jpegQuality?: number;
  readonly fullPage?: boolean;
}

export interface FlowWebCaptureRecord {
  readonly captureId: string;
  readonly capturedAt: string;
  readonly pageRef: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly evidenceDirectoryRef: string;
  readonly archiveRef: string;
  readonly screenshotRef: string;
  readonly pageStructureRef: string;
  readonly visibleTextRef: string;
  readonly pageMetadataRef: string;
  readonly manifestRef: string;
  readonly localStructureRef?: string;
}

export interface FlowWebAccessor {
  navigate(input: {
    readonly url: string;
    readonly timeoutMs?: number;
  }): Promise<FlowAccessorResult<FlowWebNavigationRecord>>;

  capture(input: FlowWebCaptureInput): Promise<FlowAccessorResult<FlowWebCaptureRecord>>;
}
