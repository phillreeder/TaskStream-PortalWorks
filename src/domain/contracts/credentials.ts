export type CredentialScope = 'task' | 'cycle' | 'stream' | 'unit';

export interface CredentialRequest {
  key: string;
  scope: CredentialScope;
  referenceId: string;
  version?: string;
}

export interface CredentialRecord<T = Record<string, string>> {
  key: string;
  scope: CredentialScope;
  referenceId: string;
  data: T;
  fetchedAt: string;
}

export interface CredentialProvider {
  resolve<T = Record<string, string>>(request: CredentialRequest): Promise<CredentialRecord<T>>;
}
