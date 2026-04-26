import type { FieldDefinitions } from './types/index.js';
import type { StateContainer, StatePathInput } from './StateContainer.js';

export interface StateReaderConstructorInput<TFields extends FieldDefinitions> {
  container: StateContainer<TFields>;
}

export class StateReader<TFields extends FieldDefinitions = FieldDefinitions> {
  private readonly container: StateContainer<TFields>;

  constructor({ container }: StateReaderConstructorInput<TFields>) {
    this.container = container;
  }

  get(input: StatePathInput): unknown {
    return this.container.read_path(input);
  }
}
