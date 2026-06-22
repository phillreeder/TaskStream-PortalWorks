import type { FlowUnitAccessor } from '../../../../domain/tenantProcess/accessors/index.js';
import { unavailableAccessorResult } from './unavailable.js';

export function loadScaffoldUnitAccessor(): FlowUnitAccessor {
  return {
    async create() { return unavailableAccessorResult('unit', 'create'); },
    async get() { return unavailableAccessorResult('unit', 'get'); },
    async list() { return unavailableAccessorResult('unit', 'list'); },
    async update() { return unavailableAccessorResult('unit', 'update'); },
    async remove() { return unavailableAccessorResult('unit', 'remove'); },
  };
}
