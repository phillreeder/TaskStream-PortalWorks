import type {
  ArtifactService,
  Automation,
  CredentialProvider,
  DatasetProvider,
  Logger,
  StateWriter,
} from './index.ts';

export interface ExecutionContext {
  readonly automation: Automation;
  readonly dataset: DatasetProvider;
  readonly credentials: CredentialProvider;
  readonly artifacts: ArtifactService;
  readonly logger: Logger;
  readonly stateWriter: StateWriter;
}
