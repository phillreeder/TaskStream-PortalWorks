import type { FlowDefinition, StateTransitionOperation, TenantProcessConfig } from '../../entities/execution.ts';

export type TenantProcessValidationIssueCode =
  | 'STATE_DEFINITION_MISSING'
  | 'FLOW_DEFINITIONS_MISSING'
  | 'STO_DEFINITIONS_MISSING'
  | 'INVALID_FLOW_SHAPE'
  | 'INVALID_STO_SHAPE'
  | 'FLOW_KEY_MISMATCH'
  | 'STO_KEY_MISMATCH'
  | 'DUPLICATE_STO_ID'
  | 'STO_FLOW_NOT_FOUND';

export interface TenantProcessValidationIssue {
  readonly code: TenantProcessValidationIssueCode;
  readonly message: string;
  readonly path?: string;
  readonly meta?: Record<string, unknown>;
}

export interface TenantProcessValidationResult {
  readonly valid: boolean;
  readonly issues: TenantProcessValidationIssue[];
}

export class TenantProcessValidationError extends Error {
  readonly issues: readonly TenantProcessValidationIssue[];

  constructor(issues: readonly TenantProcessValidationIssue[]) {
    super(issues[0]?.message ?? 'Tenant process validation failed');
    this.name = 'TenantProcessValidationError';
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecord = (
  value: unknown,
  path: string,
  issues: TenantProcessValidationIssue[],
  code: TenantProcessValidationIssueCode,
): Record<string, unknown> | undefined => {
  if (!isRecord(value)) {
    issues.push({
      code,
      path,
      message: `${path} must be an object`,
    });
    return undefined;
  }
  return value;
};

const ensureFlowKeyIntegrity = (
  flows: Record<string, FlowDefinition>,
  issues: TenantProcessValidationIssue[],
): void => {
  for (const [key, definition] of Object.entries(flows)) {
    if (!definition || typeof definition !== 'object') {
      issues.push({
        code: 'INVALID_FLOW_SHAPE',
        path: `flows.${key}`,
        message: `Flow ${key} must be an object definition`,
      });
      continue;
    }
    if (definition.key !== key) {
      issues.push({
        code: 'FLOW_KEY_MISMATCH',
        path: `flows.${key}`,
        message: `Flow record key ${key} must match flow.key (${definition.key ?? 'undefined'})`,
      });
    }
  }
};

const ensureStoIntegrity = (
  stos: Record<string, StateTransitionOperation>,
  issues: TenantProcessValidationIssue[],
): void => {
  const ids = new Set<string>();
  for (const [key, sto] of Object.entries(stos)) {
    if (!sto || typeof sto !== 'object') {
      issues.push({
        code: 'INVALID_STO_SHAPE',
        path: `stos.${key}`,
        message: `STO ${key} must be an object definition`,
      });
      continue;
    }
    if (sto.key !== key) {
      issues.push({
        code: 'STO_KEY_MISMATCH',
        path: `stos.${key}`,
        message: `STO record key ${key} must match sto.key (${sto.key ?? 'undefined'})`,
      });
    }
    if (ids.has(sto.id)) {
      issues.push({
        code: 'DUPLICATE_STO_ID',
        path: `stos.${key}`,
        message: `Duplicate STO id ${sto.id} detected`,
      });
    } else {
      ids.add(sto.id);
    }
  }
};

const ensureStoFlowReferences = (
  stos: Record<string, StateTransitionOperation>,
  flows: Record<string, FlowDefinition>,
  issues: TenantProcessValidationIssue[],
): void => {
  for (const sto of Object.values(stos)) {
    if (!sto || typeof sto !== 'object') {
      continue;
    }
    if (!flows[sto.flowKey]) {
      issues.push({
        code: 'STO_FLOW_NOT_FOUND',
        path: `stos.${sto.key}.flowKey`,
        message: `STO ${sto.key} references missing flow ${sto.flowKey}`,
      });
    }
  }
};

export const validateTenantProcessStructure = (config: TenantProcessConfig): TenantProcessValidationResult => {
  const issues: TenantProcessValidationIssue[] = [];

  if (!config.stateDefinition) {
    issues.push({
      code: 'STATE_DEFINITION_MISSING',
      path: 'stateDefinition',
      message: 'TenantProcess missing stateDefinition export',
    });
  }

  const flowsRecord = asRecord(config.flows, 'flows', issues, 'FLOW_DEFINITIONS_MISSING');
  if (flowsRecord && Object.keys(flowsRecord).length === 0) {
    issues.push({
      code: 'FLOW_DEFINITIONS_MISSING',
      path: 'flows',
      message: 'TenantProcess must declare at least one flow',
    });
  }

  const stosRecord = asRecord(config.stos, 'stos', issues, 'STO_DEFINITIONS_MISSING');
  if (stosRecord && Object.keys(stosRecord).length === 0) {
    issues.push({
      code: 'STO_DEFINITIONS_MISSING',
      path: 'stos',
      message: 'TenantProcess must declare at least one STO',
    });
  }

  if (flowsRecord) {
    ensureFlowKeyIntegrity(flowsRecord as Record<string, FlowDefinition>, issues);
  }
  if (stosRecord) {
    ensureStoIntegrity(stosRecord as Record<string, StateTransitionOperation>, issues);
  }
  if (flowsRecord && stosRecord) {
    ensureStoFlowReferences(
      stosRecord as Record<string, StateTransitionOperation>,
      flowsRecord as Record<string, FlowDefinition>,
      issues,
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

export const assertTenantProcessStructure = (config: TenantProcessConfig): void => {
  const result = validateTenantProcessStructure(config);
  if (!result.valid) {
    throw new TenantProcessValidationError(result.issues);
  }
};
