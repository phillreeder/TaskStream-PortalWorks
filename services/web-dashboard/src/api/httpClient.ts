export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}
