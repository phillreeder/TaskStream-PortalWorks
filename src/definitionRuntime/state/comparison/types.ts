export type StateDiffChange = {
  prev: unknown;
  next: unknown;
};

export type StateDiff = {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, StateDiffChange>;
};

export type ComparisonResult = {
  equal: boolean;
  diff?: StateDiff;
};
