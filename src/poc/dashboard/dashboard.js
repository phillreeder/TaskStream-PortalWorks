import { TaskApiClient } from './taskApiClient.js';

const client = new TaskApiClient();
const form = document.querySelector('#task-form');
const nameInput = document.querySelector('#task-name');
const output = document.querySelector('#output');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  output.textContent = 'Sending...';

  try {
    const created = await client.createTask(nameInput.value);
    const stored = await client.getTask(created.id);
    output.textContent = JSON.stringify(stored, null, 2);
    form.reset();
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }
});
