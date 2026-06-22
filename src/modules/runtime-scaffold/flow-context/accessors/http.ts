import type { FlowHttpAccessor, FlowHttpRequest } from '../../../../domain/tenantProcess/accessors/index.js';
import { unavailableAccessorResult } from './unavailable.js';

export function loadScaffoldHttpAccessor(): FlowHttpAccessor {
  const request = async (input: FlowHttpRequest) => unavailableAccessorResult('http', input.method.toLowerCase());

  return {
    request,
    get(input) { return request({ ...input, method: 'GET' }); },
    post(input) { return request({ ...input, method: 'POST' }); },
    put(input) { return request({ ...input, method: 'PUT' }); },
    patch(input) { return request({ ...input, method: 'PATCH' }); },
    remove(input) { return request({ ...input, method: 'DELETE' }); },
  };
}
