import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SqliteStreamStateStore } from '../SqliteStreamStateStore.js';

test('SqliteStreamStateStore persists authoritative state and does not reseed an existing stream', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'taskstream-stream-state-'));
  const databasePath = join(directory, 'state.sqlite');

  try {
    const firstStore = new SqliteStreamStateStore(databasePath);
    await firstStore.ensureInitialState({
      streamKey: 'task-1',
      state: { status: 'pending' },
      updatedAt: new Date(0).toISOString(),
    });
    await firstStore.saveAuthoritativeState({
      streamKey: 'task-1',
      version: 2,
      state: { status: 'prepared' },
      updatedAt: new Date(1000).toISOString(),
    });
    await firstStore.ensureInitialState({
      streamKey: 'task-1',
      state: { status: 'pending' },
      updatedAt: new Date(2000).toISOString(),
    });
    firstStore.close();

    const reopened = new SqliteStreamStateStore(databasePath);
    const authoritative = await reopened.getAuthoritativeState('task-1');
    reopened.close();

    assert.equal(authoritative?.version, 2);
    assert.deepEqual(authoritative?.state, { status: 'prepared' });
    assert.equal(authoritative?.updatedAt, new Date(1000).toISOString());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
