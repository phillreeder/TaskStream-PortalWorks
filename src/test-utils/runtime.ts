import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const http = require('node:http') as typeof import('node:http');
const https = require('node:https') as typeof import('node:https');

const networkError = () =>
  new Error('Outbound network access is disabled during tests. Provide a stub or mock instead.');

const blockModule = (mod: typeof http | typeof https) => {
  const originalRequest = mod.request;
  const originalGet = mod.get;

  const throwingRequest: typeof mod.request = (..._args) => {
    throw networkError();
  };

  const throwingGet: typeof mod.get = (..._args) => {
    throw networkError();
  };

  mod.request = throwingRequest;
  mod.get = throwingGet;

  return () => {
    mod.request = originalRequest;
    mod.get = originalGet;
  };
};

const fixedTimeIso = process.env.FIXED_TEST_TIME ?? '2024-01-01T00:00:00.000Z';
const fixedDate = new Date(fixedTimeIso);

if (Number.isNaN(fixedDate.getTime())) {
  throw new Error(`Invalid FIXED_TEST_TIME value: ${fixedTimeIso}`);
}

if (process.env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must equal "test" when running Vitest.');
}

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be defined before running tests.');
}

vi.useFakeTimers();
vi.setSystemTime(fixedDate);

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (..._args) => {
    throw networkError();
  };
  // Provide escape hatch for rare debugging sessions.
  Object.defineProperty(globalThis, '__originalFetch', {
    value: originalFetch,
    configurable: true,
    enumerable: false,
    writable: false,
  });
}

const restoreHttp = blockModule(http);
const restoreHttps = blockModule(https);

export { fixedDate };

// Ensure timers/network guards reset once the process exits to keep watch mode clean.
process.on('exit', () => {
  vi.useRealTimers();
  restoreHttp();
  restoreHttps();
});
