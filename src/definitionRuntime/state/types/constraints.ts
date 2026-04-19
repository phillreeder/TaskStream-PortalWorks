export type ConstraintPhase = 'change' | 'state';

export interface ConstraintBase<Kind extends string, Phase extends ConstraintPhase, Payload> {
  kind: Kind;
  phase: Phase;
  payload: Payload;
}

export type MinConstraint = ConstraintBase<'min_value', 'change', { value: number }>;

export type MaxConstraint = ConstraintBase<'max_value', 'change', { value: number }>;

export type RegexConstraint = ConstraintBase<'matches_regex', 'change', { pattern: RegExp }>;

export type RequiredIfConstraint = ConstraintBase<'required_if', 'state', { predicate: (state: Record<string, unknown>) => boolean }>;

export type TtlConstraint = ConstraintBase<'time_to_live', 'state', { ms: number; fromField?: string }>;

export type Constraint = MinConstraint | MaxConstraint | RegexConstraint | RequiredIfConstraint | TtlConstraint;
