import * as fs from 'fs';
import * as path from 'path';
import {LogColors} from './log-colors.util';
import {createOutputDir, saveRequestJson, saveResponseJson} from './save-output-base';

const TAG = 'save-github-output';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a camelCase or PascalCase key into a readable title. */
function camelToTitle(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Structured-response → Markdown
// ---------------------------------------------------------------------------

/**
 * Recursively converts a JSON value into markdown lines.
 * `depth` controls heading level (2 = ##, 3 = ###, …). Beyond 4 we switch
 * to bold labels instead of headings to avoid excessive nesting.
 */
function jsonToMdLines(value: unknown, depth: number, parentKey?: string): string[] {
    if (value === null || value === undefined) return ['_None_'];

    // Primitive
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)];
    }

    // Array
    if (Array.isArray(value)) {
        if (value.length === 0) return ['_None_'];

        // Array of primitives → bullet list
        if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
            return value.map((v) => `- ${String(v)}`);
        }

        // Array of objects → numbered sub-sections
        const lines: string[] = [];
        value.forEach((item, idx) => {
            // Try to pick a label for the item
            const label = itemLabel(item, idx, parentKey);
            if (depth <= 4) {
                lines.push(`${'#'.repeat(depth + 1)} ${label}`);
            } else {
                lines.push(`**${label}**`);
            }
            lines.push('');
            lines.push(...objectToMdLines(item, depth + 1));
            lines.push('');
        });
        return lines;
    }

    // Object
    if (typeof value === 'object') {
        return objectToMdLines(value as Record<string, unknown>, depth);
    }

    return [String(value)];
}

/** Render an object's key/value pairs as markdown. */
function objectToMdLines(obj: Record<string, unknown>, depth: number): string[] {
    const lines: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
        const title = camelToTitle(key);

        // Nested array or object → heading or bold label
        if (Array.isArray(val) || (val !== null && typeof val === 'object')) {
            if (depth <= 4) {
                lines.push(`${'#'.repeat(depth)} ${title}`);
            } else {
                lines.push(`**${title}:**`);
            }
            lines.push('');
            lines.push(...jsonToMdLines(val, depth, key));
            lines.push('');
        } else {
            // Scalar → inline bold label
            lines.push(`**${title}:** ${val ?? '_None_'}`);
            lines.push('');
        }
    }

    return lines;
}

/** Pick a human-readable label for an array item. */
function itemLabel(item: any, idx: number, parentKey?: string): string {
    if (typeof item !== 'object' || item === null) return `Item ${idx + 1}`;

    // Endpoint-like
    if (item.method && item.path) return `${item.method} ${item.path}`;
    // File-like
    if (item.file) return item.file;
    // Consumer-like
    if (item.repo) return item.repo;
    // Service-like
    if (item.service) return item.service;
    // Database-like
    if (item.database && item.table) return `${item.database}.${item.table}`;
    // Name-like
    if (item.name) return item.name;
    // Title-like
    if (item.title) return item.title;

    return `${parentKey ? camelToTitle(parentKey) : 'Item'} ${idx + 1}`;
}

/**
 * Convert the full `structuredResponse` object into a markdown string.
 * Top-level keys become `##` headings; nesting increases from there.
 */
export function structuredResponseToMarkdown(obj: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        const heading = camelToTitle(key);
        lines.push(`## ${heading}`);
        lines.push('');
        lines.push(...jsonToMdLines(value, 3, key));
        lines.push('');
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------------------------------------------------------------------------
// Tool-calls extraction (bonus)
// ---------------------------------------------------------------------------

interface ToolCallEntry {
    step: number;
    toolName: string;
    args: Record<string, unknown>;
}

/**
 * Walk the messages array from the full response and extract tool calls
 * in the order they were made.
 */
export function extractToolCalls(messages: any[]): ToolCallEntry[] {
    if (!Array.isArray(messages)) return [];

    const calls: ToolCallEntry[] = [];
    let step = 0;

    for (const msg of messages) {
        const kwargs = msg?.kwargs;
        if (!kwargs) continue;

        // AIMessage with tool_calls
        const toolCalls: any[] = kwargs.tool_calls ?? kwargs.additional_kwargs?.tool_calls ?? [];
        if (toolCalls.length === 0) continue;

        for (const tc of toolCalls) {
            step++;
            const name = tc.name ?? tc.function?.name ?? 'unknown';
            let args: Record<string, unknown> = {};
            if (tc.args && typeof tc.args === 'object') {
                args = tc.args;
            } else if (tc.function?.parsed_arguments) {
                args = tc.function.parsed_arguments;
            } else if (tc.function?.arguments) {
                try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            }
            calls.push({ step, toolName: name, args });
        }
    }

    return calls;
}

/** Format extracted tool calls as a markdown section. */
function toolCallsToMarkdown(calls: ToolCallEntry[]): string {
    if (calls.length === 0) return '';

    const lines: string[] = [
        '## Tool Calls',
        '',
    ];

    for (const call of calls) {
        lines.push(`${call.step}. **${call.toolName}**`);

        const argEntries = Object.entries(call.args);
        if (argEntries.length > 0) {
            for (const [k, v] of argEntries) {
                const display = typeof v === 'string' ? v : JSON.stringify(v);
                lines.push(`   - \`${k}\`: ${display}`);
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function saveGitHubAgentOutput(
    agentName: string,
    request: Record<string, any>,
    fullResponse: any
): string | null {
    try {
        const query = request.message || request.query || JSON.stringify(request);
        const outputDir = createOutputDir(agentName, query, TAG);

        saveRequestJson(outputDir, request, TAG);
        saveResponseJson(outputDir, fullResponse, TAG);

        // Build markdown from structuredResponse
        const structured = fullResponse?.structuredResponse
            ?? fullResponse?.model_request?.structuredResponse;

        if (structured && typeof structured === 'object') {
            let md = `# ${camelToTitle(agentName)} Report\n\n`;
            md += structuredResponseToMarkdown(structured);

            // Append tool calls section
            const messages = fullResponse?.model_request?.messages
                ?? fullResponse?.messages;
            if (messages) {
                const calls = extractToolCalls(messages);
                const toolCallsMd = toolCallsToMarkdown(calls);
                if (toolCallsMd) {
                    md += '\n---\n\n' + toolCallsMd;
                }
            }

            const mdPath = path.join(outputDir, 'response-markdown.md');
            fs.writeFileSync(mdPath, md, 'utf-8');
            console.log(`${TAG} Saved response-markdown.md (${md.length} chars)`);
        } else {
            console.log(`${TAG} No structuredResponse found, skipping response-markdown.md`);
        }

        return outputDir;
    } catch (err: any) {
        console.error(`${TAG} ERROR saving output:`, err.message);
        return null;
    }
}
