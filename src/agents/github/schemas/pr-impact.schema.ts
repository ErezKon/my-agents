import {z} from 'zod';

export const PrImpactSchema = z.object({
    prSummary: z
        .string()
        .describe('A concise summary of what the PR changes: purpose, scope, and key modifications'),

    changedFiles: z
        .array(z.object({
            file: z.string().describe('File path that was changed'),
            changeType: z.enum(['added', 'modified', 'removed', 'renamed']).describe('Type of change'),
            summary: z.string().describe('Brief description of what changed in this file'),
        }))
        .describe('List of changed files with summaries of what changed in each'),

    affectedEndpoints: z
        .array(z.object({
            method: z.string().describe('HTTP method (GET, POST, PUT, DELETE, etc.)'),
            path: z.string().describe('The endpoint path (e.g. /api/login, /im/types/Command/instances)'),
            sourceRepo: z.string().describe('The repository that exposes this endpoint'),
            changeDescription: z.string().describe('What changed about this endpoint — e.g. signature change, logic change, removed, new behavior'),
            consumers: z.array(z.object({
                repo: z.string().describe('The consuming repository or service name'),
                usage: z.string().describe('How this consumer uses the endpoint (e.g. \'calls during deployment to fetch devices\')'),
                potentialEffect: z.string().describe('What could break or change for this consumer as a result of the PR changes'),
                severity: z.enum(['breaking', 'behavioral', 'cosmetic', 'none']).describe('Severity of the impact on this consumer'),
            })).describe('List of external consumers that call this endpoint and how they might be affected'),
        }))
        .describe('Endpoints affected by the PR changes and their downstream consumers'),

    affectedDatabases: z
        .array(z.object({
            database: z.string().describe('Database name (e.g. asm_dev, encryptionmgr)'),
            table: z.string().describe('Table name that is affected'),
            sourceRepo: z.string().describe('The repository that owns/uses this table'),
            changeDescription: z.string().describe('What changed — schema change, new column, removed field, query change, etc.'),
            consumers: z.array(z.object({
                repo: z.string().describe('The consuming repository or service name'),
                usage: z.string().describe('How this consumer uses the table (e.g. \'reads factsets for device discovery\')'),
                potentialEffect: z.string().describe('What could break or change for this consumer'),
                severity: z.enum(['breaking', 'behavioral', 'cosmetic', 'none']).describe('Severity of the impact'),
            })).describe('List of services that read/write this table and how they might be affected'),
        }))
        .describe('Database tables affected by the PR changes and their downstream consumers'),

    affectedServices: z
        .array(z.object({
            service: z.string().describe('The external service or messaging system affected (e.g. NATS, ActiveMQ, Keycloak)'),
            sourceRepo: z.string().describe('The repository where the change occurs'),
            changeDescription: z.string().describe('What changed about the service interaction'),
            consumers: z.array(z.object({
                repo: z.string().describe('The consuming repository or service'),
                usage: z.string().describe('How this consumer interacts with the service'),
                potentialEffect: z.string().describe('What could break or change'),
                severity: z.enum(['breaking', 'behavioral', 'cosmetic', 'none']).describe('Severity of the impact'),
            })).describe('Other repos/services affected by this change'),
        }))
        .describe('External services (messaging, auth, etc.) affected by the PR and downstream impact'),

    riskAssessment: z.object({
        overallRisk: z.enum(['critical', 'high', 'medium', 'low', 'none']).describe('Overall risk level of this PR\'s cross-repo impact'),
        summary: z.string().describe('Executive summary of the risk: what is most likely to break, who should be notified'),
        recommendedActions: z.array(z.string()).describe('Specific actions to mitigate risk — e.g. \'notify team X\', \'update consumer Y\', \'add backward compatibility\''),
    }).describe('Overall risk assessment and recommended actions'),
});
