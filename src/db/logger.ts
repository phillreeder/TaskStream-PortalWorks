import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { InteractionTelemetryEvent } from '../../packages/automation/src/interaction/index.js';

const defaultClient = new PrismaClient();

export type InteractionLogInput = InteractionTelemetryEvent & {
    runId?: string;
    itemId?: string;
    metadata?: Prisma.InputJsonValue;
};

export type InteractionLogger = (input: InteractionLogInput) => Promise<void>;

const buildMetadata = (input: InteractionLogInput): Prisma.InputJsonValue => {
    const baseMetadata = {
        component: input.component,
        action: input.action,
        selector: input.selector,
        status: input.status
    };

    if (typeof input.metadata === 'undefined') {
        return baseMetadata;
    }

    return {
        ...baseMetadata,
        metadata: input.metadata
    };
};

export const createInteractionLogger = (
    client: PrismaClient = defaultClient
): InteractionLogger => {
    return async (input: InteractionLogInput) => {
        await client.log.create({
            data: {
                runId: input.runId ?? null,
                itemId: input.itemId ?? null,
                level: input.level,
                message: input.message,
                metadataJson: buildMetadata(input)
            }
        });
    };
};

export const interactionLogger = createInteractionLogger();
