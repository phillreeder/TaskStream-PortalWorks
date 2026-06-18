async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export function getJson<T>(path: string): Promise<T> {
  return requestJson(path);
}

export function postJson<T>(path: string, body?: unknown): Promise<T> {
  return requestJson(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
