export class TaskApiClient {
  constructor(baseUrl = window.location.origin) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createTask(name) {
    return this.#request('/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async getTasks() {
    return this.#request('/tasks');
  }

  async getTask(id) {
    return this.#request(`/tasks/${encodeURIComponent(id)}`);
  }

  async getTaskStructure() {
    return this.#request('/task-structure');
  }

  async #request(path, init) {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error ?? `Request failed with status ${response.status}.`);
    }

    return body;
  }
}
