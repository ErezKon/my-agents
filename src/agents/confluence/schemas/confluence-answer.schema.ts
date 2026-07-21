import {z} from 'zod';

export const ConfluenceAnswerSchema = z.object({
    answer: z
        .string()
        .describe('A concise, well-structured answer to the user\'s question, synthesized from all relevant Confluence documents found'),

    confidence: z
        .enum(['high', 'medium', 'low'])
        .describe('How confident the answer is based on the quality and relevance of documents found'),

    documentReferences: z
        .array(z.object({
            pageId: z.string().describe('The Confluence page ID'),
            title: z.string().describe('The page title'),
            spaceKey: z.string().describe('The Confluence space key where this page lives'),
            webUrl: z.string().describe('Direct URL to the page in Confluence'),
            relevance: z.string().describe('Brief explanation of why this document is relevant to the answer'),
        }))
        .describe('All Confluence documents that were used to construct the answer, with relevance explanations'),

    summary: z
        .string()
        .describe('A brief 2-3 sentence executive summary of the findings across all documents'),

    keyFindings: z
        .array(z.string())
        .describe('The most important facts, procedures, or insights extracted from the documents'),

    gaps: z
        .array(z.string())
        .describe('Any information gaps identified — topics the user asked about that were not fully covered by the documents found'),
});
