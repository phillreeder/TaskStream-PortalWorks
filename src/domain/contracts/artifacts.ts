export type ArtifactData = string | ArrayBuffer | ArrayBufferView;

export interface ArtifactInput {
  readonly runId: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly data: ArtifactData;
  readonly metadata?: Record<string, unknown>;
}

export interface ArtifactRecord extends Omit<ArtifactInput, 'data'> {
  readonly id: string;
  readonly storedAt: string;
  readonly size: number;
  readonly data: string;
}

export interface ArtifactReference {
  readonly runId: string;
  readonly id: string;
}

export interface ArtifactService {
  save(input: ArtifactInput): Promise<ArtifactRecord>;
  get(reference: ArtifactReference): Promise<ArtifactRecord | undefined>;
  list(runId: string): Promise<readonly ArtifactRecord[]>;
}
