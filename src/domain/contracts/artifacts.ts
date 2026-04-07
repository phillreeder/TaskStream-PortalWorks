export type ArtifactKind = 'log' | 'screenshot' | 'dataset' | 'attachment';

export interface ArtifactInput {
  runId: string;
  stepId?: string;
  label: string;
  kind: ArtifactKind;
  contentType: string;
  data: string | Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface ArtifactRecord extends ArtifactInput {
  id: string;
  storedAt: string;
  size: number;
}

export interface ArtifactReference {
  id: string;
  runId: string;
}

export interface ArtifactService {
  save(input: ArtifactInput): Promise<ArtifactRecord>;
  get(reference: ArtifactReference): Promise<ArtifactRecord | undefined>;
  list(runId: string): Promise<ArtifactRecord[]>;
}
