import { RuntimeScaffold } from './RuntimeScaffold.js';

const commandPath = process.argv[2] ?? process.env.RUNTIME_SCAFFOLD_COMMAND_FILE;
if (!commandPath) {
  console.error('Usage: npm run scaffold:flat:watch -- <command-file.json>');
  process.exitCode = 1;
} else {
  const watcher = new RuntimeScaffold().watchFlatCommandFile(commandPath, {
    onResult: (result) => {
      console.log(JSON.stringify({
        commandPath: result.controlPath,
        configPath: result.configPath,
        configId: result.configId,
        runId: result.runId,
        status: result.status,
        runDirectory: result.runDirectory,
      }, null, 2));
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const close = () => {
    watcher.close();
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
