import type { CredentialProvider, CredentialRecord, CredentialRequest } from '../../domain/contracts/credentials.ts';

const keyFor = (request: CredentialRequest) => `${request.scope}:${request.referenceId}:${request.key}`;

export class MockCredentialProvider implements CredentialProvider {
  private readonly store = new Map<string, CredentialRecord>();

  set<T>(request: CredentialRequest, data: T) {
    this.store.set(keyFor(request), {
      key: request.key,
      scope: request.scope,
      referenceId: request.referenceId,
      data,
      fetchedAt: new Date().toISOString(),
    });
  }

  async resolve<T = Record<string, string>>(request: CredentialRequest): Promise<CredentialRecord<T>> {
    const record = this.store.get(keyFor(request));
    if (!record) {
      throw new Error(`Mock credential missing for key ${request.key}`);
    }
    return record as CredentialRecord<T>;
  }
}
