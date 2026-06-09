import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ModuleLinkCore, targetRejected } from '../index.js';

describe('ModuleLink core', () => {
  it('creates the required envelope shape', () => {
    const core = new ModuleLinkCore();
    const envelope = core.createEnvelope({
      requestId: 'req-1',
      correlationId: 'corr-1',
      sourceModule: 'RuntimeScaffold',
      targetModule: 'SystemTrace',
      action: 'record',
      payload: { value: true },
      metadata: { runId: 'run-1' },
    });

    expect(envelope).toEqual({
      requestId: 'req-1',
      correlationId: 'corr-1',
      sourceModule: 'RuntimeScaffold',
      targetModule: 'SystemTrace',
      action: 'record',
      payload: { value: true },
      metadata: { runId: 'run-1' },
    });
  });

  it('returns route-not-found before target execution', async () => {
    const core = new ModuleLinkCore();

    const result = await core.deliver({
      sourceModule: 'A',
      targetModule: 'Missing',
      action: 'record',
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('route-not-found');
  });

  it('routes direct-library calls and distinguishes target semantic rejection from delivery failure', async () => {
    const core = new ModuleLinkCore({
      routes: [
        {
          targetModule: 'Target',
          action: 'accept',
          mode: 'direct-library',
          handler: (envelope) => ({ accepted: envelope.payload }),
        },
        {
          targetModule: 'Target',
          action: 'reject',
          mode: 'direct-library',
          handler: () => targetRejected('target says no', { code: 'NOPE' }),
        },
        {
          targetModule: 'Target',
          action: 'throw',
          mode: 'direct-library',
          handler: () => {
            throw new Error('transport-ish failure');
          },
        },
      ],
    });

    await expect(core.deliver({ sourceModule: 'A', targetModule: 'Target', action: 'accept', payload: { id: 1 } }))
      .resolves.toMatchObject({ ok: true, status: 'delivered', value: { accepted: { id: 1 } } });
    await expect(core.deliver({ sourceModule: 'A', targetModule: 'Target', action: 'reject', payload: {} }))
      .resolves.toMatchObject({ ok: false, status: 'target-rejected' });
    await expect(core.deliver({ sourceModule: 'A', targetModule: 'Target', action: 'throw', payload: {} }))
      .resolves.toMatchObject({ ok: false, status: 'delivery-failure' });
  });

  it('keeps SystemTrace-specific imports out of generic core files', async () => {
    const files = [
      new URL('../core/ModuleLinkCore.ts', import.meta.url),
      new URL('../core/RouteRegistry.ts', import.meta.url),
      new URL('../core/envelope.ts', import.meta.url),
      new URL('../core/types.ts', import.meta.url),
    ];

    for (const file of files) {
      const contents = await readFile(file, 'utf8');
      expect(contents).not.toContain('SystemTrace');
    }
  });
});
