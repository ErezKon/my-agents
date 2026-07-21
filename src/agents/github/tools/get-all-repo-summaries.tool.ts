import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import {LogColors} from '../../../utils/log-colors.util';

const BASE_SUMMARIES_DIR = path.resolve(__dirname, '../repositories-summary');

export const createGetAllRepoSummariesTool = (summaryVersion?: string) => {
    const SUMMARIES_DIR = summaryVersion
        ? path.join(BASE_SUMMARIES_DIR, summaryVersion)
        : BASE_SUMMARIES_DIR;

    return tool(
    async ({sections}) => {
        console.log(`${LogColors.BRIGHT_CYAN}[get_all_repo_summaries]${LogColors.RESET} INPUT: sections=${sections || 'all'}`);

        try {
            const files = fs.readdirSync(SUMMARIES_DIR).filter((f) => f.endsWith('.md'));

            if (files.length === 0) {
                const msg = 'No repository summaries found.';
                console.log(`${LogColors.BRIGHT_CYAN}[get_all_repo_summaries]${LogColors.RESET} ${msg}`);
                return JSON.stringify({found: false, message: msg});
            }

            const summaries: { repoName: string; file: string; content: string }[] = [];
            const sectionFilters = sections
                ? sections.split(',').map((s: string) => s.trim().toLowerCase())
                : null;

            for (const file of files) {
                const filePath = path.join(SUMMARIES_DIR, file);
                let content = fs.readFileSync(filePath, 'utf-8');

                // If section filters are provided, extract only matching sections
                if (sectionFilters) {
                    content = extractSections(content, sectionFilters);
                }

                const repoName = file
                    .replace('_REPO_SUMMARY.md', '')
                    .replace(/_/g, '-')
                    .toLowerCase();

                summaries.push({repoName, file, content});
            }

            const result = JSON.stringify({
                found: true,
                count: summaries.length,
                summaries,
            });

            console.log(`${LogColors.BRIGHT_CYAN}[get_all_repo_summaries]${LogColors.RESET} OUTPUT: ${summaries.length} summaries loaded (${result.length} chars)`);
            return result;
        } catch (error: any) {
            const errMsg = `Error reading repo summaries: ${error.message}`;
            console.log(`${LogColors.BRIGHT_CYAN}[get_all_repo_summaries]${LogColors.RESET} ERROR: ${errMsg}`);
            return JSON.stringify({found: false, error: errMsg});
        }
    },
    {
        name: 'get_all_repo_summaries',
        description: `Load ALL available repository summaries at once for cross-referencing. Use this when you need to check if a code change affects endpoints, databases, or services used by OTHER repositories. 
Optionally filter to specific sections to reduce token usage. Section filters match markdown headings and include:
- "endpoint" or "api" — REST API endpoint sections
- "database" or "persistence" — database/storage sections  
- "cross-repo" or "dependency" — cross-repo dependency sections
- "workflow" or "flow" — internal workflow sections
If no sections filter is provided, returns full summaries.`,
        schema: z.object({
            sections: z
                .string()
                .optional()
                .describe('Comma-separated section filters, e.g. "endpoint,database,cross-repo". Leave empty for full summaries.'),
        }),
    }
);
};

/**
 * Extracts sections from a markdown document that match the given filter keywords.
 * A "section" is defined as content from a heading (## or ###) to the next heading of the same or higher level.
 */
function extractSections(content: string, filters: string[]): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let capturing = false;
    let captureLevel = 0;

    // Always include the first heading (repo title)
    const titleMatch = lines.findIndex((l) => l.startsWith('# '));
    if (titleMatch >= 0) {
        result.push(lines[titleMatch], '');
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(/^(#{1,4})\s+(.+)/);

        if (headingMatch) {
            const level = headingMatch[1].length;
            const title = headingMatch[2].toLowerCase();

            const matchesFilter = filters.some((filter) => title.includes(filter));

            if (matchesFilter) {
                capturing = true;
                captureLevel = level;
                result.push(line);
            } else if (capturing && level <= captureLevel) {
                // Hit a same-level or higher-level heading that doesn't match → stop
                capturing = false;
            } else if (capturing) {
                // Sub-heading under a matched section → keep capturing
                result.push(line);
            }
        } else if (capturing) {
            result.push(line);
        }
    }

    return result.join('\n');
}
