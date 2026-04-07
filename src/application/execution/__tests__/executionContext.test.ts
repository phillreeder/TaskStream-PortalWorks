import { describe, expect, it } from 'vitest';
import { createExecutionContext } from '../createExecutionContext.js';
import {
  MockArtifactService,
  MockAutomation,
  MockCredentialProvider,
  MockDatasetProvider,
  MockLogger,
  MockStateWriter,
} from '../../../test-utils/mocks/index.js';

const sampleFlow = async () => {
  const datasetProvider = new MockDatasetProvider();
  datasetProvider.set({ key: 'profile' }, { name: 'TaskStream' });

  const credentialProvider = new MockCredentialProvider();
  credentialProvider.set({ key: 'linkedin', scope: 'task', referenceId: 'run-1' }, { password: 'secret' });

  const context = await createExecutionContext({
    automation: () => new MockAutomation('flow-ctx'),
    dataset: datasetProvider,
    credentials: credentialProvider,
    artifacts: new MockArtifactService(),
    logger: new MockLogger({ flow: 'login' }),
    stateWriter: new MockStateWriter(),
  });

  await context.automation.open('https://example.com');
  const ds = await context.dataset.resolve<{ name: string }>({ key: 'profile' });
  const creds = await context.credentials.resolve<{ password: string }>({
    key: 'linkedin',
    scope: 'task',
    referenceId: 'run-1',
  });

  context.logger.info('flow:start', { ds: ds.data.name });
  context.stateWriter.queue({ type: 'set', path: 'session.password', value: creds.data.password });
  const batch = await context.stateWriter.flush();

  expect(batch.changes).toHaveLength(1);
  expect(context.automation.history()).toHaveLength(1);
};

describe('createExecutionContext', () => {
  it('creates default stubbed dependencies when none provided', async () => {
    const ctx = await createExecutionContext();
    await ctx.automation.open('https://example.com');
    expect(ctx.automation.history()).toHaveLength(1);
    expect(ctx.logger.entries()).toHaveLength(0);
    expect(ctx.stateWriter.isDirty()).toBe(false);
  });

  it('supports overriding dependencies with factories', async () => {
    await sampleFlow();
  });

  it('freezes the resulting context to prevent mutation', async () => {
    const ctx = await createExecutionContext();
    expect(() => {
      // @ts-expect-error verifying runtime immutability
      ctx.automation = new MockAutomation();
    }).toThrowError();
  });
});
