export type FlowAccessorResult<TValue = unknown> =
  | {
      readonly status: 'succeeded';
      readonly value: TValue;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: string;
    };
