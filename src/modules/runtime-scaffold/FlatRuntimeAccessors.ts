import { randomUUID } from 'node:crypto';
import type {
  FlowArtifactAccessor,
  FlowArtifactRecord,
  FlowLoggerAccessor,
  FlowUnitAccessor,
  FlowUnitRecord,
} from '../../domain/tenantProcess/index.js';
import type { JsonObject } from '../../domain/tenantProcess/types.js';
import {
  FlatRuntimeFileStore,
  type FlatRuntimeStoredArtifact,
  type FlatRuntimeStoredUnit,
} from './FlatRuntimeStore.js';

export interface FlatRuntimeSession {
  readonly runId: string;
  readonly cycleId: string;
  readonly taskRef: string;
  readonly input: Record<string, unknown>;
  readonly units: Map<string, FlatRuntimeStoredUnit>;
  readonly artifacts: Map<string, FlatRuntimeStoredArtifact>;
  currentStreamId?: string;
}

export interface FlatRuntimeAccessors {
  readonly unit: FlowUnitAccessor;
  readonly artifact: FlowArtifactAccessor;
  readonly logger: FlowLoggerAccessor;
}

export type FlatRuntimeTraceWriter = (
  phase: string,
  event: string,
  data?: unknown,
) => Promise<void>;

export function createFlatRuntimeAccessors(input: {
  readonly store: FlatRuntimeFileStore;
  readonly session: FlatRuntimeSession;
  readonly trace: FlatRuntimeTraceWriter;
}): FlatRuntimeAccessors {
  const { store, session, trace } = input;

  const unit: FlowUnitAccessor = {
    create: async ({ type, data }) => {
      const now = new Date().toISOString();
      const record: FlatRuntimeStoredUnit = {
        unitId: randomUUID(),
        type,
        data,
        runId: session.runId,
        cycleId: session.cycleId,
        createdAt: now,
        updatedAt: now,
      };
      session.units.set(record.unitId, record);
      await store.saveUnit(record);
      await trace('accessor', 'unit.created', {
        unitId: record.unitId,
        type,
        streamId: session.currentStreamId,
      });
      return { status: 'succeeded', value: toFlowUnit(record) };
    },
    get: async ({ unitId }) => ({
      status: 'succeeded',
      value: session.units.has(unitId) ? toFlowUnit(session.units.get(unitId)!) : undefined,
    }),
    list: async (query = {}) => ({
      status: 'succeeded',
      value: [...session.units.values()]
        .filter((record) => !query.type || record.type === query.type)
        .slice(0, normalizeLimit(query.limit))
        .map(toFlowUnit),
    }),
    update: async ({ unitId, changes }) => {
      const existing = session.units.get(unitId);
      if (!existing) {
        throw new Error(`Flat RuntimeScaffold Unit not found: ${unitId}`);
      }
      const record: FlatRuntimeStoredUnit = {
        ...existing,
        data: { ...existing.data, ...changes },
        updatedAt: new Date().toISOString(),
      };
      session.units.set(unitId, record);
      await store.saveUnit(record);
      return { status: 'succeeded', value: toFlowUnit(record) };
    },
    remove: async ({ unitId }) => {
      session.units.delete(unitId);
      await store.removeUnit(session.runId, unitId);
      return { status: 'succeeded', value: { unitId } };
    },
  };

  const artifact: FlowArtifactAccessor = {
    save: async ({ name, content, metadata }) => {
      const record: FlatRuntimeStoredArtifact = {
        artifactId: randomUUID(),
        name,
        content,
        ...(metadata ? { metadata } : {}),
        runId: session.runId,
        cycleId: session.cycleId,
        ...(session.currentStreamId ? { streamId: session.currentStreamId } : {}),
        createdAt: new Date().toISOString(),
      };
      session.artifacts.set(record.artifactId, record);
      await store.saveArtifact(record);
      return { status: 'succeeded', value: toFlowArtifact(record) };
    },
    get: async ({ artifactId }) => ({
      status: 'succeeded',
      value: session.artifacts.has(artifactId)
        ? toFlowArtifact(session.artifacts.get(artifactId)!)
        : undefined,
    }),
    list: async (query = {}) => ({
      status: 'succeeded',
      value: [...session.artifacts.values()]
        .slice(0, normalizeLimit(query.limit))
        .map(toFlowArtifact),
    }),
  };

  const log = async (level: string, message: string, context?: JsonObject) => {
    await trace('logger', level, {
      message,
      ...(context ? { context } : {}),
      streamId: session.currentStreamId,
    });
    return { status: 'succeeded' as const, value: undefined };
  };

  const logger: FlowLoggerAccessor = {
    debug: ({ message, context }) => log('debug', message, context),
    info: ({ message, context }) => log('info', message, context),
    warn: ({ message, context }) => log('warn', message, context),
    error: ({ message, context }) => log('error', message, context),
  };

  return { unit, artifact, logger };
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('Accessor limit must be a non-negative integer');
  }
  return value;
}

function toFlowUnit(record: FlatRuntimeStoredUnit): FlowUnitRecord {
  return { unitId: record.unitId, type: record.type, data: record.data };
}

function toFlowArtifact(record: FlatRuntimeStoredArtifact): FlowArtifactRecord {
  return {
    artifactId: record.artifactId,
    name: record.name,
    ...(record.content === undefined ? {} : { content: record.content }),
    ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
  };
}
