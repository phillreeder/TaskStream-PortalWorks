import { describe, expect, it } from 'vitest';
import {
  MockArtifactService,
  MockAutomation,
  MockCredentialProvider,
  MockDatasetProvider,
  MockLogger,
  MockStateWriter,
} from '../index.js';

const automationTarget = '#login-button';

describe('test-utils mocks', () => {
  it('records automation steps and scripted results', async () => {
    const automation = new MockAutomation('automation-test');
    automation.setWaitResult(automationTarget, false);
    automation.setEvaluateResult('document.title', () => 'TaskStream');

    await automation.open('https://example.com');
    const wait = await automation.waitFor(automationTarget);
    const title = await automation.evaluate<string>('document.title');

    expect(wait).toBe(false);
    expect(title).toBe('TaskStream');
    expect(automation.history()).toHaveLength(3);
  });

  it('resolves datasets and credentials from in-memory stores', async () => {
    const datasets = new MockDatasetProvider();
    datasets.set({ key: 'profile', scope: 'task' }, { username: 'user@example.com' });

    const credentials = new MockCredentialProvider();
    credentials.set({ key: 'linkedin', scope: 'task', referenceId: 'stream-1' }, { password: 'secret' });

    const dataset = await datasets.resolve<{ username: string }>({ key: 'profile', scope: 'task' });
    const credential = await credentials.resolve<{ password: string }>({
      key: 'linkedin',
      scope: 'task',
      referenceId: 'stream-1',
    });

    expect(dataset.data.username).toBe('user@example.com');
    expect(credential.data.password).toBe('secret');
  });

  it('stores artifacts and exposes metadata', async () => {
    const artifacts = new MockArtifactService();
    const record = await artifacts.save({
      runId: 'run-1',
      label: 'screenshot',
      kind: 'screenshot',
      contentType: 'image/png',
      data: 'base64',
    });

    expect(record.id).toBeDefined();
    expect(record.size).toBeGreaterThan(0);
    const listed = await artifacts.list('run-1');
    expect(listed).toHaveLength(1);
  });

  it('buffers logs and exposes entries', () => {
    const logger = new MockLogger({ runId: 'run-1' });
    logger.info('started');
    logger.error('failed', { code: 'E_FAIL' });

    expect(logger.entries()).toHaveLength(2);
    expect(logger.entries()[1]?.context?.code).toBe('E_FAIL');
  });

  it('queues and flushes state mutations deterministically', async () => {
    const stateWriter = new MockStateWriter();
    stateWriter.queue({ type: 'set', path: 'state.value', value: 1 });
    expect(stateWriter.isDirty()).toBe(true);
    const batch = await stateWriter.flush();
    expect(batch.changes[0]?.path).toBe('state.value');
    expect(stateWriter.isDirty()).toBe(false);
  });
});
