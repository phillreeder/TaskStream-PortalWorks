import type {
  ArtifactService,
  Automation,
  CredentialProvider,
  DatasetProvider,
  ExecutionContext,
  Logger,
  StateWriter,
} from '../../domain/contracts/index.ts';
import { StubAutomation } from '../../infrastructure/automation/StubAutomation.js';
import { FileDatasetProvider, type FileDatasetProviderOptions } from '../../infrastructure/dataset/FileDatasetProvider.js';
import { EnvCredentialProvider, type EnvCredentialProviderOptions } from '../../infrastructure/credentials/EnvCredentialProvider.js';
import { InMemoryArtifactService } from '../../infrastructure/artifacts/InMemoryArtifactService.js';
import { BasicLogger, type BasicLoggerOptions } from '../../infrastructure/logging/BasicLogger.js';
import { BufferedStateWriter } from '../../infrastructure/state/BufferedStateWriter.js';

export type DependencySource<T> = T | (() => T | Promise<T>);

export interface ExecutionContextFactoryOptions {
  automation?: DependencySource<Automation>;
  dataset?: DependencySource<DatasetProvider>;
  credentials?: DependencySource<CredentialProvider>;
  artifacts?: DependencySource<ArtifactService>;
  logger?: DependencySource<Logger>;
  stateWriter?: DependencySource<StateWriter>;
  defaults?: {
    dataset?: FileDatasetProviderOptions;
    credentials?: EnvCredentialProviderOptions;
    logger?: BasicLoggerOptions;
  };
}

const resolve = async <T>(source: DependencySource<T> | undefined, fallback: () => T | Promise<T>) => {
  if (typeof source === 'function') {
    return source();
  }
  if (source) {
    return source;
  }
  return fallback();
};

export async function createExecutionContext(options: ExecutionContextFactoryOptions = {}): Promise<ExecutionContext> {
  const [automation, dataset, credentials, artifacts, logger, stateWriter] = await Promise.all([
    resolve(options.automation, () => new StubAutomation()),
    resolve(options.dataset, () => new FileDatasetProvider(options.defaults?.dataset)),
    resolve(options.credentials, () => new EnvCredentialProvider(options.defaults?.credentials)),
    resolve(options.artifacts, () => new InMemoryArtifactService()),
    resolve(options.logger, () => new BasicLogger(options.defaults?.logger)),
    resolve(options.stateWriter, () => new BufferedStateWriter()),
  ]);

  return Object.freeze({
    automation,
    dataset,
    credentials,
    artifacts,
    logger,
    stateWriter,
  });
}
