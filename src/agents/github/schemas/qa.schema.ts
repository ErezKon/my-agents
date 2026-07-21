import {z} from 'zod';

export const RepoQASchema = z.object({
    answer: z
        .string()
        .describe('A clear, detailed answer to the user\'s question about the repository. Reference specific files, code patterns, and architecture when relevant.'),

    sources: z
        .array(z.object({
            file: z.string().describe('File path that was referenced to build the answer'),
            detail: z.string().describe('What was found or relevant in this file'),
        }))
        .describe('List of source files that were consulted to produce this answer'),

    followUpSuggestions: z
        .array(z.string())
        .describe('2-3 suggested follow-up questions the user might want to ask next'),
});
