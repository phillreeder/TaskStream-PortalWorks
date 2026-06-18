export type PocEntityStructure = {
  readonly entityType: string;
  readonly version: number;
  readonly structure: Record<string, unknown>;
};

export const TASK_STRUCTURE = {
  entityType: 'Task',
  version: 1,
  structure: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1 },
    },
  },
} as const satisfies PocEntityStructure;

export const TASK_EVENT_STRUCTURE = {
  entityType: 'TaskEvent',
  version: 1,
  structure: {
    type: 'object',
    required: ['taskId', 'eventType', 'entityStructureType', 'entityStructureVersion', 'occurredAt'],
    properties: {
      taskId: { type: 'string' },
      eventType: { enum: ['task-created', 'task-update-signalled'] },
      entityStructureType: { type: 'string' },
      entityStructureVersion: { type: 'integer' },
      occurredAt: { type: 'string' },
    },
  },
} as const satisfies PocEntityStructure;

export const PLANNER_QUEUE_ITEM_STRUCTURE = {
  entityType: 'PlannerQueueItem',
  version: 1,
  structure: {
    type: 'object',
    required: ['eventId', 'taskId', 'status', 'attemptCount', 'availableAt', 'createdAt'],
    properties: {
      eventId: { type: 'string' },
      taskId: { type: 'string' },
      status: { enum: ['queued', 'claimed', 'completed', 'failed'] },
      attemptCount: { type: 'integer' },
      availableAt: { type: 'string' },
      claimedBy: { type: ['string', 'null'] },
      claimedAt: { type: ['string', 'null'] },
      lastError: { type: ['string', 'null'] },
      processAction: { type: ['string', 'null'] },
      createdAt: { type: 'string' },
    },
  },
} as const satisfies PocEntityStructure;

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
} as const satisfies PocEntityStructure;

export const POC_ENTITY_STRUCTURES = [
  TASK_STRUCTURE,
  TASK_EVENT_STRUCTURE,
  PLANNER_QUEUE_ITEM_STRUCTURE,
  ENTITY_STRUCTURE_VERSION_STRUCTURE,
] as const;
