import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REQUIRED_ENV_VARS = ['TEST_DATABASE_URL'] as const;
const DEFAULT_FIXED_TIME = '2024-01-01T00:00:00.000Z';

const projectRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const loadEnvFile = (filename: string) => {
  const filePath = path.join(projectRoot, filename);
  if (!existsSync(filePath)) {
    return;
  }

  const fileContents = readFileSync(filePath, 'utf8');
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    if (!key || !value) {
      continue;
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

const hydrateEnv = () => {
  loadEnvFile('.env.test');
  loadEnvFile('.env');
};

const ensureNodeEnv = () => {
  const current = process.env.NODE_ENV;
  if (current && current !== 'test') {
    throw new Error(`NODE_ENV must be "test" during Vitest runs (received "${current}")`);
  }
  process.env.NODE_ENV = 'test';
};

const ensureRequiredEnv = () => {
  for (const variableName of REQUIRED_ENV_VARS) {
    const value = process.env[variableName];
    if (!value) {
      throw new Error(`Missing required environment variable: ${variableName}`);
    }
  }
};

const runCommand = async (command: string, args: string[]) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
      },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with status ${code}`));
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};

const ensureDatabaseReady = async () => {
  await runCommand('npm', ['run', '--silent', 'test:setup']);
};

export default async function globalSetup() {
  hydrateEnv();
  ensureNodeEnv();
  ensureRequiredEnv();
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.FIXED_TEST_TIME = process.env.FIXED_TEST_TIME ?? DEFAULT_FIXED_TIME;
  await ensureDatabaseReady();
}
