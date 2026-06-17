import { TaskApiClient } from './taskApiClient.js';

const client = new TaskApiClient();
const form = document.querySelector('#task-form');
const nameInput = document.querySelector('#task-name');
const output = document.querySelector('#output');

async function loadTasks() {
  output.textContent = 'Loading stored tasks...';
  const tasks = await client.getTasks();
  output.textContent = JSON.stringify(tasks, null, 2);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  output.textContent = 'Sending...';

  try {
    await client.createTask(nameInput.value);
    form.reset();
    await loadTasks();
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }
});

loadTasks().catch((error) => {
  output.textContent = error instanceof Error ? error.message : String(error);
});
