import { TenantProcess } from '../../../../domain/tenantProcess/index.js';
import type { ChannelExecutable, FlowExecutable } from '../../../../domain/tenantProcess/index.js';

const activationFlow = (async (ctx, input) => {
  const workEntryRef = ctx.state.get({ path: ['workEntryRef'] });
  const workEntryId = ctx.state.get({ path: ['workEntryId'] });
  if (typeof workEntryRef !== 'string' || workEntryRef.length === 0 || workEntryId !== '') {
    return ctx.fail({ reason: 'initial artifact reference must remain unresolved during activation' });
  }

  await ctx.unit.create({ type: 'source', data: { sourceId: input.sourceId } });
  return ctx.success();
}) satisfies FlowExecutable;

const consumeArtifactFlow = (async (ctx) => {
  const existingArtifactId = ctx.state.get({ path: ['workEntryId'] });
  if (typeof existingArtifactId === 'string' && existingArtifactId.length > 0) {
    return ctx.success({ artifactId: existingArtifactId });
  }

  const artifactRef = ctx.state.get({ path: ['workEntryRef'] });
  if (typeof artifactRef !== 'string' || artifactRef.length === 0) {
    return ctx.fail({ reason: 'workEntryRef is required' });
  }

  const resolved = await ctx.artifact.resolve({ ref: artifactRef, format: 'json' });
  if (resolved.status !== 'succeeded') {
    return ctx.fail({ reason: resolved.reason });
  }

  ctx.change.set({ path: ['workEntryId'], value: resolved.value.artifactId });
  if (ctx.state.get({ path: ['status'] }) === 'pending') {
    ctx.change.set({ path: ['status'], value: 'done' });
  }
  return ctx.success({ artifactId: resolved.value.artifactId });
}) satisfies FlowExecutable;

const channel = {
  executable: ((ctx) => ctx.selectSto('consume', 'Resolve and consume the configured artifact')) satisfies ChannelExecutable,
};

export const flatCommandTenantProcess = TenantProcess.define({
  id: { tenant: 'TaskStream', process: 'FlatCommandTest' },
  name: 'Flat Command Test',
  version: 1,
  description: 'Command-file fixture with Flow-owned artifact resolution.',
}, ({ tp }) => {
  const stateDefinitions = tp.stateDefinitions({
    work: {
      id: 'work',
      version: 1,
      strict: true,
      defaults: { status: 'pending', workEntryRef: '', workEntryId: '' },
      fields: {
        status: { type: 'enum', values: ['pending', 'done'] as const },
        workEntryRef: { type: 'string' },
        workEntryId: { type: 'string' },
      },
    },
  });
  const channels = tp.channels({ work: channel });
  tp.inputContracts({});
  tp.resultContracts({});
  const stos = tp.stos({ consume: { flow: consumeArtifactFlow } });
  tp.tasks({
    work: {
      activationFlow: { flowId: 'activate', executable: activationFlow },
      stateDefinition: stateDefinitions.work,
      channel: channels.work,
      stos: { consume: stos.consume },
      defaultSto: stos.consume,
    },
  });
});
