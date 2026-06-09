import type { SystemTraceCaptureInput, SystemTraceRecorder } from '../../../SystemTrace/index.js';
import type { ModuleLinkRoute } from '../../core/index.js';

export function createDirectSystemTraceRoute(recorder: SystemTraceRecorder): ModuleLinkRoute {
  return {
    targetModule: 'SystemTrace',
    action: 'record',
    mode: 'direct-library',
    handler: (envelope) => recorder.capture(envelope.payload as SystemTraceCaptureInput),
  };
}
