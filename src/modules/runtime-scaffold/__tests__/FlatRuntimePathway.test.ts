import { readdir, readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TenantProcess } from '../../../domain/tenantProcess/index.js';
import type { ChannelExecutable, FlowExecutable } from '../../../domain/tenantProcess/index.js';
import { RuntimeScaffold } from '../RuntimeScaffold.js';

const activationFlow = (async (ctx, input) => {
  if (ctx.execution?.kind !== 'task-activation' || ctx.stoRef !== undefined) {
    throw new Error('Activation Flow received an STO-backed execution context');
  }
  await ctx.unit.create({
    type: 'source-work',
    data: { sourceId: input.sourceId },
  });
  return ctx.success({ activated: true });
}) satisfies FlowExecutable;

const prepareFlow = (async (ctx, input) => {
  if (ctx.execution?.kind !== 'stream-flow' || ctx.execution.stoRef !== 'prepare') {
    throw new Error('Prepared Flow did not receive its concrete Stream/STO binding');
  }
  ctx.change.set({ path: ['sourceId'], value: input.sourceId });
  ctx.change.set({ path: ['status'], value: 'prepared' });
  await ctx.artifact.save({
    name: 'prepared.json',
    content: { sourceId: input.sourceId },
  });
  await ctx.unit.create({
    type: 'derived-work',
    data: { sourceId: input.sourceId },
  });
  await ctx.logger.info({ message: 'Prepared flat runtime work' });
  return ctx.success();
}) satisfies FlowExecutable;

const inspectFlow = (async (ctx) => {
  const units = await ctx.unit.list();
  const artifacts = await ctx.artifact.list();
  return ctx.success({ units, artifacts });
}) satisfies FlowExecutable;

const taskChannel = {
  executable: ((ctx) => ctx.state.read('status') === 'pending'
    ? ctx.selectSto('prepare', 'Work is pending')
    : ctx.selectSto('inspect', 'Work is prepared')) satisfies ChannelExecutable,
};

const flatTestTenantProcess = TenantProcess.define({
  id: { tenant: 'TaskStream', process: 'FlatScaffoldTest' },
  name: 'Flat Scaffold Test',
  version: 1,
  description: 'Canonical TenantProcess used to verify the flat RuntimeScaffold pathway.',
}, ({ tp }) => {
  const stateDefinitions = tp.stateDefinitions({
    work: {
      id: 'work',
      version: 1,
      strict: true,
      defaults: { status: 'pending', sourceId: '' },
      fields: {
        status: { type: 'enum', values: ['pending', 'prepared'] as const },
        sourceId: { type: 'string' },
      },
    },
  });
  const channels = tp.channels({ work: taskChannel });
  tp.inputContracts({});
  tp.resultContracts({});
  const stos = tp.stos({
    prepare: { flow: prepareFlow },
    inspect: { flow: inspectFlow },
  });
  tp.tasks({
    work: {
      activationFlow: { flowId: 'activateWork', executable: activationFlow },
      stateDefinition: stateDefinitions.work,
      channel: channels.work,
      stos: { prepare: stos.prepare, inspect: stos.inspect },
      defaultSto: stos.prepare,
    },
  });
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('RuntimeScaffold flat pathway', () => {
  it('runs activation, Channel selection and Flows in memory while persisting only to the filesystem', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'taskstream-flat-scaffold-'));
    const scaffold = new RuntimeScaffold();

    const result = await scaffold.executeFlat({
      tenantProcess: flatTestTenantProcess,
      taskRef: 'work',
      runtimeRoot,
      runId: 'flat-test-run',
      input: { sourceId: 'source-1' },
    });

    expect(result.status).toBe('succeeded');
    expect(result.unitIds).toHaveLength(1);
    expect(result.streamResults).toHaveLength(1);
    expect(result.streamResults[0]).toMatchObject({
      status: 'succeeded',
      stepCount: 2,
      finalState: { status: 'prepared', sourceId: 'source-1' },
    });

    const run = await readJson(join(result.runDirectory, 'run.json'));
    expect(run).toMatchObject({ runId: 'flat-test-run', status: 'succeeded', taskRef: 'work' });

    const cycle = await readJson(join(result.runDirectory, 'cycles', `${result.cycleId}.json`));
    expect(cycle.unitIds).toEqual(result.unitIds);
    expect(cycle.streamIds).toHaveLength(1);

    const streamId = result.streamResults[0]!.streamId;
    const stream = await readJson(join(result.runDirectory, 'streams', streamId, 'stream.json'));
    const state = await readJson(join(result.runDirectory, 'streams', streamId, 'state.json'));
    expect(stream).toMatchObject({ status: 'succeeded', stepCount: 2, unitId: result.unitIds[0] });
    expect(state).toEqual({ status: 'prepared', sourceId: 'source-1' });

    const unitFiles = (await readdir(join(result.runDirectory, 'units'))).filter((file) => file.endsWith('.json'));
    const artifactFiles = (await readdir(join(result.runDirectory, 'artifacts'))).filter((file) => file.endsWith('.json'));
    expect(unitFiles).toHaveLength(2);
    expect(artifactFiles).toHaveLength(1);

    const trace = await readFile(join(result.runDirectory, 'trace.ndjson'), 'utf8');
    expect(trace).toContain('unit.created');
    expect(trace).toContain('flow-started');
    expect(trace).toContain('prepare');
    expect(trace).toContain('inspect');
  });

  it('materialises one Stream per Unit created by activation', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'taskstream-flat-scaffold-multi-'));
    const process = {
      ...flatTestTenantProcess,
      tasks: {
        ...flatTestTenantProcess.tasks,
        work: {
          ...flatTestTenantProcess.tasks.work,
          activationFlow: {
            flowId: 'multiActivation',
            executable: (async (ctx, input) => {
              await ctx.unit.create({ type: 'source-work', data: { sourceId: input.sourceId, part: 1 } });
              await ctx.unit.create({ type: 'source-work', data: { sourceId: input.sourceId, part: 2 } });
              return ctx.success();
            }) satisfies FlowExecutable,
          },
        },
      },
    } as typeof flatTestTenantProcess;

    const result = await new RuntimeScaffold().executeFlat({
      tenantProcess: process,
      taskRef: 'work',
      runtimeRoot,
      runId: 'flat-multi-run',
      input: { sourceId: 'source-2' },
    });

    expect(result.status).toBe('succeeded');
    expect(result.unitIds).toHaveLength(2);
    expect(result.streamResults).toHaveLength(2);
    expect(result.streamResults.every((stream) => stream.status === 'succeeded')).toBe(true);
  });

  it('fails clearly when activation succeeds without creating an initial Unit', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'taskstream-flat-scaffold-empty-'));
    const process = {
      ...flatTestTenantProcess,
      tasks: {
        ...flatTestTenantProcess.tasks,
        work: {
          ...flatTestTenantProcess.tasks.work,
          activationFlow: {
            flowId: 'emptyActivation',
            executable: ((ctx) => ctx.success()) satisfies FlowExecutable,
          },
        },
      },
    } as typeof flatTestTenantProcess;

    const result = await new RuntimeScaffold().executeFlat({
      tenantProcess: process,
      taskRef: 'work',
      runtimeRoot,
      runId: 'flat-empty-run',
    });

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('without creating a Unit');
    expect(result.streamResults).toEqual([]);
  });
});
