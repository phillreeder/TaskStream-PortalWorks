import type { SystemTraceRecorder } from '../SystemTrace/index.js';
import { ModuleLinkCore } from './core/index.js';
import type { ModuleLinkCoreOptions } from './core/index.js';
import { createDirectSystemTraceRoute, ModuleLinkSystemTraceFacade } from './facades/SystemTrace/index.js';

export interface ModuleLinkOptions extends ModuleLinkCoreOptions {
  readonly systemTraceRecorder?: SystemTraceRecorder;
}

export class ModuleLink {
  readonly core: ModuleLinkCore;
  readonly systemTrace: ModuleLinkSystemTraceFacade;

  constructor(options: ModuleLinkOptions = {}) {
    this.core = new ModuleLinkCore(options);
    if (options.systemTraceRecorder) {
      this.core.registerRoute(createDirectSystemTraceRoute(options.systemTraceRecorder));
    }
    this.systemTrace = new ModuleLinkSystemTraceFacade({
      core: this.core,
      sourceModule: 'ModuleLink',
    });
  }
}
