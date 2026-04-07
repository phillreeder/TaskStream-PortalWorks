import type { FlowDefinition, StateTransitionOperation, TenantProcessConfig, TenantProcessRuntime } from '../../entities/execution.ts';
import { deepFreeze } from '../../../utils/deepFreeze.js';
import { assertTenantProcessStructure } from '../evaluators/TenantProcessValidator.ts';

const lockMapMutators = <TValue>(map: Map<string, TValue>): ReadonlyMap<string, TValue> => {
  const panic = () => {
    throw new Error('TenantProcessRuntime maps are immutable');
  };

  Object.defineProperties(map, {
    set: {
      value(this: Map<string, TValue>) {
        panic();
        return this;
      },
      configurable: false,
      writable: false,
    },
    delete: {
      value() {
        panic();
        return false;
      },
      configurable: false,
      writable: false,
    },
    clear: {
      value() {
        panic();
      },
      configurable: false,
      writable: false,
    },
  });

  return map;
};

const toReadonlyMap = <TValue>(entries: [string, TValue][]): ReadonlyMap<string, TValue> =>
  lockMapMutators(new Map<string, TValue>(entries));

const entriesFromRecord = <TValue>(record: Record<string, TValue>): [string, TValue][] => Object.entries(record);

export const normalizeTenantProcess = (config: TenantProcessConfig): TenantProcessRuntime => {
  assertTenantProcessStructure(config);

  const flowEntries = entriesFromRecord(config.flows as Record<string, FlowDefinition>);
  const stoEntries = entriesFromRecord(config.stos as Record<string, StateTransitionOperation>);

  const runtime: TenantProcessRuntime = {
    id: config.id,
    key: config.key,
    version: config.version,
    stateDefinition: config.stateDefinition!,
    flows: toReadonlyMap(flowEntries),
    stos: toReadonlyMap(stoEntries),
    validators: config.validators ?? {},
    mappers: config.mappers ?? {},
    selectors: config.selectors ?? {},
  };

  return deepFreeze(runtime);
};
