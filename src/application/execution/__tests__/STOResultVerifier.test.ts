import { describe, expect, it } from 'vitest';
import { STOResultVerifier } from '../STOResultVerifier.js';
import { StoResultVerificationError } from '../errors.js';
import { createFrozenSnapshot } from './fixtures.js';

const changeBatch = {
  id: 'batch-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  changes: [{ type: 'set', path: 'session.token', value: 'abc123' }] as const,
};

describe('STOResultVerifier', () => {
  it('passes through the underlying state definition result', async () => {
    const snapshot = await createFrozenSnapshot();
    const verifier = new STOResultVerifier();

    const result = await verifier.verify({ snapshot, changes: changeBatch });

    expect(result.valid).toBe(true);
  });

  it('rejects executions that produced no changes', async () => {
    const snapshot = await createFrozenSnapshot();
    const verifier = new STOResultVerifier();

    await expect(
      verifier.verify({ snapshot, changes: { ...changeBatch, changes: [] } }),
    ).rejects.toBeInstanceOf(StoResultVerificationError);
  });
});
