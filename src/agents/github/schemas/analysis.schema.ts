import {z} from 'zod';

export const AnalysisSchema = z.object({
    summary: z
        .string()
        .describe('A concise 2-3 sentence summary of what this repository is and what it does'),

    architecture: z
        .string()
        .describe('Description of the overall architecture: patterns used, how components are organized, data flow'),

    techStack: z
        .array(z.object({
            name: z.string().describe('Technology or framework name'),
            role: z.string().describe('What role it plays in the project (e.g., \'web framework\', \'ORM\', \'testing\')'),
        }))
        .describe('Key technologies and frameworks used in the project'),

    keyComponents: z
        .array(z.object({
            name: z.string().describe('Component or module name'),
            path: z.string().describe('File or directory path'),
            purpose: z.string().describe('What this component does and why it exists'),
        }))
        .describe('The most important modules, services, or components in the codebase'),

    observations: z
        .array(z.string())
        .describe('Notable observations about code quality, patterns, anti-patterns, or architectural decisions'),

    recommendations: z
        .array(z.object({
            title: z.string().describe('Short title for the recommendation'),
            description: z.string().describe('Detailed explanation of what to improve and why'),
            priority: z.enum(['high', 'medium', 'low']).describe('Impact priority'),
        }))
        .describe('Actionable recommendations for improving the codebase'),
});
