import { describe, expect, it } from 'vitest';
import { isValidatedStateDefinition } from '@TaskStream/App/definitionRuntime/state/defineState.js';
import { tenantProcess } from './process.js';
import {
  connectionAcquisitionTaskStateDefinition,
  connectionSearchStreamStateDefinition,
} from './stateDefinition.js';

describe('SalesPipeline1 StateDefinitions', () => {
  it('defines validated TaskState and StreamState schemas', () => {
    expect(isValidatedStateDefinition(connectionAcquisitionTaskStateDefinition)).toBe(true);
    expect(isValidatedStateDefinition(connectionSearchStreamStateDefinition)).toBe(true);

    expect(connectionAcquisitionTaskStateDefinition.defaults.cycleCandidateLimit).toBe(20);
    expect(connectionAcquisitionTaskStateDefinition.defaults.candidates).toEqual([]);
    expect(connectionSearchStreamStateDefinition.defaults.phase).toBe('ready_for_page_inspection');
  });

  it('registers both definitions and binds the current Task to StreamState', () => {
    expect(tenantProcess.stateDefinitions.connectionAcquisitionTask).toBeDefined();
    expect(tenantProcess.stateDefinitions.connectionSearchStream).toBeDefined();
    expect(tenantProcess.tasks.searchConnections?.stateDefinition).toBe(
      tenantProcess.stateDefinitions.connectionSearchStream,
    );
  });
});
