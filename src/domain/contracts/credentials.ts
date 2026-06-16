export interface CredentialRequest {
  readonly key: string;
  readonly scope: string;
  readonly referenceId: string;
  readonly version?: string;
}

export interface CredentialRecord<TData = Record<string, string>> {
  readonly key: string;
  readonly scope: string;
  readonly referenceId: string;
  readonly data: TData;
  readonly fetchedAt: string;
}

export interface CredentialProvider {
  resolve<TData = Record<string, string>>(request: CredentialRequest): Promise<CredentialRecord<TData>>;
}
