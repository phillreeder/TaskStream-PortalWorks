export type EntityStructure = {
  readonly entityType: string;
  readonly version: number;
  readonly structure: Record<string, unknown>;
};

export const TASK_STRUCTURE = {
  entityType: 'Task',
  version: 2,
  structure: {
    type: 'object',
    required: ['taskRef', 'name'],
    properties: {
      taskRef: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
    },
  },
} as const satisfies EntityStructure;

export const TASK_EVENT_STRUCTURE = {
  entityType: 'Event',
  version: 1,
  structure: {
    type: 'object',
    required: ['eventType', 'sourceEntityType', 'sourceEntityId', 'entityStructureType', 'entityStructureVersion', 'payload', 'occurredAt'],
    properties: {
      eventType: { type: 'string' },
      sourceEntityType: { type: 'string' },
      sourceEntityId: { type: 'string' },
      entityStructureType: { type: 'string' },
      entityStructureVersion: { type: 'integer' },
      payload: { type: 'object' },
      occurredAt: { type: 'string' },
    },
  },
} as const satisfies EntityStructure;

export const EVENT_REACTION_STRUCTURE = {
  entityType: 'EventReaction',
  version: 1,
  structure: {
    type: 'object',
    required: ['id', 'eventType', 'queueIntentType', 'handlerKey', 'workType', 'createdAt'],
    properties: {
      id: { type: 'string' },
      eventType: { type: 'string' },
      queueIntentType: { type: 'string' },
      handlerKey: { type: 'string' },
      workType: { type: 'string' },
      createdAt: { type: 'string' },
    },
  },
} as const satisfies EntityStructure;

export const PLANNER_QUEUE_ITEM_STRUCTURE = {
  entityType: 'PersistentQueueItem',
  version: 2,
  structure: {
    type: 'object',
    required: ['sourceEventId', 'sourceTaskId', 'taskRef', 'taskName', 'tenantProcessId', 'eventReactionId', 'intentType', 'handlerKey', 'status', 'attemptCount', 'availableAt', 'createdAt'],
    properties: {
      sourceEventId: { type: 'string' },
      sourceTaskId: { type: 'string' },
      taskRef: { type: 'string' },
      taskName: { type: 'string' },
      tenantProcessId: { type: 'string' },
      eventReactionId: { type: 'string' },
      intentType: { type: 'string' },
      handlerKey: { type: 'string' },
      status: { enum: ['queued', 'claimed', 'completed', 'failed'] },
      attemptCount: { type: 'integer' },
      availableAt: { type: 'string' },
      claimedBy: { type: ['string', 'null'] },
      claimedAt: { type: ['string', 'null'] },
      completedAt: { type: ['string', 'null'] },
      failedAt: { type: ['string', 'null'] },
      lastError: { type: ['string', 'null'] },
      createdAt: { type: 'string' },
    },
  },
} as const satisfies EntityStructure;

export const PROCESS_WORK_ENTRY_STRUCTURE = {
  entityType: 'ProcessWorkEntry',
  version: 1,
  structure: {
    type: 'object',
    required: ['id', 'sourceEventId', 'sourceQueueItemId', 'workType', 'status', 'payload', 'createdAt'],
    properties: {
      id: { type: 'string' },
      sourceEventId: { type: 'string' },
      sourceQueueItemId: { type: 'string' },
      workType: { type: 'string' },
      status: { type: 'string' },
      payload: { type: 'object' },
      createdAt: { type: 'string' },
    },
  },
} as const satisfies EntityStructure;

export const ENTITY_STRUCTURE_VERSION_STRUCTURE = {
  entityType: 'EntityStructureVersion',
  version: 1,
  structure: {
    type: 'object',
    required: ['entityType', 'version', 'structure'],
    properties: {
      entityType: { type: 'string' },
      version: { type: 'integer' },
      structure: { type: 'object' },
    },
  },
} as const satisfies EntityStructure;

export const ENTITY_STRUCTURES = [
  TASK_STRUCTURE,
  TASK_EVENT_STRUCTURE,
  EVENT_REACTION_STRUCTURE,
  PLANNER_QUEUE_ITEM_STRUCTURE,
  PROCESS_WORK_ENTRY_STRUCTURE,
  ENTITY_STRUCTURE_VERSION_STRUCTURE,
] as const;
