import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RuntimeScaffoldExecutionError } from './errors.js';
import type { RuntimeScaffoldArtifactRefs, RuntimeScaffoldDescriptor, RuntimeScaffoldExecutionSuccess } from './types.js';

export interface RuntimeScaffoldResultWriterInput {
  readonly executionPath?: string;
  readonly descriptor: RuntimeScaffoldDescriptor;
  readonly result: Omit<RuntimeScaffoldExecutionSuccess, keyof RuntimeScaffoldArtifactRefs>;
  readonly traceSummary: unknown;
}

export class ResultWriter {
  async write(input: RuntimeScaffoldResultWriterInput): Promise<RuntimeScaffoldArtifactRefs> {
    const output = input.descriptor.output;
    const shouldWriteResult = output?.writeResult === true;
    const shouldWriteTrace = output?.writeTrace === true;
    const shouldWriteNextState = output?.writeNextState === true;

    if (!shouldWriteResult && !shouldWriteTrace && !shouldWriteNextState) {
      return {};
    }

    const outputDir = resolveOutputDir(output?.outputDir, input.executionPath, input.descriptor.id);

    try {
      await mkdir(outputDir, { recursive: true });

      const refs: {
        resultArtifactRef?: string;
        traceRef?: string;
        proposedStateArtifactRef?: string;
      } = {};

      if (shouldWriteResult) {
        const resultPath = path.join(outputDir, 'runtime-spine-result.json');
        await writeJson(resultPath, input.result);
        refs.resultArtifactRef = resultPath;
      }

      if (shouldWriteTrace) {
        const tracePath = path.join(outputDir, 'runtime-spine-trace-summary.json');
        await writeJson(tracePath, input.traceSummary);
        refs.traceRef = tracePath;
      }

      if (shouldWriteNextState) {
        const proposedStatePath = path.join(outputDir, 'runtime-spine-proposed-state.json');
        await writeJson(proposedStatePath, input.result.proposedState);
        refs.proposedStateArtifactRef = proposedStatePath;
      }

      return refs;
    } catch (error) {
      throw new RuntimeScaffoldExecutionError({
        message: `Unable to write RuntimeScaffold result artifacts: ${outputDir}`,
        code: 'RESULT_WRITE_FAILED',
        phase: 'result-writing',
        path: outputDir,
        cause: error,
      });
    }
  }
}

function resolveOutputDir(outputDir: string | undefined, executionPath: string | undefined, descriptorId: string): string {
  if (outputDir) {
    if (path.isAbsolute(outputDir)) {
      return path.normalize(outputDir);
    }
    const baseDirectory = executionPath ? path.dirname(executionPath) : process.cwd();
    return path.resolve(baseDirectory, outputDir);
  }

  return path.resolve(process.cwd(), 'test-results', 'runtime-scaffold', descriptorId);
}

function writeJson(filePath: string, value: unknown): Promise<void> {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
