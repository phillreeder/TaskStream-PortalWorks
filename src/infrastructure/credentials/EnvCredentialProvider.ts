import type { CredentialProvider, CredentialRecord, CredentialRequest } from '../../domain/contracts/credentials.ts';

export interface EnvCredentialProviderOptions {
  prefix?: string;
  separator?: string;
  clock?: () => string;
}

const toEnvKey = (value: string) => value.replace(/[^A-Z0-9]/gi, '_').toUpperCase();

const now = () => new Date().toISOString();

export class EnvCredentialProvider implements CredentialProvider {
  private readonly prefix: string;
  private readonly separator: string;
  private readonly clock: () => string;

  constructor(options: EnvCredentialProviderOptions = {}) {
    this.prefix = options.prefix ?? 'TS_CRED';
    this.separator = options.separator ?? '__';
    this.clock = options.clock ?? now;
  }

  async resolve<T = Record<string, string>>(request: CredentialRequest): Promise<CredentialRecord<T>> {
    const envKey = [
      this.prefix,
      request.scope,
      request.referenceId,
      request.key,
      request.version ?? 'latest',
    ]
      .map(toEnvKey)
      .join(this.separator);

    const value = process.env[envKey];
    if (!value) {
      throw new Error(`Missing credential in environment: ${envKey}`);
    }

    let data: T;
    try {
      data = JSON.parse(value) as T;
    } catch (error) {
      throw new Error(`Credential ${envKey} contains invalid JSON`);
    }

    return {
      key: request.key,
      scope: request.scope,
      referenceId: request.referenceId,
      data,
      fetchedAt: this.clock(),
    };
  }
}
