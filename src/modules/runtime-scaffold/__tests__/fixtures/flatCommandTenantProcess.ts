import { TenantProcess } from '../../../../domain/tenantProcess/index.js';
import type { ChannelExecutable, FlowExecutable } from '../../../../domain/tenantProcess/index.js';

const activationFlow = (async (ctx, input) => {
  await ctx.unit.create({ type: 'source', data: { sourceId: input.sourceId } });
  return ctx.success();
}) satisfies FlowExecutable;

const consumeArtifactFlow = (async (ctx) => {
  const artifactId = ctx.state.get({ path: ['workEntryId'] });
  if (typeof artifactId !== 'string' || artifactId.length === 0) {
    return ctx.fail({ reason: 'workEntryId artifact reference is required' });
  }
  const artifact = await ctx.artifact.get({ artifactId });
  if (artifact.status !== 'succeeded' || !artifact.value) {
    return ctx.fail({ reason: `artifact not found: ${artifactId}` });
  }
  if (ctx.state.get({ path: ['status'] }) === 'pending') {
    ctx.change.set({ path: ['status'], value: 'done' });
  }
  return ctx.success({ artifactId });
}) satisfies FlowExecutable;

const channel = {
  executable: ((ctx) => ctx.selectSto('consume', 'Consume the configured artifact')) satisfies ChannelExecutable,
};

export const flatCommandTenantProcess = TenantProcess.define({
  id: { tenant: 'TaskStream', process: 'FlatCommandTest' },
  name: 'Flat Command Test',
  version: 1,
  description: 'Command-file and initial-state artifact resolution fixture.',
}, ({ tp }) => {
  const stateDefinitions = tp.stateDefinitions({
    work: {
      id: 'work',
      version: 1,
      strict: true,
      defaults: { status: 'pending', workEntryId: '' },
      fields: {
        status: { type: 'enum', values: ['pending', 'done'] as const },
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
