import type { FieldDefinitions } from './types/index.js';
import type {
  StateContainer,
  StateContainerOptions,
  StateContainerValidationResult,
  StatePathInput,
  StatePathValueInput,
} from './StateContainer.js';

export interface StateWriterConstructorInput<TFields extends FieldDefinitions> {
  container: StateContainer<TFields>;
}

export class StateWriter<TFields extends FieldDefinitions = FieldDefinitions> {
  private readonly container: StateContainer<TFields>;

  constructor({ container }: StateWriterConstructorInput<TFields>) {
    this.container = container;
  }

  set_path(input: StatePathValueInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.container.set_path(input, options);
  }

  set_paths(
    inputs: readonly StatePathValueInput[],
    options: StateContainerOptions = {},
  ): StateContainerValidationResult | void {
    return this.container.set_paths(inputs, options);
  }

  append_path(input: StatePathValueInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.container.append_path(input, options);
  }

  remove_path(input: StatePathInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.container.remove_path(input, options);
  }

  pop_path(input: StatePathInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.container.pop_path(input, options);
  }

  shift_path(input: StatePathInput, options: StateContainerOptions = {}): StateContainerValidationResult | void {
    return this.container.shift_path(input, options);
  }
}
